var len_sid_random = 13;
var keylength = "1024";
var auth_key_length = "1024";
var exp = "03";
var qmod = new BigInteger("239", 10); // TODO: make it BIGGER
var pmod = new BigInteger("479", 10); // TODO: make it BIGGER
var random = new SecureRandom();

/**
 * Simple log function
 * @param {string} level Message level
 * @param {string} msg Log message
 */
function log(level, msg) {
    //TODO: something more adequate
    switch(level) {
        case "alert":
            alert(msg);
            console.log(msg);
        break;
        case "info":
            console.log(msg);
        break;
        default:
            console.log(msg);
    }
}

/**
 * Check obj for being an array or dict.
 * Yup, dict, in JS!
 * @param {type} obj object to be checked
 * @returns {Boolean}
 */
function isObject(obj) {
    return obj && (typeof obj === "object");
}

/**
 * Merges arrays and dictionaries.
 * Merging depth: 2
 * @param {Array | Object} src
 * @param {Array | Object} dest
 */
function my_extend(src, dest) {
    for (var key in dest) {
        if ((key in src) && (isObject(src[key]))) {
            $.extend(src[key], dest[key]);
//            for (var skey in dest[dkey])
//            {
//                src[dkey][skey] = dest[dkey][skey];
//            }
        } else {
            src[key] = dest[key];
        }
    }
}

/**
 * Generates RSA key pair
 * @param {type} length Key length
 * @returns {Array} [PrivateKey, PublicKey]
 */
var generatePair = function(length) {
    var rsaPrivateKey = new RSAKey();
    rsaPrivateKey.generate(length, exp);
    var rsaPubKey = cryptico.publicKeyString(rsaPrivateKey);
    return [rsaPrivateKey, rsaPubKey];
};

/**
 * Generates big random number
 * @returns {BigInteger}
 */
var generateNumber = function() {
    var randBytes = new Array(len_sid_random);
    random.nextBytes(randBytes);
    return new BigInteger(randBytes);
};

/**
 * TODO
 * @param {type} length
 * @returns {Array}
 */
var generateExpPair = function(length) {
    var randBigNumber = generateNumber();
    randBigNumber = randBigNumber.mod(qmod);
    var ex = new BigInteger(exp, 10);
    var b = ex.modPowInt(randBigNumber, pmod);
    return [randBigNumber, b];
};

/**
 * Round class.
 * Yup, class in JS!
 * @returns {Round}
 */
function Round() {}

/**
 * Indicates if round data was sended
 * @type Boolean
 */
Round.prototype.sended = false;

/**
 * Number of peers that succesfully 
 * sent us round data
 * @type Number
 */
Round.prototype.received = 0;

round1 = new Round();
round1.name = "round 1";
round1.send = function(context) {
    var result = {};
    var my_k = new Array(len_sid_random);
    random.nextBytes(my_k);

    my_k = my_k.map(function(el){ return String.fromCharCode(el);}).join("");
    var my_k_hashed = sha256.hex(my_k);

    var long_pair = generateExpPair(keylength);
    var longterm = long_pair[0];
    var pub_longterm = long_pair[1];

    var eph_pair = generatePair(keylength);
    var eph = eph_pair[0];
    var pub_eph = eph_pair[1];

    result["update"] = { "myLongPubKey": pub_longterm };
    result["update"]["myLongPrivKey"] = longterm;
    result["update"]["myEphPrivKey"] = eph;
    result["update"]["myEphPubKey"] = pub_eph;
    result["update"]["k_i"] = my_k;

    result["update"]["hashedNonceList"] = {};
    result["update"]["longtermPubKeys"] = {};
    result["update"]["ephPubKeys"] = {};
    result["update"]["hashedNonceList"][context.client.peer.id] = my_k_hashed;
    result["update"]["longtermPubKeys"][context.client.peer.id] = pub_longterm;
    result["update"]["ephPubKeys"][context.client.peer.id] = pub_eph;

    result["status"] = "OK";

    var s = "auth:0:" + my_k_hashed + ":" + pub_longterm + ":" + pub_eph;
    context.client.sendMessage(s, "mpOTR");
    this.sended = true;
    return result;
};

round1.receive = function(peer, msg, context) {
    var result = {};
    result["update"] = {};
    result["update"]["hashedNonceList"] = {};
    result["update"]["longtermPubKeys"] = {};
    result["update"]["ephPubKeys"] = {};
    result["update"]["hashedNonceList"][peer] = msg[0];
    result["update"]["longtermPubKeys"][peer] = new BigInteger(msg[1]);
    result["update"]["ephPubKeys"][peer] = msg[2];
    result["status"] = "OK";

    this.received += 1; //TODO: check peer!
    return result;
};

round2 = new Round();
round2.name = "round 2";

