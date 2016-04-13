define(['crypto', 'peerjs'], function(mpOTRContext) {
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

            if (!this.connPool.add) {
                Object.defineProperty(this.connPool, "add", {
                    value: function(newConn) {
                        let idx = this.map(conn => conn.peer).indexOf(newConn.peer);

                        if (idx === -1) {
                            this.push(newConn);
                        } else if (this[idx].id > newConn.id) {
                            newConn.off("close");
                            newConn.close();
                            return;
                        } else {
                            this[idx].off("close");
                            this[idx].close();
                            this.splice(idx, 1);
                            this.push(newConn);
                        }
                        client.context.emitEvent(client.context.EVENTS.CONN_POOL_ADD, [newConn]);

                        return this;
                    }
                });
            }

            if (!this.connPool.remove) {
                Object.defineProperty(this.connPool, "remove", {
                    value: function(elem) {
                        var idx = this.indexOf(elem);

                        if (idx > -1) {
                            this.splice(idx, 1);
                            client.context.emitEvent(client.context.EVENTS.CONN_POOL_REMOVE);

                            return elem;
                        }

                        return undefined;
                    }
                });
            }

            this.context.subscribeOnEvent(this.context.EVENTS.MPOTR_SHUTDOWN_FINISH, () => {
                client.blockChat = false;
            });
            
            this.context.subscribeOnEvent(this.context.EVENTS.BLOCK_CHAT, () => {
                client.blockChat = true;
            });

            this.context.subscribeOnEvent(this.context.EVENTS.CONN_POOL_ADD, (conn) => {
                conn.send({
                    "type": "connPoolSync",
                    "data": this.connPool.map(conn => conn.peer)
                });
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

                for (let i = 0; i < this.connPool.length; ++i) {
                    if (this.connPool[i].peer === anotherPeer) {
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
            console.log(author + ": " + message);
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
        // TODO: Add sid check
        if (["unencrypted", "mpOTR", "connPoolSync"].indexOf(data["type"]) === -1){
            if (!client.context.checkSig(data, this.peer)) {
                alert("Signature check fail");
            }
        }

        switch (data["type"]) {
            case "unencrypted":
                client.writeToChat(this.peer, data["data"]);
                break;
            case "connPoolSync":
                for (let peer of data["data"]) {
                    client.addPeer(peer);
                }
                break;
            case "mpOTR":
                client.context.receive(this.peer, data["data"]);
                break;
            case "mpOTRChat":
                client.context.receiveMessage(data);
                break;
            case "mpOTRLostMessage":
                var response = client.context.deliveryResponse(data);

                if (response) {
                    this.send(response);
                }
                break;
            case "mpOTRShutdown":
                if (client.context.receiveShutdown(data)) {
                    client.context.emitEvent(client.context.EVENTS.MPOTR_SHUTDOWN_FINISH);
                    console.log("info", "mpOTRContext reset");
                }
                break;
            case "chatSyncReq":
                client.context.emitEvent(client.context.EVENTS.BLOCK_CHAT);

                // Removing 'dead' connections
                let toDel = client.connPool.filter((elem) => {
                    return data['connPool'].indexOf(elem.peer) === -1;
                });
                
                for (let elem of toDel) {
                    elem.close();
                    client.connPool.remove(elem);
                }

                client.context.subscribeOnEvent(client.context.EVENTS.CHAT_SYNCED, () => {
                    // send message to the sync boy
                    let message = {
                        "type": "chatSyncRes",
                        "sid": client.context.sid
                    };
                    client.context.signMessage(message);

                    this.send(message);
                }, true);

                if (client.isChatSynced()) {
                    client.context.emitEvent(client.context.EVENTS.CHAT_SYNCED);
                } else {
                    client.context.deliveryRequest();
                }
            break;
            case "chatSyncRes":
                client.context.emitEvent(client.context.EVENTS.CHAT_SYNC_RES, [this.peer]);
            break;
            default:
                // TODO: Something more adequate
                alert("Error: unexpected message type");
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
                console.log("info", "mpOTRContext reset");
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
