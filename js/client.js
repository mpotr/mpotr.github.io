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
                    value: function(elem) {
                        client.context.emitEvent('connPoolAdd');
                        this.push(elem);

                        return this;
                    }
                });
            }

            if (!this.connPool.remove) {
                Object.defineProperty(this.connPool, "remove", {
                    value: function(elem) {
                        var idx = this.indexOf(elem);

                        if (idx > -1) {
                            client.context.emitEvent('connPoolRemove');
                            this.splice(idx, 1);

                            return elem;
                        }

                        return undefined;
                    }
                });
            }

            this.context.subscribeOnEvent('shutdown', () => {
                client.blockChat = false;
            });
            
            this.context.subscribeOnEvent('blockChat', () => {
                client.blockChat = true;
            })
        },

        /**
         * Disconnects peer safely
         */
        chatDisconnect: function () {
            if (!this.peer.disconnected || !this.peer.destroyed) {
                this.context.stopChat();
                // TODO: Think about validation
                setTimeout(() => {
                    this.peer.destroy();
                }, 2000);
            }
        },

        /**
         * Adds peer to connection pool
         * @param {DataConnection|Peer} anotherPeer New peer or established connection
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
                success(anotherPeer);
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
        }
    };

    /**
     * Function responsible for message handling:
     * - prints message
     * - sends acknowledgements
     * @param {Object} data message received
     */
    function handleMessage(data) {
        // TODO: send ACK
        switch (data["type"]) {
            case "unencrypted":
                client.writeToChat(this.peer, data["data"]);
                break;
            case "mpOTR":
                client.context.receive(this.peer, data["data"]);
                break;
            case "mpOTRChat":
                if (this.peer !== data["from"]) {
                    console.log('alert', "Senders id don't match");
                }

                client.context.receiveMessage(data);
                break;
            case "mpOTRLostMessage":
                var response = client.context.deliveryResponse(data);

                if (response) {
                    this.send(response);
                }
                break;
            case "mpOTRShutdown":
                if (this.peer !== data["from"]) {
                    console.log('alert', "Senders id don't match");
                }

                if (client.context.receiveShutdown(data)) {
                    client.context.emitEvent('shutdown');
                    console.log("info", "mpOTRContext reset");
                }
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
        var idx = client.connPool.indexOf(conn);

        if (idx > -1) {
            client.connPool.remove(conn);
            delete client.peer.connections[conn.peer];
        }

        if (callback) {
            callback();
        }

        if (client.context.status === "chat" && client.amILeader()) {
            client.context.subscribeOnEvent('shutdown', function() {
                client.context.start();
            }, true);
            client.context.sendShutdown();
        }
    }

    return client;
});