round2.send = function(context) {
    var result = {
        "update": {},
        "status": "FAIL"
    };
    var sid_raw = "";

    var hn = context.hashedNonceList;
    var hna = Object.keys(context.hashedNonceList);
    // I HATE JAVASCRIPT
    // THIS SHIT ITERATE DICT IN THE ORDER OF ADDING KEYS
    // so sort and iterate in alphabetic order
    // TODO: think about rewriting in array [{key1:value1}, {key2:value2}, ...]
    hna.sort();
    for (var i = 0; i < hna.length; ++i) {
        sid_raw = sid_raw + hn[hna[i]];
    }

    var sid = sha256.hex(sid_raw);
    result.update.sid = sid;

    var auth_pair = generateExpPair(auth_key_length);
    var r_i = auth_pair[0];
    var exp_r_i = auth_pair[1];
    result.update.r_i = r_i;
    result.update.exp_r_i = exp_r_i;

    result["status"] = "OK";
    var s = "auth:1:" + sid + ":" + exp_r_i;
    result["update"]["expAuthNonce"] = {};
    result["update"]["expAuthNonce"][context.client.peer.id] = exp_r_i;
    context.client.sendMessage(s, "mpOTR");
    this.sended = true;
    return result;
};

round2.receive = function(peer, msg, context) {
    var result = {
        "update": {},
        "status": "OK"
    };
    if ((msg[0] !== context.sid) && (context.sid !== undefined)) {
        // sid can be still undefined;
        // in that case this check will fail
        // in another place. TODO: check in sid generation
        result["status"] = "WRONG SESSION ID";
    } else {
        result["update"]["expAuthNonce"] = {};
        result["update"]["expAuthNonce"][peer] = new BigInteger(msg[1]);
    }
    this.received += 1;
    return result;
};

round3 = new Round();
round3.name = "round 3";

var xor = function(a, b) {
    s = "";
    for (var i = 0; (i < a.length) && (i < b.length); ++i) {
        var c = a.charCodeAt(i);
        var d = b.charCodeAt(i);
        s += String.fromCharCode(c ^ d);
    }
    return s;
};

round3.send = function(context) {
    var result = {
        "update": {},
        "status": "OK"
    };

    var lpk = context.longtermPubKeys;
    var lpka = Object.keys(lpk);
    lpka.sort();
    var left_pub_key;
    var right_pub_key;
    for (var i = 0; i < lpka.length; ++i) {
        if (lpka[i] === context.client.peer.id) {
            var num_left = i - 1;                             // URRR, -1 % 3 === -1
            while (num_left < 0) { num_left += lpka.length; }
            left_pub_key = lpk[lpka[num_left]];
            var num_right = (i + 1) % lpka.length;
            right_pub_key = lpk[lpka[(i + 1) % lpka.length]];
        }
    }

    var t_left_raw = left_pub_key.modPowInt(context.myLongPrivKey.toString(), pmod);
    var t_right_raw = right_pub_key.modPowInt(context.myLongPrivKey.toString(), pmod);
    var t_left_hashed = sha256.hex(t_left_raw.toString());
    var t_right_hashed = sha256.hex(t_right_raw.toString());
    var bigT = xor(t_left_hashed, t_right_hashed);
    var xoredNonce = xor(context.k_i, t_right_hashed);

    result.update["my_t_left"] = t_left_hashed;
    result.update["my_t_right"] = t_right_hashed;
    result.update["xoredNonce"] = {};
    result.update["xoredNonce"][context.client.peer.id] = xoredNonce;
    result.update["bigT"] = {};
    result.update["bigT"][context.client.peer.id] = bigT;
    result.update["myBigT"] = bigT;

    var s = "auth:2:" + xoredNonce + ":" + bigT;
    context.client.sendMessage(s, "mpOTR");
    this.sended = true;

    return result;
};

round3.receive = function(peer, msg, context) {
    var result = {
        "update": {},
        "status": "OK"
    };

    result["update"]["xoredNonce"] = {};
    result["update"]["bigT"] = {};
    result["update"]["xoredNonce"][peer] = msg[0];
    result["update"]["bigT"][peer] = msg[1];
    this.received += 1;
    return result;
};

round4 = new Round();
round4.name = "round 4";

