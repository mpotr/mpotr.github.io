define(['crypto', 'utils', 'events', 'peerjs'], function(mpOTRContext, utils, $_) {
    "use strict";

    /**
     * Represents a transport layer in protocol.
     * @property {Peer} peer Peer object
     * @property {DataConnection[]} connList An array of currently connected users
     * @property {String} nickname A nickname used in chat
     * @property {String[]} whitelist a list of hosts allowed to connect to
     * @property {Boolean} blockChat a flag for blocking user messages
     */
    let client = {
        peer: undefined,
        connList: [],
        nickname: "",
        whitelist: [],
        blockChat: false,

        /**
         * Initialization of peer
         * @param {String} peerID Desirable peer id
         * @param {function} writeFunc overrides client's writeToChat
         */
        init: function (peerID, writeFunc) {
            this.writeToChat = writeFunc;

            this.peer = new Peer(peerID, {key: '2bmv587i7jru23xr'});
            this.peer.on('connection', function (conn) {
                $_.ee.emitEvent(($_.EVENTS.NEW_CONN), [conn]);
            });

            this.peer.on('open', (id) => {
                $_.ee.emitEvent($_.EVENTS.PEER_OPENED, [id]);
            });

            this.context = new mpOTRContext(this);
            let context = this.context;

            /**
             * Transport section:
             *
             * - connList.peers
             * - connList.add
             * - connList.remove
             * - action on peer's addition
             */

            /**
             * Auxiliary list with peers' nicknames
             */
            if (!this.connList.peers) {
                Object.defineProperty(this.connList, "peers", {
                    value: []
                })
            }

            /**
             * this.connList.add - handles peer addition.
             *
             * This function is responsible for:
             *
             * - addition of a new peer to the connList;
             * - duplicate removing;
             * - emitting event CONN_LIST_ADD to notify other
             * components about new peer;
             * - corresponding modification of auxiliary list connList.peers.
             */
            if (!this.connList.add) {
                Object.defineProperty(this.connList, "add", {
                    value: function(newConn) {
                        let idx = this.peers.indexOf(newConn.peer);

                        if (idx === -1) {
                            this.push(newConn);
                            this.peers.push(newConn.peer);
                            $_.ee.emitEvent($_.EVENTS.CONN_LIST_ADD, [newConn]);
                        } else if (this[idx].id > newConn.id) {
                            newConn.off("close");
                            newConn.close();
                        } else {
                            this[idx].off("close");
                            this[idx].close();
                            this.splice(idx, 1);
                            this.peers.splice(idx, 1);
                            this.push(newConn);
                            this.peers.push(newConn.peer);
                        }
                    }
                });
            }

            /**
             * this.connList.remove - handles peer removing.
             *
             * This function is responsible for:
             * - removing a peer from connList
             * - corresponding removing of a peer from auxiliary list connList.peers
             * - emitting event CONN_LIST_REMOVE to notify other components about peer removal;
             */
            if (!this.connList.remove) {
                Object.defineProperty(this.connList, "remove", {
                    value: function(elem) {
                        let idx = this.peers.indexOf(elem.peer);

                        if (idx > -1) {
                            this.splice(idx, 1);
                            this.peers.splice(idx, 1);
                            $_.ee.emitEvent($_.EVENTS.CONN_LIST_REMOVE, [elem]);

                            return elem;
                        }

                        return undefined;
                    }
                });
            }

            /**
             * Action on new connection in unencrypted phase
             */
            $_.ee.addListener($_.EVENTS.NEW_CONN, context.checkStatus([$_.STATUS.UNENCRYPTED], (conn) => {
                this.addPeer(conn);
            }));

            /**
             * Action on new connection in mpotr phases: authentication, communication, shutdown
             */
            $_.ee.addListener($_.EVENTS.NEW_CONN, context.checkStatus([$_.STATUS.AUTH, $_.STATUS.MPOTR, $_.STATUS.SHUTDOWN], (conn) => {
                if (conn.open) {
                    conn.close()
                } else {
                    conn.on('open', () => {
                        conn.close();
                    })
                }
            }));

            /**
             * Action on peer's addition: send my connections to
             * the new participant.
             */
            $_.ee.addListener($_.EVENTS.CONN_LIST_ADD, (conn) => {
                conn.send({
                    "type": $_.MSG.CONN_LIST_SYNC,
                    "data": this.connList.peers
                });
            });

            /**
             * On removing conn - send message
             */
            $_.ee.addListener($_.EVENTS.CONN_LIST_REMOVE, (conn) => {
                this.sendMessage(conn.peer, $_.MSG.CONN_LIST_REMOVE);
            });

            /**
             * Add peers got from new connections
             */
            $_.ee.addListener($_.MSG.CONN_LIST_SYNC, (conn, data) => {
                if (context.status !== $_.STATUS.UNENCRYPTED) {
                    utils.log('info', 'Got connection pool synchronization during non-unencrypted phase');
                } else {
                    for (let peer of data["data"]) {
                        client.addPeer(peer);
                    }
                }
            });

            /**
             * Incoming message to delete lost connections
             */
            $_.ee.addListener($_.MSG.CONN_LIST_REMOVE, (conn, data) => {
                client.closePeerByName(data["data"]);
            });

            /**
             * End of transport section
             */

            /**
             * Block chat section
             */

            /**
             * Unblock chat when shutdown phase ends
             */
            $_.ee.addListener($_.EVENTS.MPOTR_SHUTDOWN_FINISH, () => {
                client.blockChat = false;
            });

            /**
             * Block chat. At the moment is used while shutdown phase is running
             */
            $_.ee.addListener($_.EVENTS.BLOCK_CHAT, () => {
                client.blockChat = true;
            });

            /**
             * End of block chat section
             */

            /**
             * Handler for unencrypted messages
             */
            $_.ee.addListener($_.MSG.UNENCRYPTED, context.checkStatus([$_.STATUS.UNENCRYPTED], (conn, data) => {
                client.writeToChat(conn.peer, data["data"]);
            }));
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
                            handleDisconnect(this);
                        });

                    self.addFriend(conn.peer);
                    self.connList.add(conn);
                }
            })(this);

            if (typeof anotherPeer === "string") {
                if (this.peer.id === anotherPeer) {
                    return;
                }

                for (let peer of this.connList.peers) {
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
            if (this.whitelist.indexOf(friend) === -1) {
                this.whitelist.push(friend);
            }
        },

        /**
         * Close peer by name
         * @param {String} peer peer to delete
         */
        closePeerByName: function (peer) {
            let idx = client.connList.peers.indexOf(peer);

            if (idx > -1) {
                let elem = client.connList[idx];
                elem.close();
            }
        },

        /**
         * Sends typed message to peers in
         * connList
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
         * Sends JS object to all clients in connList
         * Used by other sending functions
         * @param {Object} data Object to send
         */
        broadcast: function (data) {
            for (let conn of this.connList) {
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
            utils.log('info', author + ": " + message);
        },

        /**
         * Determines whether current client is
         * a leader of communication
         */
        amILeader: function() {
            let leaderFromConnPool = this.connList.reduce(function(conn1, conn2){
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
            return this.context.lostMsg.length === 0 && this.context.undelivered.length === 0;
        }
    };

    /**
     * Function responsible for message handling:
     * @param {Object} data message received
     */
    function handleMessage(data) {
        $_.ee.emitEvent($_.EVENTS.INCOMING_MSG, [this, data]);
        $_.ee.emitEvent(data["type"], [this, data]);
    }

    /**
     * Function that handles disconnection of peer.
     * Behavior depends on chat status: mpOTR or cleartext.
     * Removes connection from connection pool and
     * from peer.connections property
     */
    function handleDisconnect(conn) {
        client.connList.remove(conn);
    }

    return client;
});
