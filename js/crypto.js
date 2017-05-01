define(['jquery', 'utils', 'events', 'cryptico'], function($, utils, $_) {
    "use strict";

    let len_sid_random = 13;
    let key_length = "1024";
    let auth_key_length = "1024";
    let exp = "03";
    let g = new BigInteger("31", 10);
    let qmod = new BigInteger("1205156213460516294276038011098783037428475274251229971327058470979054415841306114445046929130670807336613570738952006098251824478525291315971365353402504611531367372670536703348123007294680829887020513584624726600189364717085162921889329599071881596888429934762044470097788673059921772650773521873603874984881875042154463169647779984441228936206496905064565147296499973963182632029642323604865192473605840717232357219244260470063729922144429668263448160459816959", 10);
    let pmod = new BigInteger("2410312426921032588552076022197566074856950548502459942654116941958108831682612228890093858261341614673227141477904012196503648957050582631942730706805009223062734745341073406696246014589361659774041027169249453200378729434170325843778659198143763193776859869524088940195577346119843545301547043747207749969763750084308926339295559968882457872412993810129130294592999947926365264059284647209730384947211681434464714438488520940127459844288859336526896320919633919", 10);
    let random = new SecureRandom();

    /**
     * Generates RSA key pair
     * @param {string} length Key length
     * @returns {Array} [PrivateKey, PublicKey]
     */
    function generatePair(length) {
        let rsaPrivateKey = new RSAKey();
        rsaPrivateKey.generate(length, exp);
        let rsaPubKey = cryptico.publicKeyString(rsaPrivateKey);
        return [rsaPrivateKey, rsaPubKey];
    }

    /**
     * Generates big random number
     * @returns {BigInteger}
     */
    function generateNumber() {
        let randBytes = new Array(len_sid_random);
        random.nextBytes(randBytes);
        return new BigInteger(randBytes);
    }

    /**
     * TODO
     * @param {string} length
     * @returns {Array}
     */
    function generateExpPair(length) {
        let randBigNumber = generateNumber();
        randBigNumber = randBigNumber.mod(qmod);
        let b = g.modPow(randBigNumber, pmod);
        return [randBigNumber, b];
    }

    /**
     * Round class.
     * Yup, class in JS!
     * @returns {Round}
     */
    function Round(number) {
        this.number = number
    }

    /**
     * Indicates if round data was sended.
     * Is used for debug purposes.
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
     * authentication round result.
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
            utils.log("alert", "mpOTR error: " + result["status"]); // TODO something more adequate

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
        context.client.sendMessage(message, $_.MSG.MPOTR_AUTH);
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
        context.client.sendMessage(message, $_.MSG.MPOTR_AUTH);
        this.sended = true;

        return result;
    };

    round2._recv = function (peer, msg) {
        let context = this.context;
        let result = {
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
        context.client.sendMessage(s, $_.MSG.MPOTR_AUTH);
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
        context.client.sendMessage(s, $_.MSG.MPOTR_AUTH);
        this.sended = true;

        return result;
    };

    round4._recv = function (peer, msg) {
        let context = this.context;
        let result = {
            "update": {},
            "status": "OK"
        };

        let d_i = new BigInteger(msg[0], 10);
        let exp1 = g.modPow(d_i, pmod);

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
        this["status"] = $_.STATUS.UNENCRYPTED;

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
            if (this.client.connList.length > 0) {
                this.client.sendMessage(["init"], $_.MSG.MPOTR_INIT);
                $_.ee.emitEvent($_.EVENTS.MPOTR_INIT);
            } else {
                utils.log('alert', "No peers were added");
                $_.ee.emitEvent($_.EVENTS.MPOTR_SHUTDOWN_FINISH);
            }
        };

        /**
         * Resets all crypto-properties and rounds
         */
        this.reset = function () {
            this["status"] = $_.STATUS.UNENCRYPTED;
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

            // OldBlue buffers
            this.frontier = [];
            this.lostMsg = [];
            this.delivered = [];
            this.undelivered = [];

            for (let i in this.rounds) {
                this.rounds[i].reset();
            }

            this.shutdown_received = {};
        };
        this.reset();

        this.broadcastOldBlue = (data) => {
            // OldBlue starts
            data["parentsIDs"] = this.frontier.slice();
            data["messageID"] = sha256.hex(
                this.client.peer.id +
                this.frontier.toString() +
                data["data"]
            );
            this.signMessage(data);
            // self-deliver
            this.receiveMessage(data);
            // OldBlue ends

            this.client.broadcast(data);
        };

        /**
         * Sends broadcast request to retrieve
         * a lost message in response
         */
        this.deliveryRequest = function () {
            let data = {
                "type": $_.MSG.MPOTR_LOST_MSG,
                "sid": this.sid
            };

            for (let id of this.lostMsg) {
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
            let idx = this.undelivered.map(function (elem) {
                return elem["messageID"];
            }).indexOf(data["lostMsgID"]);
            if (idx !== -1) {
                return this.undelivered[idx];
            }

            // Searching in delivered messages
            idx = this.delivered.map(function (elem) {
                return elem["messageID"];
            }).indexOf(data["lostMsgID"]);
            if (idx !== -1) {
                return this.delivered[idx];
            }

            // Not found
            return undefined;
        };

        this.sendMessage = function (text) {
            let encryptedText = this.encryptMessage(text);

            let data = {};
            data["type"] = $_.MSG.MPOTR_CHAT;
            data["from"] = this.client.peer.id;
            data["sid"] = this.sid;
            data["data"] = encryptedText;

            this.broadcastOldBlue(data);
        };

        this.receiveMessage = function (data) {
            if (!this.checkSig(data, data["from"])) {
                utils.log('alert', "Signature check fail");
                return;
            }

            // OldBlue

            // Ignore duplicates
            if (this.delivered.filter((elem) => {
                    return elem["messageID"] === data["messageID"];
                }).length > 0 || this.undelivered.filter((elem) => {
                    return elem["messageID"] === data["messageID"];
                }).length > 0) {
                return;
            }

            let index = this.lostMsg.indexOf(data["messageID"]);

            if (index > -1) {
                this.lostMsg.splice(index, 1);
            }

            // Lost message delivery request
            for (let id of data["parentsIDs"]) {
                if (this.delivered.filter((elem) => {
                        return elem["messageID"] === id;
                    }).length === 0 && this.undelivered.filter((elem) => {
                        return elem["messageID"] === id;
                    }).length === 0) {
                    this.lostMsg.push(id);
                }
            }

            this.deliveryRequest();

            this.undelivered.push(data);

            // Looking in undelivered buffer for messages that can be delivered
            // Means all its parents was delivered
            for (let i = this.undelivered.length - 1; i >= 0; --i) {
                let candidateToDelivery = this.undelivered[i];
                let canBeDelivered = true;

                // Looking for parents of current message in delivered messages
                for (let parent of candidateToDelivery["parentsIDs"]) {
                    let parentWasDelivered = false;

                    for (let deliveredMsg of this.delivered) {
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
                    for (let parent of candidateToDelivery["parentsIDs"]) {
                        let j = this.frontier.indexOf(parent);

                        if (j > -1) {
                            this.frontier.splice(j, 1);
                        }
                    }
                    // Delivered message now in frontier
                    this.frontier.push(candidateToDelivery["messageID"]);
                    // And officially delivered :)
                    this.delivered.unshift(candidateToDelivery);
                    this.undelivered.splice(i, 1);

                    // Deliver message
                    this.deliverMessage(candidateToDelivery);
                }
            }
            // OldBlue ends
        };

        this.deliverMessage = (msg) => {
            switch (msg["type"]) {

                case $_.MSG.MPOTR_CHAT:
                    let text = this.decryptMessage(msg["data"]);
                    let author = msg["from"];
                    this.client.writeToChat(author, text);
                    utils.log("info", "got \"" + text + "\" from " + author);
                break;

                case $_.MSG.MPOTR_SHUTDOWN:
                    if (typeof(msg["data"]) !== typeof("")) {
                        utils.log('alert', `Got empty MPOTR_SHUTDOWN msg from ${msg["from"]}`);
                        return;
                    }

                    if (this.receiveShutdown(msg["from"], msg["data"])) {
                        $_.ee.emitEvent($_.EVENTS.MPOTR_SHUTDOWN_FINISH);
                        utils.log("info", "mpOTRContext reset");
                    }
                break;

                case $_.MSG.BD_KEY_RATCHET:
                    this.bd.handleBDMessage(msg);
                break;

                default:
                    utils.log("info", `Got unexpected type of message: ${msg["type"]}`);
                    utils.log("info", msg);
            }

            $_.ee.emitEvent($_.EVENTS.OLDBLUE_MSG_DELIVERED, [msg]);
        };

        this.decryptMessage = function (text) {
            return cryptico.decryptAESCBC(text, this.sessionKey.slice(0, 32));
        };

        this.encryptMessage = function (text) {
            return cryptico.encryptAESCBC(
                text,
                this.sessionKey.slice(0, 32)
            );
        };

        /**
         * Takes object, signs it and adds property 'sig'
         * @param {object} data Object to sign
         */
        this.signMessage = function (data) {
            if ("sig" in data) {
                delete data["sig"];
            }

            let keys = Object.keys(data);
            keys.sort();

            let result = "";
            for (let key of keys) {
                result += data[key];
            }

            data['sig'] = this.myEphPrivKey.signStringWithSHA256(result);
        };

        this.checkSig = function (data, peer) {
            let pk = cryptico.publicKeyFromString(this.ephPubKeys[peer]);
            let keys = Object.keys(data);
            keys.splice(keys.indexOf('sig'), 1);
            keys = keys.sort();

            let result = "";
            for (let key of keys) {
                result += data[key];
            }

            return pk.verifyString(result, data["sig"]);
        };

        /**
         * A decorator to use with event callbacks. For example:
         *
         * $_.ee.addListener("EventSpecificForTheAuthPhase", checkStatus(
         *   [ $_.STATUS.AUTH ],
         *   callbackForTheEvent
         * )
         *
         * The callback will be triggered if and only if the current
         * chat's status is among the supplied ones
         *
         * @param {String[]} statuses An array of permitted statuses
         * @param {Function} func A function to decorate
         * @returns {Function}
         */
        this.checkStatus = (statuses, func) => {
            let self = this;

            return function() {
                if (statuses.indexOf(self.status) > -1) {
                    func.apply(null, arguments);
                }
            }
        };

        this.sendShutdown = function () {
            // TODO: think about keylength 64
            let secret = `p=${this.myEphPrivKey.p}, q=${this.myEphPrivKey.q}, e=${this.myEphPrivKey.e}`;

            let encryptedText = this.encryptMessage(secret);

            let data = {};
            data["type"] = $_.MSG.MPOTR_SHUTDOWN;
            data["from"] = this.client.peer.id;
            data["sid"] = this.sid;
            data["data"] = encryptedText;

            this.broadcastOldBlue(data);

            this.shutdown_sended = true;
        };

        this.receiveShutdown = (from, keys) => {
            if (from !== this.client.peer.id && !this.shutdown_sended) {
                this.stopChat();
            }

            if (keys === null) {
                utils.log("info", `${from} was disconnected`);
            } else {
                // TODO: Publish keys
                utils.log("info", `shutdown from ${from} received: ${this.decryptMessage(keys)}`);
            }

            this.shutdown_received[from] = true;

            return Object.values(this.shutdown_received).indexOf(false) === -1;
        };

        this.stopChat = function () {
            this.status = $_.STATUS.SHUTDOWN;

            $_.ee.emitEvent($_.EVENTS.MPOTR_SHUTDOWN_START);
            $_.ee.emitEvent($_.EVENTS.BLOCK_CHAT);

            this.sendShutdown();
        };

        // Change status on start of chat
        $_.ee.addListener($_.EVENTS.MPOTR_START, () => {
            this.status = $_.STATUS.MPOTR;
        });

        // Reset context on chat shutdown
        $_.ee.addListener($_.EVENTS.MPOTR_SHUTDOWN_FINISH, () => {
            this.reset();
        });

        // Init received! Checking current chat status and starting new one!
        $_.ee.addListener($_.MSG.MPOTR_INIT, this.checkStatus([$_.STATUS.UNENCRYPTED], (conn, data) => {
            $_.ee.emitEvent($_.EVENTS.MPOTR_INIT, [conn, data]);
        }));

        $_.ee.addListener($_.EVENTS.MPOTR_INIT, (conn, data) => {
            for (let peer of this.client.connList.peers) {
                this.shutdown_received[peer] = false;
            }

            // Initiating authentication phase
            let authenticationPhase = this.InitAuthenticationPhase();

            authenticationPhase.then(() => {
                utils.log('info', 'Success!');
            }).catch((err) => {
                utils.log('alert', err);
            });
        });

        $_.ee.addListener($_.MSG.MPOTR_CHAT, (_, data) => {
            this.receiveMessage(data);
        });
        $_.ee.addListener($_.MSG.MPOTR_SHUTDOWN, (_, data) => {
            this.receiveMessage(data);
        });

        $_.ee.addListener($_.MSG.MPOTR_LOST_MSG, (conn, data) => {
            if (!this.checkSig(data, conn.peer)) {
                utils.log('alert', "Signature check fail");
                return;
            }

            let response = this.deliveryResponse(data);

            if (response) {
                conn.send(response);
            }
        });

        $_.ee.addListener($_.EVENTS.CONN_LIST_REMOVE, this.checkStatus([$_.STATUS.MPOTR, $_.STATUS.SHUTDOWN], (conn) => {
            if (this.client.amILeader()) {
                $_.ee.addOnceListener($_.EVENTS.MPOTR_SHUTDOWN_FINISH, () => {
                    setTimeout(() => {
                        this.start();
                    }, 0)
                })
            }

            if (this.receiveShutdown(conn.peer, null)) {
                $_.ee.emitEvent($_.EVENTS.MPOTR_SHUTDOWN_FINISH);
                utils.log("info", "mpOTRContext reset");
            }
        }));

        this.InitAuthenticationPhase = function () {
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

            let authMessageListener = (conn, data) => {
                let payload = data["data"];
                // Check Message
                let processMessage = (conn, data) => {
                    let result = this.rounds[currentRound].recv(conn.peer, data);

                    if (result) {
                        // TODO: check for double submit
                        roundsRcvd[currentRound][conn.peer] = true;

                        if (roundsRcvd.check(currentRound)) {
                            if (currentRound === 4) {
                                return true;
                            }

                            currentRound += 1;
                            if (!this.rounds[currentRound].send()) {
                                return false
                            }

                            this.status = $_.STATUS.AUTH;

                            // Process the whole queue
                            for (let msg of roundsQueue[currentRound]) {
                                if (!processMessage.apply(this, msg)) {
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
                        fail("processMessage failed");
                        return;
                    }

                    if (currentRound === 4) {
                        success();
                    }
                } else if (payload[1] === currentRound + 1 && payload[1] < 5) {
                    roundsQueue[payload[1]].push([conn, payload.slice(2)]);
                } else {
                    fail("Wrong round number");
                }
            };

            /**
             * Dict with error/success callbacks
             * @type {{resolve: Function, reject: Function}}
             */
            let cb = {};

            let cleanup = () => {
                $_.ee.removeListener($_.MSG.MPOTR_AUTH, authMessageListener);
                clearTimeout(authenticationTimeout);
            };

            /**
             * Callback for unsuccessful authentication
             * @param err Error description
             */
            let fail = (err) => {
                cb["reject"](err);

                cleanup();
            };

            /*
             * There is a bug with setTimeout. If CPU is overloaded
             * setTimeout will be possibly triggered earlier.
             */
            let startTime = Date.now();
            let authenticationTimeout = setTimeout(() => {
                fail('Timeout: ' + (Date.now() - startTime));
            }, timeout);

            /**
             * Callback for success authentication
             */
            let success = () => {
                $_.ee.emitEvent($_.EVENTS.MPOTR_START);
                cb["resolve"]();

                cleanup();
            };

            /**
             * Promise which resolves when auth completes.
             * Can be rejected by timeout or protocol error.
             * @type {Promise}
             */
            let authenticationPhase = new Promise((resolve, reject) => {
                cb["resolve"] = resolve;
                cb["reject"] = reject;
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
            for (let client of this.client.connList.peers) {
                for (let round in this.rounds) {
                    roundsRcvd[round][client] = false;
                }
            }

            // Subscribing main listener for auth messages
            $_.ee.addListener($_.MSG.MPOTR_AUTH, authMessageListener);

            this.rounds[currentRound].send();

            return authenticationPhase;
        };

        this.bd = {
            MAX_MSGS_ON_THE_KEY: 100,
            KEY_TTL: 60 * 1000
        };

        this.bd.reset = (update_key_id) => {
            this.bd.ratcheting_now = false;
            this.bd.sent_r1 = false;
            this.bd.sent_r2 = false;

            this.bd.n = this.client.connList.peers.length + 1;
            this.bd.n_bi = new BigInteger(this.bd.n.toString(), 10);
            this.bd.messages_on_this_key = 0;

            if (update_key_id) {
                this.bd.current_key_id += 1;
            } else {
                this.bd.current_key_id = 0;
            }

            this.bd.x = NaN;
            this.bd.ks = {};
            this.bd.Ks = {};

            this.bd.sorted_peers = this.client.connList.peers.slice();
            this.bd.sorted_peers.push(this.client.peer.id);
            this.bd.sorted_peers.sort();

            this.bd.k = this.bd.sorted_peers.indexOf(this.client.peer.id);
            this.bd.left = this.bd.sorted_peers[(this.bd.k - 1 + this.bd.n) % this.bd.n];
            this.bd.right = this.bd.sorted_peers[(this.bd.k + 1) % this.bd.n];
            this.bd.last_kr_time = performance.now();
        };

        this.bd.sendRound1 = () => {
            utils.log('info',
                `Updating session keys:\n` +
                `${this.bd.messages_on_this_key} messages were already sent with the current key\n` +
                `${performance.now() - this.bd.last_kr_time} ms elapsed since the last Key Ratcheting`
            );

            this.bd.ratcheting_now = true;
            this.bd.x = generateNumber().mod(qmod);
            this.bd.ks[this.client.peer.id] = g.modPow(this.bd.x, pmod);

            this.broadcastOldBlue({
                type: $_.MSG.BD_KEY_RATCHET,
                round: 1,
                from: this.client.peer.id,
                key_id: this.bd.current_key_id + 1,
                data: this.bd.ks[this.client.peer.id].toString()
            });

            this.bd.sent_r1 = true;
        };

        this.bd.sendRound2 = () => {

            this.broadcastOldBlue({
                type: $_.MSG.BD_KEY_RATCHET,
                round: 2,
                from: this.client.peer.id,
                key_id: this.bd.current_key_id + 1,
                data: this.bd.Ks[this.client.peer.id].toString()
            });

            this.bd.sent_r2 = true;
        };

        this.bd.handleBDMessage = (msg) => {
            let round = msg["round"];
            let from = msg["from"];
            let data = msg["data"];
            let key_id = msg["key_id"];
            let left, right;

            // OldBlue self-delivery
            if (from === this.client.peer.id) {
                return;
            }

            if (key_id !== this.bd.current_key_id + 1) {
                // if less, ignore
                // if more, looks like fuckup
                return;
            }

            switch (round) {
                case 1:
                    if (!this.bd.sent_r1) {
                        this.bd.sendRound1();
                    }

                    this.bd.ks[from] = new BigInteger(data, 10);

                    left = this.bd.ks[this.bd.left];
                    right = this.bd.ks[this.bd.right];

                    if (left && right) {
                        this.bd.Ks[this.client.peer.id] = (right.multiply(left.modInverse(pmod))).modPow(this.bd.x, pmod);

                        if (!this.bd.sent_r2) {
                            this.bd.sendRound2();
                        }
                    }

                    break;
                case 2:
                    this.bd.Ks[from] = new BigInteger(data, 10);

                    if (Object.keys(this.bd.Ks).length === this.bd.n) {
                        left = this.bd.ks[this.bd.left];
                        let shared_secret = left.modPow(this.bd.x.multiply(this.bd.n_bi), pmod);

                        for (let i = 0; i < this.bd.n - 1; ++i) {
                            let d = this.bd.n_bi.subtract(new BigInteger((i + 1).toString(), 10));

                            shared_secret = shared_secret
                                .multiply(this.bd.Ks[this.bd.sorted_peers[(this.bd.k + i) % this.bd.n]]
                                    .modPow(d, pmod)).mod(pmod);
                        }

                        this.bd.reset(true);
                        utils.log('info', `shared_secret = ${shared_secret}`);
                    }

                    break;
                default:

            }
        };

        /**
         * When the time since the last Key Ratcheting will
         * be more than KEY_TTL a new one will be triggered
         */
        $_.ee.addListener($_.EVENTS.MPOTR_START, () => {
            this.bd.reset();
        });

        /**
         * When messages_on_this_key > MAX_MSGS_ON_KEY
         * Key Ratcheting will start.
         */
        $_.ee.addListener($_.EVENTS.OLDBLUE_MSG_DELIVERED, () => {
            this.bd.messages_on_this_key += 1;
        });

        /**
         * OldBlue listener for Key Ratcheting messages
         */
        $_.ee.addListener($_.MSG.BD_KEY_RATCHET, (_, data) => {
            this.receiveMessage(data);
        });

        /**
         * Daemon.
         *
         * Daemon is responsible for performing periodic tasks, like a
         * key renewal or requesting for lost messages
         */
        this.daemon = setInterval(() => {
            // Заменить на emitEvent
            switch(this.status) {
                case $_.STATUS.MPOTR:
                    if (!this.bd.ratcheting_now) {
                        let elapsed_since_last_kr = performance.now() - this.bd.last_kr_time;
                        if (this.bd.messages_on_this_key > this.bd.MAX_MSGS_ON_THE_KEY || elapsed_since_last_kr > this.bd.KEY_TTL) {
                            this.bd.sendRound1();
                        }
                    }

                break;
                default:

                break;
            }
        }, 3000);
    }

    return mpOTRContext;
});
