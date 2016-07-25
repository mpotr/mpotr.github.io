define(['crypto', 'debug', 'peerjs'], function(mpOTRContext, debug) {
    "use strict";

    /**
     * @property {Peer} peer Peer object
     * @property {Array} connPool Connections' pool
     * @property {string} nickname Nickname used in chat
     */
    var client = {
        peer: undefined,
        connPool: [],
        nickname: "",
        frontier: [],
        lostMsg: [],
        delivered: [],
        undelivered: [],
        friends: [],
        on: {},
        blockChat: false,

        /**
         * Initialization of peer
         * @param {String} peerID Desirable peer id
         * @param {function} writeFunc overrides client's writeToChat
         * @param {Object} callbacks callbacks on peer open, add, disconnect
         */
        init: function (peerID, writeFunc, callbacks) {
            this.writeToChat = writeFunc;
            this.on = callbacks;

            this.peer = new Peer(peerID, {key: '2bmv587i7jru23xr'})
                .on('open', this.on["open"])
                .on('connection', function (conn) {
                    client.addPeer(conn);
                });

            this.context = new mpOTRContext(this);
            let context = this.context;

            if (!this.connPool.peers) {
                Object.defineProperty(this.connPool, "peers", {
                    value: []
                })
            }

            if (!this.connPool.add) {
                Object.defineProperty(this.connPool, "add", {
                    value: function(newConn) {
                        let idx = this.peers.indexOf(newConn.peer);

                        if (idx === -1) {
                            this.push(newConn);
                            this.peers.push(newConn.peer);
                        } else if (this[idx].id > newConn.id) {
                            newConn.off("close");
                            newConn.close();
                            return;
                        } else {
                            this[idx].off("close");
                            this[idx].close();
                            this.splice(idx, 1);
                            this.peers.splice(idx, 1);
                            this.push(newConn);
                            this.peers.push(newConn.peer);
                        }
                        client.context.emitEvent(client.context.EVENTS.CONN_POOL_ADD, [newConn]);

                        return this;
                    }
                });
            }

            if (!this.connPool.remove) {
                Object.defineProperty(this.connPool, "remove", {
                    value: function(elem) {
                        var idx = this.peers.indexOf(elem.peer);

                        if (idx > -1) {
                            this.splice(idx, 1);
                            this.peers.splice(idx, 1);
                            client.context.emitEvent(client.context.EVENTS.CONN_POOL_REMOVE);

                            return elem;
                        }

                        return undefined;
                    }
                });
            }

            context.subscribeOnEvent(context.EVENTS.MPOTR_SHUTDOWN_FINISH, () => {
                client.blockChat = false;
            });
            
            context.subscribeOnEvent(context.EVENTS.BLOCK_CHAT, () => {
                client.blockChat = true;
            });

            context.subscribeOnEvent(context.EVENTS.CONN_POOL_ADD, (conn) => {
                conn.send({
                    "type": context.MSG.CONN_POOL_SYNC,
                    "data": this.connPool.peers
                });
            });

            // Subscribing of client message types
            context.subscribeOnEvent(context.MSG.UNENCRYPTED, (conn, data) => {
                client.writeToChat(conn.peer, data["data"]);
            });

            context.subscribeOnEvent(context.MSG.CONN_POOL_SYNC, (conn, data) => {
                for (let peer of data["data"]) {
                    client.addPeer(peer);
                }
            });

            context.subscribeOnEvent(context.MSG.CHAT_SYNC_REQ, (conn, data) => {
                if (!context.checkSig(data, conn.peer)) {
                    alert("Signature check fail");
                }

                context.emitEvent(context.EVENTS.BLOCK_CHAT);

                // Removing 'dead' connections
                let toDel = client.connPool.filter((elem) => {
                    return data['connPool'].indexOf(elem.peer) === -1;
                });

                for (let elem of toDel) {
                    elem.close();
                    client.connPool.remove(elem);
                }

                context.subscribeOnEvent(context.EVENTS.CHAT_SYNCED, () => {
                    // send message to the sync boy
                    let message = {
                        "type": context.MSG.CHAT_SYNC_RES,
                        "sid": context.sid
                    };
                    context.signMessage(message);

                    conn.send(message);
                }, true);

                if (client.isChatSynced()) {
                    context.emitEvent(context.EVENTS.CHAT_SYNCED);
                } else {
                    context.deliveryRequest();
                }
            });
        },

        /**
         * Disconnects peer safely
         */
        chatDisconnect: function () {
            if (!this.peer.disconnected || !this.peer.destroyed) {
                if (this.context.status === "chat") {
                    this.context.stopChat();
                }
                
                // TODO: Think about validation
                setTimeout(() => {
                    this.peer.destroy();
                }, 2000);
            }
        },

        /**
         * Adds peer to connection pool
         * @param {DataConnection|string} anotherPeer New peer or established connection
         */
        addPeer: function (anotherPeer) {
            var success = (function(self) {
                return function(conn) {
                    conn.on('data', handleMessage)
                        .on('close', function() {
                            handleDisconnect(this, self.on["close"]);
                        });

                    self.connPool.add(conn);
                    self.addFriend(conn.peer);

                    if (self.on["add"]) {
                        self.on["add"]();
                    }
                }
            })(this);

            if (typeof anotherPeer === "string") {
                if (this.peer.id === anotherPeer) {
                    return;
                }

                for (let peer of this.connPool.peers) {
                    if (peer === anotherPeer) {
                        return;
                    }
                }

                // TODO: add error handling
                this.peer.connect(anotherPeer).on("open", function () {
                    // Will use "this" of data connection
                    success(this);
                });
            } else {
                anotherPeer.on('open', function() {
                    success(this);
                });
            }
        },

        /**
         * Adds peer to friend list
         * @param friend peer to add
         */
        addFriend: function (friend) {
            if (this.friends.indexOf(friend) === -1) {
                this.friends.push(friend);
            }
        },

        /**
         * Sends typed message to peers in
         * connPool
         * @param {*} message Message can be any combination of native JS types
         * @param {String} type Type of message (e.g. unencrypted, mpOTR, etc.)
         */
        sendMessage: function (message, type) {
            var data = {
                "type": type,
                "data": message
            };

            this.broadcast(data);

            if (type === "unencrypted") {
                this.writeToChat(this.nickname, message);
            }
        },

        /**
         * Sends JS object to all clients in connPool
         * Used by other sending functions
         * @param {Object} data Object to send
         */
        broadcast: function (data) {
            for (let conn of this.connPool) {
                conn.send(data);
            }
        },

        /**
         * Writes authorized message to chat
         * Should be replaced in init
         * @param {string} author
         * @param {string} message
         */
        writeToChat: function (author, message) {
            debug.log(author + ": " + message);
        },

        /**
         * Determines whether current client is
         * a leader of communication
         */
        amILeader: function() {
            var leaderFromConnPool = this.connPool.reduce(function(conn1, conn2){
                if (conn1.peer > conn2.peer) {
                    return conn1;
                } else {
                    return conn2;
                }
            }, {peer: ''});

            return leaderFromConnPool.peer < this.peer.id;
        },

        /**
         * Checks whether there is known lost messages
         * @returns {boolean}
         */
        isChatSynced: function () {
            return this.lostMsg.length === 0 && this.undelivered.length === 0;
        }
    };

    /**
     * Function responsible for message handling:
     * - prints message
     * - sends acknowledgements
     * @param {Object} data message received
     */
    function handleMessage(data) {
        let context = client.context;

        // Message has come
        context.emitEvent(context.EVENTS.INCOMING_MSG, [this, data]);

        // Event for specific message types
        if (context.MSG.hasMsgType(data["type"])) {
            context.emitEvent(data["type"], [this, data]);
        } else {
            debug.log("alert", "Incorrect Message Type: " + data["type"]);
        }
    }

    /**
     * Function that handles disconnection of peer.
     * Behavior depends on chat status: mpOTR or cleartext.
     * Removes connection from connection pool and
     * from peer.connections property
     */
    function handleDisconnect(conn, callback) {
        client.connPool.remove(conn);

        if (callback) {
            callback();
        }

        if (client.context.status === "chat") {
            client.context.emitEvent(client.context.EVENTS.BLOCK_CHAT);

            if (client.connPool.length === 0) {
                client.context.emitEvent(client.context.EVENTS.MPOTR_SHUTDOWN_FINISH);
                debug.log("info", "mpOTRContext reset");
                return;
            }

            if (client.amILeader()) {
                client.context.subscribeOnEvent(client.context.EVENTS.MPOTR_SHUTDOWN_FINISH, function() {
                    setTimeout(() => {
                        client.context.start();
                    }, 0);
                }, true);
                client.context.stopChat();
            }
        }
    }

    return client;
});