round4.send = function(context) {
    var result = {
        "update": {},
        "status": "OK"
    };
// decrypt nonces here
    xored_nonces = context.xoredNonce;
    xored_nonces_keys = Object.keys(xored_nonces);
    xored_nonces_keys.sort();
    nonces = {};

    var t_R = context.my_t_right;
    var i = xored_nonces_keys.indexOf(context.client.peer.id);
    for(var j = i; (j - i) < xored_nonces_keys.length; ++j) {
        var peer_name = xored_nonces_keys[(j + 1) % xored_nonces_keys.length];
        t_R = xor(t_R, context.bigT[peer_name]);
        nonces[peer_name] = xor(xored_nonces[peer_name], t_R);
    }

    for(var i in nonces) {
        if (sha256.hex(nonces[i]) !== context.hashedNonceList[i]) {
            result["status"] = "NONCE HASH CHECK FAILED";
            return result;
        }
    }

    var bigTx = context.myBigT;
    for(var i in context.bigT)
    {
        bigTx = xor(bigTx, context.bigT[i]);
    }
    if (bigTx !== context.myBigT) {
        result["status"] = "BIG T XOR SUM IS NOT NULL";
    }

    if (result["status"] !== "OK") {
        return result;
    }

    var n = "";
    var sconf = "";
    n += nonces[xored_nonces_keys[0]];
    sconf += "," + context.longtermPubKeys[xored_nonces_keys[0]] + ",";
    sconf += nonces[xored_nonces_keys[0]] + "," + context.ephPubKeys[xored_nonces_keys[0]];
    for (var i = 1; i < xored_nonces_keys.length; ++i) {
        n += nonces[xored_nonces_keys[i]];
        sconf += "," + context.longtermPubKeys[xored_nonces_keys[i]] + ",";
        sconf += nonces[xored_nonces_keys[i]] + "," + context.ephPubKeys[xored_nonces_keys[i]];
    }

    sconf = sha256.hex(sconf);
    var c_i_raw = context.sid + sconf;
    var c_i_hashed = sha256.hex(c_i_raw);
    var c_i_int = new BigInteger(c_i_hashed);
    c_i_int = c_i_int.mod(qmod);
    c_i_hashed = c_i_int.toString();
    var d_i = context.r_i.subtract(context.myLongPrivKey.multiply(c_i_int).mod(qmod)).mod(qmod);
    var sig = context.myEphPrivKey.signStringWithSHA256(c_i_hashed);

    result.update["sessionKey"] = sha256.hex(n);
    result.update["nonce"] = nonces;
    result.update["sconf"] = sconf;
    result.update["d_i"] = d_i;
    result.update["sig"] = sig;
    result.update["c_i"] = c_i_hashed;

    var s = "auth:3:" + d_i + ":" + sig;
    context.client.sendMessage(s, "mpOTR");
    this.sended = true;
    return result;
};

round4.receive = function(peer, msg, context) {
    var result = {
        "update": {},
        "status": "OK"
    };
    var ex = new BigInteger(exp, 10);
    var d_i = new BigInteger(msg[0], 10);
    var exp1 = ex.modPow(d_i, pmod);
    var exp2 = context.longtermPubKeys[peer].modPowInt(context.c_i, pmod);
    var d_check = exp1.multiply(exp2).mod(pmod);

    if (d_check.toString() !== context.expAuthNonce[peer].toString()) {
        result["status"] = "D CHECK FAILED";
        return result;
    }

    var pk = cryptico.publicKeyFromString(context.ephPubKeys[peer]);

    if (!pk.verifyString(context.c_i, msg[1])) {
        result["status"] = "SIGNATURE VERIFYING FAILED";
        return result;
    }

    this.received += 1;
    return result;
};

var process = function(context, callback) {
    var result = callback(context);
    if (result["status"] === "OK") {
        my_extend(context, result["update"]);
    } else {
        log("alert", "mpOTR error: " + result["status"]); // TODO something more adequate
    }
};

var decryptMessage = function(context, text) {
    return cryptico.decryptAESCBC(text, context.sessionKey.slice(0, 32));
};

/**
 * Singleton for mpOTR context
 * @param {Object} client Current peer
 * @returns {mpOTRContext}
 */
