define(['jquery', 'cryptico'], function($) {
    "use strict";

    var len_sid_random = 13;
    var key_length = "1024";
    var auth_key_length = "1024";
    var exp = "03";
    var qmod = new BigInteger("1205156213460516294276038011098783037428475274251229971327058470979054415841306114445046929130670807336613570738952006098251824478525291315971365353402504611531367372670536703348123007294680829887020513584624726600189364717085162921889329599071881596888429934762044470097788673059921772650773521873603874984881875042154463169647779984441228936206496905064565147296499973963182632029642323604865192473605840717232357219244260470063729922144429668263448160459816959", 10);
    var pmod = new BigInteger("2410312426921032588552076022197566074856950548502459942654116941958108831682612228890093858261341614673227141477904012196503648957050582631942730706805009223062734745341073406696246014589361659774041027169249453200378729434170325843778659198143763193776859869524088940195577346119843545301547043747207749969763750084308926339295559968882457872412993810129130294592999947926365264059284647209730384947211681434464714438488520940127459844288859336526896320919633919", 10);
    var random = new SecureRandom();

    /**
     * Simple log function
     * @param {string} level Message level
     * @param {string} msg Log message
     */
    function log(level, msg) {
        switch (level) {
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
            } else {
                src[key] = dest[key];
            }
        }
    }

    /**
     * Generates RSA key pair
     * @param {string} length Key length
     * @returns {Array} [PrivateKey, PublicKey]
     */
    var generatePair = function (length) {
        var rsaPrivateKey = new RSAKey();
        rsaPrivateKey.generate(length, exp);
        var rsaPubKey = cryptico.publicKeyString(rsaPrivateKey);
        return [rsaPrivateKey, rsaPubKey];
    };

    /**
     * Generates big random number
     * @returns {BigInteger}
     */
    var generateNumber = function () {
        var randBytes = new Array(len_sid_random);
        random.nextBytes(randBytes);
        return new BigInteger(randBytes);
    };

    /**
     * TODO
     * @param {string} length
     * @returns {Array}
     */
    var generateExpPair = function (length) {
        var randBigNumber = generateNumber();
        randBigNumber = randBigNumber.mod(qmod);
        var ex = new BigInteger(exp, 10);
        var b = ex.modPow(randBigNumber, pmod);
        return [randBigNumber, b];
    };

    /**
     * Round class.
     * Yup, class in JS!
     * @returns {Round}
     */
    function Round() {
    }

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

    Round.prototype.ready_dict = {};

    /**
     * Method to reset all Round settings
     */
    Round.prototype.reset = function() {
        this.sended = false;
        this.received = 0;
        this.ready_dict = {};
    };

    var round1 = new Round();
    round1.name = "0";
    round1.send = function (context) {
        var result = {};
        var my_k = new Array(len_sid_random);
        random.nextBytes(my_k);

        my_k = my_k.map(function (el) {
            return String.fromCharCode(el);
        }).join("");
        var my_k_hashed = sha256.hex(my_k);

        var long_pair = generateExpPair(key_length);
        var longterm = long_pair[0];
        var pub_longterm = long_pair[1];

        var eph_pair = generatePair(key_length);
        var eph = eph_pair[0];
        var pub_eph = eph_pair[1];

        result["update"] = {"myLongPubKey": pub_longterm};
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

        var message = ["auth", "0", String(my_k_hashed), String(pub_longterm), String(pub_eph)];
        context.client.sendMessage(message, "mpOTR");
        this.sended = true;
        return result;
    };

    round1.receive = function (peer, msg, context) {
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

    var round2 = new Round();
    round2.name = "1";

    round2.send = function (context) {
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
        var message = ["auth", "1", String(sid), String(exp_r_i)];
        result["update"]["expAuthNonce"] = {};
        result["update"]["expAuthNonce"][context.client.peer.id] = exp_r_i;
        context.client.sendMessage(message, "mpOTR");
        this.sended = true;
        return result;
    };

    round2.receive = function (peer, msg, context) {
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

    var round3 = new Round();
    round3.name = "2";

    var xor = function (a, b) {
        var result = "";
        for (var i = 0; (i < a.length) && (i < b.length); ++i) {
            var c = a.charCodeAt(i);
            var d = b.charCodeAt(i);
            result += String.fromCharCode(c ^ d);
        }
        return result;
    };

    round3.send = function (context) {
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
                while (num_left < 0) {
                    num_left += lpka.length;
                }
                left_pub_key = lpk[lpka[num_left]];
                var num_right = (i + 1) % lpka.length;
                right_pub_key = lpk[lpka[(i + 1) % lpka.length]];
            }
        }

        var bigIntLPK = new BigInteger(context.myLongPrivKey.toString(), 10);
        var t_left_raw = left_pub_key.modPow(bigIntLPK, pmod);
        var t_right_raw = right_pub_key.modPow(bigIntLPK, pmod);
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

        var s = ["auth", "2", String(xoredNonce), String(bigT)];
        context.client.sendMessage(s, "mpOTR");
        this.sended = true;

        return result;
    };

    round3.receive = function (peer, msg, context) {
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

    var round4 = new Round();
    round4.name = "3";

    round4.send = function (context) {
        var result = {
            "update": {},
            "status": "OK"
        };
        // decrypt nonces here
        var xored_nonces = context.xoredNonce;
        var xored_nonces_keys = Object.keys(xored_nonces);
        xored_nonces_keys.sort();
        var nonces = {};

        var t_R = context.my_t_right;
        var i = xored_nonces_keys.indexOf(context.client.peer.id);
        for (var j = i; (j - i) < xored_nonces_keys.length; ++j) {
            var peer_name = xored_nonces_keys[(j + 1) % xored_nonces_keys.length];
            t_R = xor(t_R, context.bigT[peer_name]);
            nonces[peer_name] = xor(xored_nonces[peer_name], t_R);
        }

        for (var i in nonces) {
            if (sha256.hex(nonces[i]) !== context.hashedNonceList[i]) {
                result["status"] = "NONCE HASH CHECK FAILED";
                return result;
            }
        }

        var bigTx = context.myBigT;
        for (var i in context.bigT) {
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

        var s = ["auth", "3", String(d_i), String(sig)];
        context.client.sendMessage(s, "mpOTR");
        this.sended = true;
        return result;
    };

    round4.receive = function (peer, msg, context) {
        var result = {
            "update": {},
            "status": "OK"
        };
        var ex = new BigInteger(exp, 10);
        var d_i = new BigInteger(msg[0], 10);
        var exp1 = ex.modPow(d_i, pmod);

        var BigIntC_I = new BigInteger(context.c_i, 10);
        var exp2 = context.longtermPubKeys[peer].modPow(BigIntC_I, pmod);
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

    var process = function (context, callback) {
        var result = callback(context);
        if (result["status"] === "OK") {
            my_extend(context, result["update"]);
        } else {
            log("alert", "mpOTR error: " + result["status"]); // TODO something more adequate
        }
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

        /**
         * Initiates mpOTR session
         */
        this.start = function() {
            if (this.client.connPool.length > 0) {
                this["round"] = 0;
                this.client.sendMessage(["init"], "mpOTR");
                this.emitEvent(this.EVENTS.MPOTR_INIT);
            } else {
                alert("No peers were added");
                this.emitEvent(this.EVENTS.MPOTR_SHUTDOWN_FINISH);
            }
        };

        /**
         * Resets all crypto-properties and rounds
         */
        this.reset = function () {
            this["status"] = "not started";
            this["round"] = 0;
            this.shutdown_received = 0;
            this.shutdown_sended = false;
            this.myLongPubKey = undefined;
            this.myLongPrivKey = undefined;
            this.myEphPrivKey = undefined;
            this.myEphPubKey = undefined;
            this.k_i = undefined;
            this.hashedNonceList = {};
            this.longtermPubKeys = {};
            this.ephPubKeys = {};
            this.expAuthNonce = {};
            this.my_t_left = undefined;
            this.my_t_right = undefined;
            this.xoredNonce = {};
            this.bigT = {};
            this.myBigT = undefined;
            this.sessionKey = undefined;
            this.nonce = undefined;
            this.sconf = undefined;
            this.d_i = undefined;
            this.sig = undefined;
            this.c_i = undefined;
            this.client.frontier = [];
            this.client.lostMsg = [];
            this.client.delivered = [];
            this.client.undelivered = [];
            $.map(this.rounds, function(x) { x.reset(); });
        };
        this.reset();

        /**
         * Sends broadcast request to retrieve
         * a lost message in response
         */
        this.deliveryRequest = function () {
            var data = {
                "type": "mpOTRLostMessage",
                "sid": this.sid
            };

            for (var id of this.client.lostMsg) {
                data["lostMsgID"] = id;
                this.signMessage(data);

                this.client.broadcast(data);
            }
        };

        /**
         * Searches a lost message in message pools.
         * Will return the lost message if founds one.
         * Otherwise returns undefined.
         * @param {object} data Message delivery request
         * @returns {object} Message delivery response
         */
        this.deliveryResponse = function (data) {
            // Searching in undelivered messages
            var idx = this.client.undelivered.map(function (elem) {
                return elem["messageID"];
            }).indexOf(data["lostMsgID"]);
            if (idx !== -1) {
                return this.client.undelivered[idx];
            }

            // Searching in delivered messages
            idx = this.client.delivered.map(function (elem) {
                return elem["messageID"];
            }).indexOf(data["lostMsgID"]);
            if (idx !== -1) {
                return this.client.delivered[idx];
            }

            // Not found
            return undefined;
        };

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
            this.signMessage(data);
            // self-deliver
            this.receiveMessage(data);
            // OldBlue ends

            this.client.broadcast(data);
        };

        this.receiveMessage = function (data) {
            // OldBlue

            // Ignore duplicates
            if (this.client.delivered.filter((elem) => {
                    return elem["messageID"] === data["messageID"];
                }).length > 0 || this.client.undelivered.filter((elem) => {
                    return elem["messageID"] === data["messageID"];
                }).length > 0) {
                return;
            }

            var index = this.client.lostMsg.indexOf(data["messageID"]);

            if (index > -1) {
                this.client.lostMsg.splice(index, 1);
            }

            // Lost message delivery request
            for (var id of data["parentsIDs"]) {
                if (this.client.delivered.filter((elem) => {
                        return elem["messageID"] === id;
                    }).length === 0 && this.client.undelivered.filter((elem) => {
                        return elem["messageID"] === id;
                    }).length === 0) {
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
                    this.client.writeToChat(author, msg);
                    log("info", "got \"" + msg + "\" from " + author);
                }
            }
            // oldBlue ends

            if (this.client.isChatSynced()) {
                this.emitEvent(this.EVENTS.CHAT_SYNCED);
            }
        };

        this.decryptMessage = function (text) {
            return cryptico.decryptAESCBC(text, this.sessionKey.slice(0, 32));
        };

        this.receive = function (author, msg) {
            switch (msg[0]) {
                case "init":
                    process(this, function (context) {
                        return context.rounds[0].send(context);
                    });
                    log("info", "init received");
                    this.emitEvent(this.EVENTS.MPOTR_INIT);
                    this["status"] = "auth";
                    break;
                case "auth":
                    var roundNum = parseInt(msg[1], 10);
                    if ((this["round"] != roundNum) && !((roundNum == (this["round"] + 1)) && (this.rounds[this["round"]].ready))) {
                        log("alert", "somebody tries to break chat");
                        break;
                    }
                    var round_now = this.rounds[roundNum];
                    if (!round_now.sended) {
                        process(this, function (context) {
                            return round_now.send(context);
                        });
                    }

                    process(this, function (context) {
                        return round_now.receive(author, msg.slice(2), context);
                    });

                    if (this.client.connPool.length === round_now.received) {
                        var message = ["ready", String(this.rounds[roundNum]["name"])];
                        this.rounds[this.round].ready = true;
                        this.client.sendMessage(message, "mpOTR")
                    }

                    log("info", this.status);
                    break;
                case "ready":
                    roundNum = parseInt(msg[1], 10);
                    if (((this["round"] + 1) == roundNum) && this.rounds[this["round"]].ready) {
                        break;
                    }
                    if (this["round"] != roundNum) {
                        log("alert", "somebody tries to break chat");
                        break;
                    }
                    this.rounds[roundNum]["ready_dict"][author] = true;
                    var allNodesReady = true;
                    this.client.connPool.peers.forEach(function(peer) {
                        allNodesReady = allNodesReady && this.rounds[roundNum]["ready_dict"][peer];
                    }, this);
                    if (allNodesReady !== true) {
                        break;
                    }
                    if (roundNum < 3) {
                       this["round"] = this["round"] + 1;
                       process(this, function (context) {
                           return context.rounds[roundNum + 1].send(context);
                       });
                    } else {
                        this["round"] = undefined;
                        this["status"] = "chat";
                        log("info", "chat");
                        this.emitEvent(this.EVENTS.MPOTR_START);
                    }
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

        /**
         * Takes object, signs it and adds property 'sig'
         * @param {object} data Object to sign
         */
        this.signMessage = function (data) {
            if ("sig" in data) {
                delete data["sig"];
            }

            var keys = Object.keys(data);
            keys.sort();

            var result = "";
            for (let key of keys) {
                result += data[key];
            }

            data['sig'] = this.myEphPrivKey.signStringWithSHA256(result);
        };

        this.checkSig = function (data, peer) {
            var pk = cryptico.publicKeyFromString(this.ephPubKeys[peer]);
            var keys = Object.keys(data);
            keys.splice(keys.indexOf('sig'), 1);
            keys = keys.sort();

            var result = "";
            for (let key of keys) {
                result += data[key];
            }

            return pk.verifyString(result, data["sig"]);
        };

        this.sendShutdown = function () {
            // TODO: think about keylength 64
            var secret = JSON.stringify(this.myEphPrivKey);
            var encryptedText = cryptico.encryptAESCBC(
                secret,
                this.sessionKey.slice(0, 32)
            );

            var data = {};
            data["type"] = "mpOTRShutdown";
            data["from"] = this.client.peer.id;
            data["sid"] = this.sid;
            data["data"] = encryptedText;
            this.signMessage(data);

            this.client.broadcast(data);

            var result = {
                "status": "OK",
                "update": {
                    "shutdown_sended": true
                }
            };

            return result;
        };

        this.receiveShutdown = function (msg) {
            if (this["status"] == "not started") {
                return false;
            }

            if (!this.shutdown_sended) {
                process(this, function (context) {
                    return context.sendShutdown();
                });
            }

            log("info", "shutdown from " + msg["from"] + " received: " + this.decryptMessage(msg["data"]));

            this.shutdown_received += 1;

            return this.shutdown_received === this.client.connPool.length;
        };

        this.stopChat = function () {
            var promises = [];
            var resolves = {};

            this.emitEvent(this.EVENTS.MPOTR_SHUTDOWN_START);
            this.emitEvent(this.EVENTS.BLOCK_CHAT);

            promises.push(new Promise((resolve) => {
                this.subscribeOnEvent(this.EVENTS.CHAT_SYNCED, resolve, true);
            }));

            for (let peer of this.client.connPool.peers) {
                promises.push(new Promise((resolve) => {
                    resolves[peer] = resolve;
                }))
            }

            this.subscribeOnEvent(this.EVENTS.CHAT_SYNC_RES, (id) => {
                resolves[id]();
            });

            Promise.all(promises).then(() => {
                this.clearEventListeners(this.EVENTS.CHAT_SYNC_RES);
                process(this, function (context) {
                    return context.sendShutdown();
                });
            });

            var data = {
                "type": "chatSyncReq",
                "sid": this.sid,
                "connPool": this.client.connPool.peers.concat(this.client.peer.id)
            };
            this.signMessage(data);
            this.client.broadcast(data);

            if (this.client.isChatSynced()) {
                this.emitEvent(this.EVENTS.CHAT_SYNCED);
            } else {
                this.deliveryRequest();
            }
        };

        /**
         * Events handlers for subscribe / emit system
         */
        this.on = {};

        /**
         * Used for callbacks that must be triggered once
         * in subscribe / emit system
         * @private
         */
        this._oneOff = {};

        /**
         * Adds event listener to the event
         * @param {String} name name of event
         * @param {function} callback event handler
         * @param {Boolean=} oneOff only run once?
         */
        this.subscribeOnEvent = function(name, callback, oneOff) {
            if (!this.on[name]) {
                this.on[name] = [];
            }

            this.on[name].push(callback);

            if (oneOff) {
                if (!this._oneOff[name]) {
                    this._oneOff[name] = [];
                }

                this._oneOff[name].push(callback);
            }
        };

        /**
         * Speaks for itself, doesn't it?
         * @param {String} name name of event
         * @param {Array=} args arguments for event handlers
         */
        this.emitEvent = function(name, args) {
            if (this.on[name]) {
                this.on[name].forEach((elem) => {
                    elem.apply(this, args);
                });
            }

            if (this._oneOff[name]) {
                this._oneOff[name].forEach((elem) => {
                    let idx = this.on[name].indexOf(elem);

                    if (idx > -1) {
                        this.on[name].splice(idx, 1);
                    }
                });
                this._oneOff[name] = [];
            }
        };

        /**
         * Removes subscriber from event specified
         * @param {string} name name of event
         * @param {function} subscriber subscriber
         */
        this.removeSubscriber = function(name, subscriber) {
            let idx = this.on[name].indexOf(subscriber);

            if (idx > -1) {
                this.on[name].splice(idx, 1);
            }
        };

        /**
         * Clears list of handlers for event specified
         * @param {String} name name of event
         */
        this.clearEventListeners = function(name) {
            this.on[name] = [];
            this._oneOff[name] = [];
        };

        /**
         * Still don't have enums in JS :(
         */
        this.EVENTS = {
            MPOTR_INIT: 'mpOTR Init',
            MPOTR_START: 'mpOTR Start',
            MPOTR_SHUTDOWN_START: 'mpOTR Shutdown Start',
            MPOTR_SHUTDOWN_FINISH: 'mpOTR Shutdown Finish',
            BLOCK_CHAT: 'BlockChat',
            CHAT_SYNCED: 'ChatSynced',
            CHAT_SYNC_REQ: "ChatSyncReq",
            CHAT_SYNC_RES: "ChatSyncRes",
            CONN_POOL_ADD: "ConnPoolAdd",
            CONN_POOL_REMOVE: "ConnPoolRemove"
        };

        this.subscribeOnEvent(this.EVENTS.MPOTR_SHUTDOWN_FINISH, function() {
            this.reset();
        })
    }

    return mpOTRContext;
});
