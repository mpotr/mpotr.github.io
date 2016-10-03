define(['jquery', 'debug', 'cryptico'], function($, debug) {
    "use strict";

    var len_sid_random = 13;
    var key_length = "1024";
    var auth_key_length = "1024";
    var exp = "03";
    var qmod = new BigInteger("1205156213460516294276038011098783037428475274251229971327058470979054415841306114445046929130670807336613570738952006098251824478525291315971365353402504611531367372670536703348123007294680829887020513584624726600189364717085162921889329599071881596888429934762044470097788673059921772650773521873603874984881875042154463169647779984441228936206496905064565147296499973963182632029642323604865192473605840717232357219244260470063729922144429668263448160459816959", 10);
    var pmod = new BigInteger("2410312426921032588552076022197566074856950548502459942654116941958108831682612228890093858261341614673227141477904012196503648957050582631942730706805009223062734745341073406696246014589361659774041027169249453200378729434170325843778659198143763193776859869524088940195577346119843545301547043747207749969763750084308926339295559968882457872412993810129130294592999947926365264059284647209730384947211681434464714438488520940127459844288859336526896320919633919", 10);
    var random = new SecureRandom();

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
    function Round(number) {
        this.number = number
    }

    /**
     * Indicates if round data was sended
     * @type Boolean
     */
    Round.prototype.sended = false;

    /**
     * Method to reset all Round settings
     */
    Round.prototype.reset = function() {
        this.sended = false;
    };

    /**
     * Sets context of round to not to pass it every time
     * @param {mpOTRContext} context
     */
    Round.prototype.setContext = function(context) {
        this.context = context;
    };

    /**
     * Simple wrapper for unified processing of
     * yet another authentication round result.
     * @param {Object} result object with results of auth round.
     * Must contain key "status". "OK" is value for success.
     * Other ones are treated as error messages.
     * @returns {boolean}
     */
    Round.prototype.process = function(result) {
        if (result["status"] === "OK") {
            $.extend(true, this.context, result["update"]);

            return true;
        } else {
            debug.log("alert", "mpOTR error: " + result["status"]); // TODO something more adequate

            return false;
        }
    };

    /**
     * Processes incoming auth message by executing corresponding
     * "receive" function and interpreting the result.
     * @param {String} peer Peer's ID
     * @param {String} msg Current round's authentication message
     * @returns {boolean} true if processing was successful
     */
    Round.prototype.recv = function (peer, msg) {
        return this.process(this._recv(peer, msg));
    };

    /**
     *
     * @returns {boolean}
     */
    Round.prototype.send = function () {
        return this.process(this._send())
    };

    let round1 = new Round(1);

    round1._send = function () {
        let context = this.context;
        let result = {
            "update": {},
            "status": "OK"
        };
        let my_k = new Array(len_sid_random);
        random.nextBytes(my_k);

        my_k = my_k.map(function (el) {
            return String.fromCharCode(el);
        }).join("");

        let my_k_hashed = sha256.hex(my_k);

        let long_pair = generateExpPair(key_length);
        let longterm = long_pair[0];
        let pub_longterm = long_pair[1];

        let eph_pair = generatePair(key_length);
        let eph = eph_pair[0];
        let pub_eph = eph_pair[1];

        result["update"]["myLongPubKey"] = pub_longterm;
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

        let message = ["auth", this.number, String(my_k_hashed), String(pub_longterm), String(pub_eph)];
        context.client.sendMessage(message, context.MSG.MPOTR_AUTH);
        this.sended = true;

        return result;
    };

    round1._recv = function (peer, msg) {
        let result = {
            "update": {},
            "status": "OK"
        };

        result["update"]["hashedNonceList"] = {};
        result["update"]["longtermPubKeys"] = {};
        result["update"]["ephPubKeys"] = {};
        result["update"]["hashedNonceList"][peer] = msg[0];
        result["update"]["longtermPubKeys"][peer] = new BigInteger(msg[1]);
        result["update"]["ephPubKeys"][peer] = msg[2];

        return result;
    };

    let round2 = new Round(2);

    round2._send = function () {
        let context = this.context;
        let result = {
            "update": {},
            "status": "OK"
        };
        let sid_raw = "";

        let hn = context.hashedNonceList;
        let hna = Object.keys(context.hashedNonceList);
        // I HATE JAVASCRIPT
        // THIS SHIT ITERATE DICT IN THE ORDER OF ADDING KEYS
        // so sort and iterate in alphabetic order
        // TODO: think about rewriting in array [{key1:value1}, {key2:value2}, ...]
        hna.sort();
        for (let i = 0; i < hna.length; ++i) {
            sid_raw = sid_raw + hn[hna[i]];
        }

        let sid = sha256.hex(sid_raw);
        result.update.sid = sid;

        let auth_pair = generateExpPair(auth_key_length);
        let r_i = auth_pair[0];
        let exp_r_i = auth_pair[1];
        result.update.r_i = r_i;
        result.update.exp_r_i = exp_r_i;

        let message = ["auth", this.number, String(sid), String(exp_r_i)];
        result["update"]["expAuthNonce"] = {};
        result["update"]["expAuthNonce"][context.client.peer.id] = exp_r_i;
        context.client.sendMessage(message, context.MSG.MPOTR_AUTH);
        this.sended = true;

        return result;
    };

    round2._recv = function (peer, msg) {
        let context = this.context;
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

        return result;
    };

    let round3 = new Round(3);

    let xor = function (a, b) {
        let result = "";

        if (a.length != b.length) {
            debug.log("info", "xor() operands have different length");
            debug.log("info", "a = " + JSON.stringify(a));
            debug.log("info", "b = " + JSON.stringify(b));
        }

        for (let i = 0; (i < a.length) && (i < b.length); ++i) {
            let c = a.charCodeAt(i);
            let d = b.charCodeAt(i);
            result += String.fromCharCode(c ^ d);
        }
        return result;
    };

    round3._send = function () {
        let context = this.context;
        let result = {
            "update": {},
            "status": "OK"
        };

        let lpk = context.longtermPubKeys;
        let lpka = Object.keys(lpk);
        lpka.sort();
        let left_pub_key;
        let right_pub_key;
        for (let i = 0; i < lpka.length; ++i) {
            if (lpka[i] === context.client.peer.id) {
                let num_left = i - 1;                             // URRR, -1 % 3 === -1
                while (num_left < 0) {
                    num_left += lpka.length;
                }
                left_pub_key = lpk[lpka[num_left]];
                let num_right = (i + 1) % lpka.length;
                right_pub_key = lpk[lpka[(i + 1) % lpka.length]];
            }
        }

        let bigIntLPK = new BigInteger(context.myLongPrivKey.toString(), 10);
        let t_left_raw = left_pub_key.modPow(bigIntLPK, pmod);
        let t_right_raw = right_pub_key.modPow(bigIntLPK, pmod);
        let t_left_hashed = sha256.hex(t_left_raw.toString());
        let t_right_hashed = sha256.hex(t_right_raw.toString());
        let bigT = xor(t_left_hashed, t_right_hashed);
        let xoredNonce = xor(context.k_i, t_right_hashed);

        result.update["my_t_left"] = t_left_hashed;
        result.update["my_t_right"] = t_right_hashed;
        result.update["xoredNonce"] = {};
        result.update["xoredNonce"][context.client.peer.id] = xoredNonce;
        result.update["bigT"] = {};
        result.update["bigT"][context.client.peer.id] = bigT;
        result.update["myBigT"] = bigT;

        let s = ["auth", this.number, String(xoredNonce), String(bigT)];
        context.client.sendMessage(s, context.MSG.MPOTR_AUTH);
        this.sended = true;

        return result;
    };

    round3._recv = function (peer, msg) {
        let result = {
            "update": {},
            "status": "OK"
        };

        result["update"]["xoredNonce"] = {};
        result["update"]["bigT"] = {};
        result["update"]["xoredNonce"][peer] = msg[0];
        result["update"]["bigT"][peer] = msg[1];

        return result;
    };

    let round4 = new Round(4);

    round4._send = function () {
        let context = this.context;
        let result = {
            "update": {},
            "status": "OK"
        };
        // decrypt nonces here
        let xored_nonces = context.xoredNonce;
        let xored_nonces_keys = Object.keys(xored_nonces);
        xored_nonces_keys.sort();
        let nonces = {};

        let t_R = context.my_t_right;
        let i = xored_nonces_keys.indexOf(context.client.peer.id);
        for (let j = i; (j - i) < xored_nonces_keys.length; ++j) {
            let peer_name = xored_nonces_keys[(j + 1) % xored_nonces_keys.length];
            t_R = xor(t_R, context.bigT[peer_name]);
            nonces[peer_name] = xor(xored_nonces[peer_name], t_R);
        }

        for (let i in nonces) {
            if (sha256.hex(nonces[i]) !== context.hashedNonceList[i]) {
                result["status"] = "NONCE HASH CHECK FAILED";
                return result;
            }
        }

        let bigTx = context.myBigT;
        for (let i in context.bigT) {
            bigTx = xor(bigTx, context.bigT[i]);
        }
        if (bigTx !== context.myBigT) {
            result["status"] = "BIG T XOR SUM IS NOT NULL";
        }

        if (result["status"] !== "OK") {
            return result;
        }

        let n = "";
        let sconf = "";
        n += nonces[xored_nonces_keys[0]];
        sconf += "," + context.longtermPubKeys[xored_nonces_keys[0]] + ",";
        sconf += nonces[xored_nonces_keys[0]] + "," + context.ephPubKeys[xored_nonces_keys[0]];
        for (let i = 1; i < xored_nonces_keys.length; ++i) {
            n += nonces[xored_nonces_keys[i]];
            sconf += "," + context.longtermPubKeys[xored_nonces_keys[i]] + ",";
            sconf += nonces[xored_nonces_keys[i]] + "," + context.ephPubKeys[xored_nonces_keys[i]];
        }

        sconf = sha256.hex(sconf);
        let c_i_raw = context.sid + sconf;
        let c_i_hashed = sha256.hex(c_i_raw);
        let c_i_int = new BigInteger(c_i_hashed);
        c_i_int = c_i_int.mod(qmod);
        c_i_hashed = c_i_int.toString();
        let d_i = context.r_i.subtract(context.myLongPrivKey.multiply(c_i_int).mod(qmod)).mod(qmod);
        let sig = context.myEphPrivKey.signStringWithSHA256(c_i_hashed);

        result.update["sessionKey"] = sha256.hex(n);
        result.update["nonce"] = nonces;
        result.update["sconf"] = sconf;
        result.update["d_i"] = d_i;
        result.update["sig"] = sig;
        result.update["c_i"] = c_i_hashed;

        let s = ["auth", this.number, String(d_i), String(sig)];
        context.client.sendMessage(s, context.MSG.MPOTR_AUTH);
        this.sended = true;

        return result;
    };

    round4._recv = function (peer, msg) {
        let context = this.context;
        let result = {
            "update": {},
            "status": "OK"
        };

        let ex = new BigInteger(exp, 10);
        let d_i = new BigInteger(msg[0], 10);
        let exp1 = ex.modPow(d_i, pmod);

        let BigIntC_I = new BigInteger(context.c_i, 10);
        let exp2 = context.longtermPubKeys[peer].modPow(BigIntC_I, pmod);
        let d_check = exp1.multiply(exp2).mod(pmod);

        if (d_check.toString() !== context.expAuthNonce[peer].toString()) {
            result["status"] = "D CHECK FAILED";
            return result;
        }

        let pk = cryptico.publicKeyFromString(context.ephPubKeys[peer]);

        if (!pk.verifyString(context.c_i, msg[1])) {
            result["status"] = "SIGNATURE VERIFYING FAILED";
            return result;
        }

        return result;
    };

    /**
     * Singleton for mpOTR context
     * @param {Object} client Current peer
     * @returns {mpOTRContext}
     */
    function mpOTRContext(client) {
        this.client = client;
        this["status"] = "not started";

        this.rounds = {
            1: round1,
            2: round2,
            3: round3,
            4: round4
        };

        for (let i in this.rounds) {
            this.rounds[i].setContext(this);
        }

        /**
         * Initiates mpOTR session
         */
        this.start = function() {
            if (this.client.connPool.length > 0) {
                this["round"] = 1;
                this.client.sendMessage(["init"], this.MSG.MPOTR_INIT);
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
            this["round"] = 1;
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
            for (let i in this.rounds) {
                this.rounds[i].reset();
            }
        };
        this.reset();

        /**
         * Sends broadcast request to retrieve
         * a lost message in response
         */
        this.deliveryRequest = function () {
            var data = {
                "type": this.MSG.MPOTR_LOST_MSG,
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
            data["type"] = this.MSG.MPOTR_CHAT;
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
                    debug.log("info", "got \"" + msg + "\" from " + author);
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

        // this.receive = function (author, msg) {
        //     switch (msg[0]) {
        //         case "init":
        //             process(this, function (context) {
        //                 return context.rounds[0].send(context);
        //             });
        //             debug.log("info", "init received");
        //             this.emitEvent(this.EVENTS.MPOTR_INIT);
        //             this["status"] = "auth";
        //             break;
        //         case "auth":
        //             var roundNum = parseInt(msg[1], 10);
        //             if ((this["round"] != roundNum) && !((roundNum == (this["round"] + 1)) && (this.rounds[this["round"]].ready))) {
        //                 debug.log("alert", "somebody tries to break chat");
        //                 break;
        //             }
        //             var round_now = this.rounds[roundNum];
        //             if (!round_now.sended) {
        //                 process(this, function (context) {
        //                     return round_now.send(context);
        //                 });
        //             }
        //
        //             process(this, function (context) {
        //                 return round_now.receive(author, msg.slice(2), context);
        //             });
        //
        //             if (this.client.connPool.length === round_now.received) {
        //                 var message = ["ready", String(this.rounds[roundNum]["name"])];
        //                 this.rounds[this.round].ready = true;
        //                 this.client.sendMessage(message, this.MSG.MPOTR_AUTH)
        //             }
        //
        //             debug.log("info", this.status);
        //             break;
        //         case "ready":
        //             roundNum = parseInt(msg[1], 10);
        //             if (((this["round"] + 1) == roundNum) && this.rounds[this["round"]].ready) {
        //                 break;
        //             }
        //             if (this["round"] != roundNum) {
        //                 debug.log("alert", "somebody tries to break chat");
        //                 break;
        //             }
        //             this.rounds[roundNum]["ready_dict"][author] = true;
        //             var allNodesReady = true;
        //             this.client.connPool.peers.forEach(function(peer) {
        //                 allNodesReady = allNodesReady && this.rounds[roundNum]["ready_dict"][peer];
        //             }, this);
        //             if (allNodesReady !== true) {
        //                 break;
        //             }
        //             if (roundNum < 3) {
        //                 this["round"] = this["round"] + 1;
        //                 process(this, function (context) {
        //                     return context.rounds[roundNum + 1].send(context);
        //                 });
        //             } else {
        //                 this["round"] = undefined;
        //                 this["status"] = "chat";
        //                 debug.log("info", "chat");
        //                 this.emitEvent(this.EVENTS.MPOTR_START);
        //             }
        //             break;
        //         case "error":
        //             //TODO: something more adequate
        //             debug.log("alert", "mpOTR error: " + msg);
        //             break;
        //         default:
        //             //TODO: something more adequate
        //             debug.log("alert", "Unexpected mpOTR type, message: " + msg);
        //             break;
        //     }
        // };

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
            data["type"] = this.MSG.MPOTR_SHUTRDOWN;
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

            debug.log("info", "shutdown from " + msg["from"] + " received: " + this.decryptMessage(msg["data"]));

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

            this.subscribeOnEvent(this.MSG.CHAT_SYNC_RES, (conn, data) => {

                if (!this.checkSig(data, conn.peer)) {
                    alert("Signature check fail");
                }

                resolves[conn.peer]();
            });

            Promise.all(promises).then(() => {
                this.clearEventListeners(this.MSG.CHAT_SYNC_RES);
                process(this, function (context) {
                    return context.sendShutdown();
                });
            });

            var data = {
                "type": this.MSG.CHAT_SYNC_REQ,
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
         * Possible events in application.
         */
        this.EVENTS = {
            MPOTR_INIT: '[Event] mpOTR init',
            MPOTR_START: '[Event] mpOTR start',
            MPOTR_SHUTDOWN_START: '[Event] mpOTR shutdown start',
            MPOTR_SHUTDOWN_FINISH: '[Event] mpOTR shutdown finish',
            BLOCK_CHAT: '[Event] Block chat',
            CHAT_SYNCED: '[Event] Chat has been synced',
            CONN_POOL_ADD: "[Event] ConnPool: connection has been added",
            CONN_POOL_REMOVE: "[Event] ConnPool: connection has been removed",
            INCOMING_MSG: "[Event] Incoming Message"
        };

        /**
         * Possible message types. Also used as event types for corresponding handlers.
         */
        this.MSG = {
            UNENCRYPTED: "[Message] Unencrypted",
            CONN_POOL_SYNC: "[Message] connPool Sync",
            MPOTR_INIT: "[Message] mpOTR Init",
            MPOTR_AUTH: "[Message] mpOTR Auth",
            MPOTR_CHAT: "[Message] mpOTR Chat",
            MPOTR_LOST_MSG: "[Message] mpOTR Lost Message Request",
            MPOTR_SHUTRDOWN: "[Message] mpOTR Shutdown",
            CHAT_SYNC_REQ: "[Message] ChatSyncReq",
            CHAT_SYNC_RES: "[Message] ChatSyncRes"
        };

        // Making search in MSG easy
        Object.defineProperty(this.MSG, "_values", {
            value: []
        });

        for (let val in this.MSG) {
            this.MSG._values.push(this.MSG[val]);
        }

        Object.defineProperty(this.MSG, "hasMsgType", {
            value: (msg) => {
                return this.MSG._values.indexOf(msg) > -1;
            }
        });

        /**
         * Events handlers for subscribe / emit system
         */
        this.on = {};

        for (let key in this.EVENTS) {
            this.on[this.EVENTS[key]] = [];
        }

        for (let key in this.MSG) {
            this.on[this.MSG[key]] = [];
        }

        /**
         * Adds event listener to the event
         * @param {String} name name of event
         * @param {function} callback event handler
         * @param {number=} count how many time run?
         * @param {String=} tag useful for logical grouping handlers with following massive removing
         */
        this.subscribeOnEvent = function(name, callback, count, tag) {
            this.on[name].push({
                tag: tag ? tag : "",
                callback: callback,
                count: count ? count : Infinity
            });
        };

        /**
         * Speaks for itself, doesn't it?
         * @param {String} name name of event
         * @param {Array=} args arguments for event handlers
         */
        this.emitEvent = function(name, args) {
            let toDel = [];

            this.on[name].forEach((elem) => {
                elem.callback.apply(this, args);
                --elem.count;

                if (elem.count == 0) {
                    toDel.push(elem);
                }
            });

            toDel.forEach((elem) => {
                let idx = this.on[name].indexOf(elem);
                this.on[name].splice(idx, 1);
            });
        };

        /**
         * Removes subscriber of event specified
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
         * Removes subscriber of specified event by tag
         * @param name
         * @param tag
         */
        this.removeSubscriberByTag = function (name, tag) {
            let toDel = [];

            this.on[name].forEach((elem) => {
                if (elem.tag === tag) {
                    toDel.push(elem);
                }
            });

            toDel.forEach((elem) => {
                let idx = this.on[name].indexOf(elem);
                this.on[name].splice(idx, 1);
            });
        };

        /**
         * Clears list of handlers for event specified
         * @param {String} name name of event
         */
        this.clearEventListeners = function(name) {
            this.on[name] = [];
        };

        // Reset context on chat shutdown
        this.subscribeOnEvent(this.EVENTS.MPOTR_SHUTDOWN_FINISH, () => {
            this.reset();
        });

        // Init received! Checking current chat status and starting new one!
        this.subscribeOnEvent(this.MSG.MPOTR_INIT, (conn, data) => {
            if (this.status === "not started") {
                this.emitEvent(this.EVENTS.MPOTR_INIT, [conn, data]);
            }
        });

        this.subscribeOnEvent(this.EVENTS.MPOTR_INIT, (conn, data) => {
            // Creating new arbiter
            let arbiter = this.newArbiter();
            arbiter.then(() => {
                alert('Cool!');
            }).catch((err) => {
                console.log(err);
                alert("Trolo!");
            });
            // Trying to make Auth
        });

        this.subscribeOnEvent(this.MSG.MPOTR_CHAT, (conn, data) => {
            if (!this.checkSig(data, data["from"])) {
                alert("Signature check fail");
            }

            this.receiveMessage(data);
        });

        this.subscribeOnEvent(this.MSG.MPOTR_LOST_MSG, (conn, data) => {
            if (!this.checkSig(data, conn.peer)) {
                alert("Signature check fail");
            }

            var response = this.deliveryResponse(data);

            if (response) {
                conn.send(response);
            }
        });

        this.subscribeOnEvent(this.MSG.MPOTR_SHUTRDOWN, (conn, data) => {
            if (!this.checkSig(data, conn.peer)) {
                alert("Signature check fail");
            }

            if (this.receiveShutdown(data)) {
                this.emitEvent(this.EVENTS.MPOTR_SHUTDOWN_FINISH);
                debug.log("info", "mpOTRContext reset");
            }
        });

        this.newArbiter = function () {
            let currentRound = 1;

            /**
             * Queue for storing auth messages for future processing
             */
            let roundsQueue =  {
                1: [],
                2: [],
                3: [],
                4: []
            };

            // TODO: Move timeout to client or context
            let timeout = 10 * 1000;

            /**
             * Dict with error/success callbacks
             * @type {{success: Function, error: Function}}
             */
            let cb = {};

            let cleanup = (err) => {
                // TODO: remove event listener
                this.clearEventListeners(this.MSG.MPOTR_AUTH);
                cb["error"](err);
            };

            let success = () => {
                this.status = "chat";
                cb["success"]();
            };

            /**
             * Promise which resolves when auth completes.
             * Can be rejected by timeout or protocol error.
             * @type {Promise}
             */
            let auth = new Promise(function (success, error) {
                cb["success"] = success;
                cb["error"] = error;
            });

            /**
             * Dict containing status of auth messagess from all peers.
             * true - message was received and processed, false - vice-versa
             */
            let roundsRcvd = {
                1: {},
                2: {},
                3: {},
                4: {}
            };

            /**
             * Check for were all messages received in specified round
             * @param currentRound
             * @returns {boolean}
             */
            roundsRcvd.check = function(currentRound) {
                for (let key in this[currentRound]) {
                    if (!this[currentRound][key]) {
                        return false;
                    }
                }

                return true;
            };

            // In the beginning none of messages are received
            for (let client of this.client.connPool.peers) {
                for (let round in this.rounds) {
                    roundsRcvd[round][client] = false;
                }
            }

            // Subscribing main listener for auth messages
            this.subscribeOnEvent(this.MSG.MPOTR_AUTH, (conn, data) => {
                let payload = data["data"];
                // Check Message
                let processMessage = (conn, data) => {
                    let result = this.rounds[currentRound].recv(conn.peer, data);

                    if (result) {
                        // TODO: check for double submit
                        roundsRcvd[currentRound][conn.peer] = true;

                        if (roundsRcvd.check(currentRound)) {
                            if (currentRound == 4) {
                                return true;
                            }

                            currentRound += 1;
                            // if (!rounds[currentRound].sended) {}
                            if (!this.rounds[currentRound].send()) {
                                return false
                            }

                            this.status = "Round " + this.rounds[currentRound].number;

                            // Process the whole queue
                            for (let msg in roundsQueue[currentRound]) {
                                if (!processMessage.apply(msg)) {
                                    return false;
                                }
                            }
                        }
                    } else {
                        return false;
                    }

                    return true;
                };

                // TODO: data should be a dict!!!
                if (payload[1] === currentRound) {
                    if (!processMessage(conn, payload.slice(2))) {
                        cleanup("processMessage failed");
                    }

                    if (currentRound == 4) {
                        success();
                    }
                } else if (payload[1] === currentRound + 1 && payload[1] < 5) {
                    roundsQueue[payload[1]].push([conn, data]);
                } else {
                    cleanup("Wrong round number");
                }
            });

            setTimeout(cleanup, timeout);

            this.rounds[currentRound].send();

            return auth;
        }
    }

    return mpOTRContext;
});