function mpOTRContext(client) {
    this.client = client;
    this["status"] = "not started";

    this.rounds = [
        round1,
        round2,
        round3,
        round4
    ];

    this.deliveryRequest = function () {
        var data = {};
        data["type"] = "mpOTRLostMessage";
        data["from"] = this.client.peer.id;

        for (var id of this.client.lostMsg) {
            data["lostMsgID"] = id;
            // TODO: Sign messages
            this.client._sendMessage(data);
        }
    };

    this.deliveryResponse = function (data) {
        var idx;

        // Searching in undelivered messages
        idx = this.client.undelivered.map(function (elem) {
            return elem["messageID"];
        }).indexOf(data["lostMsgID"]);
        if (idx !== -1) {
            return this.client.undelivered[i];
        }

        // Searching in delivered messages
        idx = this.client.delivered.map(function (elem) {
            return elem["messageID"];
        }).indexOf(data["lostMsgID"]);
        if (idx !== -1) {
            return this.client.delivered[i];
        }

        // Not found
        return undefined;
    }

    this.sendMessage = function (text) {
        // TODO: think about keylength 64
        var encryptedText = cryptico.encryptAESCBC(
            text,
            this.sessionKey.slice(0, 32)
        );

        var data = {};
        data["type"] = "mpOTRChat";
        data["from"] = this.client.peer.id;
        data["sid"] = this.sid;
        data["data"] = encryptedText;
        // OldBlue starts
        data["parentsIDs"] = this.client.frontier.slice();
        data["messageID"] = sha256.hex(
            this.client.peer.id +
            this.client.frontier.toString() +
            encryptedText
        );
        data["sig"] = this.signMessage(data);
        // self-deliver
        this.receiveMessage(data);
        // OldBlue ends

        this.client._sendMessage(data);
    };

    this.receiveMessage = function (data) {
        if (!this.checkSig(data, data["from"])) {
            log("alert", "Signature checking failure!");
        }

        // OldBlue
        var index = this.client.lostMsg.indexOf(data["messageID"]);

        if (index > -1) {
            this.client.lostMsg.splice(index, 1);
        }

        // Lost message delivery request
        for (var id of data["parentsIDs"]) {
            if (this.client.undelivered.map(function (elem) {
                    return elem["messageID"];
                }).indexOf(id) === -1 &&
                this.client.delivered.map(function (elem) {
                    return elem["messageID"];
                }).indexOf(id) === -1) {
                this.client.lostMsg.push(id);
            }
        }

        this.deliveryRequest();

        this.client.undelivered.push(data);

        // Looking in undelivered buffer for messages that can be delivered
        // Means all its parents was delivered
        for (var i = this.client.undelivered.length - 1; i >= 0; --i) {
            var candidateToDelivery = this.client.undelivered[i];
            var canBeDelivered = true;

            // Looking for parents of current message in delivered messages
            for (var parent of candidateToDelivery["parentsIDs"]) {
                var parentWasDelivered = false;

                for (var deliveredMsg of this.client.delivered) {
                    if (deliveredMsg["messageID"] === parent) {
                        parentWasDelivered = true;
                        break;
                    }
                }

                if (!parentWasDelivered) {
                    canBeDelivered = false;
                    break;
                }
            }

            if (canBeDelivered) {
                // Removing parents from frontier
                for (var parent of candidateToDelivery["parentsIDs"]) {
                    var j = this.client.frontier.indexOf(parent);

                    if (j > -1) {
                        this.client.frontier.splice(j, 1);
                    }
                }
                // Delivered message now in frontier
                this.client.frontier.push(candidateToDelivery["messageID"]);
                // And officially delivered :)
                this.client.delivered.unshift(candidateToDelivery);
                this.client.undelivered.splice(i, 1);

                var msg = this.decryptMessage(candidateToDelivery["data"]);
                var author = candidateToDelivery["from"];
                writeToChat(author, msg);
                log("info", "got \"" + msg + "\" from " + author);
            }
        }
        // oldBlue ends
    }

    this.decryptMessage = function(text) {
        return decryptMessage(this, text);
    };

    this.receive = function(author, msg) {
        var msgList = msg.split(":");
        switch (msgList[0]) {
            case "init":
                process(this, function(context) {
                    return context.rounds[0].send(this);
                });
                log("info", "init received");
                this["status"] = "auth";
                $("#startmpOTR").prop("disabled", true);
                break;
            case "auth":
                var roundNum = parseInt(msgList[1], 10);
                var round = this.rounds[roundNum];
                process(this, function(context) {
                    return round.receive(author, msgList.slice(2), context);
                });
                if (!round.sended)
                {
                    process(this, function(context) {
                        return round.send(context);
                    });
                } else if (this.client.connPool.length === round.received) {
                    if (roundNum < 3) {
                        process(this, function(context) {
                            return context.rounds[roundNum + 1].send(context);
                        });
                    } else {
                        this["status"] = "chat";
                    }
                }
                log("info", this.status);
                break;
            case "error":
                //TODO: something more adequate
                log("alert", "mpOTR error: " + msg);
                break;
            default:
                //TODO: something more adequate
                log("alert", "Unexpected mpOTR type, message: " + msg);
                break;
        }
    };

    this.signMessage = function(data) {
        return this.myEphPrivKey.signStringWithSHA256(
            data["type"] +
            data["sid"] +
            data["parentsIDs"] +
            data["data"] +
            data["messageID"]
        )
    };

    this.checkSig = function(data, peer) {
        var pk = cryptico.publicKeyFromString(this.ephPubKeys[peer]);

        return pk.verifyString(
            data["type"] +
            data["sid"] +
            data["parentsIDs"] +
            data["data"] +
            data["messageID"],
            data["sig"]
        )
    };
}
