define(['crypto', 'peerjs'], function(mpOTRContext) {
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

        /**
         * Initialization of peer
         * @param {function} writeFunc overrides client's writeToChat
         * @param {String} peerID Desirable peer id
         * @param {function} callback action on successful connection with peer server
         */
        init: function (writeFunc, peerID, callback) {
            this.writeToChat = writeFunc;

            this.peer = new Peer(peerID, {key: '2bmv587i7jru23xr'})
                .on('open', callback)
                .on('connection', function (conn) {
                    client.addPeer(conn);
                });

            this.context = new mpOTRContext(this);
        },

        /**
         * Disconnects peer safely
         */
        chatDisconnect: function () {
            if (!this.peer.disconnected || !this.peer.destroyed) {
                this.context.stopChat();
                // TODO: Think about validation
                setTimeout(function () {
                    this.peer.destroy();
                }, 2000);
            }
        },

        /**
         * Adds peer to connection pool
         * @param {DataConnection|Peer} anotherPeer New peer or established connection
         */
        addPeer: function (anotherPeer, callback) {
            var conn;

            if (typeof anotherPeer === "string") {
                if (this.peer.id === anotherPeer) {
                    return;
                }

                for (var i = 0; i < this.connPool.length; ++i) {
                    if (this.connPool[i].peer === anotherPeer) {
                        return;
                    }
                }

                // TODO: add error handling
                conn = this.peer.connect(anotherPeer);
            } else {
                conn = anotherPeer;
            }

            conn.on('data', handleMessage)
                .on('close', handleDisconnect);

            this.connPool.push(conn);

            if (callback) {
                callback();
            }
        },

        /**
         * Sends text message to peers in
         * connPool
         * @param {string} message
         */
        sendMessage: function (message, type) {
            var data = {
                "type": type,
                "data": message
            };

            this._sendMessage(data);

            if (type === "unencrypted") {
                this.writeToChat(this.nickname, message);
            }
        },

        /**
         * Sends JS object to all clients in connPool
         * Used by other sending functions
         * @param {Object} data Object to send
         * @private
         */
        _sendMessage: function (data) {
            for (var idx in this.connPool) {
                this.connPool[idx].send(data);
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
        }
    };

    /**
     * Function responsible for message handling:
     * - prints message
     * - sends acknoledgements
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
                    log('alert', "Senders id don't match");
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
                    log('alert', "Senders id don't match");
                }
                if (client.context.receiveShutdown(data)) {
                    //TODO: think about removing old mpOTRContext
                    client.context = new mpOTRContext(this);
                    log("info", "mpOTRContext reset");
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
    function handleDisconnect() {
        var idx = client.connPool.indexOf(this);

        if (idx > -1) {
            client.connPool.splice(idx, 1);
            delete client.peer.connections[this.peer];
        }
        // TODO: uncomment properly
        //if (client.context.status == "chat") {
        //    client.reconnect();
        //}
    }

    return client;
});