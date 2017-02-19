define(['crypto', 'debug', 'strings', 'peerjs'], function(mpOTRContext, debug, $_) {
    "use strict";

    /**
     * @property {Peer} peer Peer object
     * @property {Array} connPool Connections' pool
     * @property {string} nickname Nickname used in chat
     */
    let client = {
        peer: undefined,
        connPool: [],
        nickname: "",
        frontier: [],
        lostMsg: [],
        delivered: [],
        undelivered: [],
        friends: [],
        cb: {},
        blockChat: false,

        /**
         * Initialization of peer
         * @param {String} peerID Desirable peer id
         * @param {function} writeFunc overrides client's writeToChat
         * @param {Object} callbacks callbacks on peer open, add, disconnect
         */
        init: function (peerID, writeFunc, callbacks) {
            this.writeToChat = writeFunc;
            this.cb = callbacks;

            this.peer = new Peer(peerID, {key: '2bmv587i7jru23xr'});
            this.peer.on('connection', function (conn) {
                client.addPeer(conn);
            });

            this.peer.on('open', this.cb["open"]);

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
                        $_.ee.emitEvent($_.EVENTS.CONN_POOL_ADD, [newConn]);

                        return this;
                    }
                });
            }

            if (!this.connPool.remove) {
                Object.defineProperty(this.connPool, "remove", {
                    value: function(elem) {
                        let idx = this.peers.indexOf(elem.peer);

                        if (idx > -1) {
                            this.splice(idx, 1);
                            this.peers.splice(idx, 1);
                            $_.ee.emitEvent($_.EVENTS.CONN_POOL_REMOVE, [elem]);

                            return elem;
                        }

                        return undefined;
                    }
                });
            }

            $_.ee.addListener($_.EVENTS.MPOTR_START, () => {
                context.status = $_.STATUS.MPOTR;
            });

            $_.ee.addListener($_.EVENTS.MPOTR_SHUTDOWN_FINISH, () => {
                client.blockChat = false;
            });
            
            $_.ee.addListener($_.EVENTS.BLOCK_CHAT, () => {
                client.blockChat = true;
            });

            $_.ee.addListener($_.EVENTS.CONN_POOL_ADD, (conn) => {
                conn.send({
                    "type": $_.MSG.CONN_POOL_SYNC,
                    "data": this.connPool.peers
                });
            });

            // Сlient message handlers
            $_.ee.addListener($_.MSG.UNENCRYPTED, (conn, data) => {
                if (context.status !== $_.STATUS.UNENCRYPTED) {
                    debug.log('info', 'Got unencrypted message during non-unencrypted phase');
                } else {
                    client.writeToChat(conn.peer, data["data"]);
                }
            });

            $_.ee.addListener($_.MSG.CONN_POOL_SYNC, (conn, data) => {
                if (context.status !== $_.STATUS.UNENCRYPTED) {
                    debug.log('info', 'Got connection pool synchronization during non-unencrypted phase');
                } else {
                    for (let peer of data["data"]) {
                        client.addPeer(peer);
                    }
                }
            });

            $_.ee.addListener($_.MSG.CHAT_SYNC_REQ, (conn, data) => {
                if (!context.checkSig(data, conn.peer)) {
                    debug.log('alert', "Signature check fail");
                    return;
                }

                $_.ee.emitEvent($_.EVENTS.BLOCK_CHAT);

                // Removing 'dead' connections
                let toDel = client.connPool.filter((elem) => {
                    return data['connPool'].indexOf(elem.peer) === -1;
                });

                for (let elem of toDel) {
                    elem.close();
                    client.connPool.remove(elem);
                }

                $_.ee.addOnceListener($_.EVENTS.CHAT_SYNCED, () => {
                    // send message to the sync boy
                    let message = {
                        "type": $_.MSG.CHAT_SYNC_RES,
                        "sid": context.sid
                    };
                    context.signMessage(message);

                    conn.send(message);
                });

                if (client.isChatSynced()) {
                    $_.ee.emitEvent($_.EVENTS.CHAT_SYNCED);
                } else {
                    context.deliveryRequest();
                }
            });
        },

        /**
         * Disconnects peer
         */
        chatDisconnect: function () {
          /**
           * Actually there is no strict necessity to
           * publish ephemeral keys in case of tab closing.
           * So it is better to destroy connection rather than
           * try to end chat gracefully (which is impossible)
           * TODO: clean ALL variables containing session key (use debugger, Luke)
           */
          if (!this.peer.disconnected || !this.peer.destroyed) {
              this.peer.destroy();
            }
        },

        /**
         * Adds peer to connection pool
         * @param {DataConnection|string} anotherPeer New peer or established connection
         */
        addPeer: function (anotherPeer) {
            let success = (function(self) {
                return function(conn) {
                    conn.on('data', handleMessage)
                        .on('close', function() {
                            handleDisconnect(this, self.cb["close"]);
                        });

                    self.connPool.add(conn);
                    self.addFriend(conn.peer);

                    if (self.cb["add"]) {
                        self.cb["add"]();
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
            let data = {
                "type": type,
                "data": message
            };

            this.broadcast(data);

            if (type === $_.MSG.UNENCRYPTED) {
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
            debug.log('info', author + ": " + message);
        },

        /**
         * Determines whether current client is
         * a leader of communication
         */
        amILeader: function() {
            let leaderFromConnPool = this.connPool.reduce(function(conn1, conn2){
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
        $_.ee.emitEvent($_.EVENTS.INCOMING_MSG, [this, data]);
        $_.ee.emitEvent(data["type"], [this, data]);
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

        if (client.context.status === $_.STATUS.MPOTR) {
            $_.ee.emitEvent($_.EVENTS.BLOCK_CHAT);

            if (client.connPool.length === 0) {
                $_.ee.emitEvent($_.EVENTS.MPOTR_SHUTDOWN_FINISH);
                debug.log("info", "mpOTRContext reset");
                return;
            }

            if (client.amILeader()) {
                $_.ee.addOnceListener($_.EVENTS.MPOTR_SHUTDOWN_FINISH, function() {
                    setTimeout(() => {
                        client.context.start();
                    }, 0);
                });
                client.context.stopChat();
            }
        }
    }

    return client;
});
