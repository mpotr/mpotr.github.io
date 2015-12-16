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
     */
    init: function () {
        this.peer = new Peer({key: '2bmv587i7jru23xr'});

        this.peer.on('open', function() {
            $('#peerID').html("Your id is: " + this.id);
            client.nickname = this.id;
        });
        
        this.peer.on('connection', function(conn) {
            client.addPeer(conn);
        });

        this.context = new mpOTRContext(this);
    },

    /**
    * Disconnects peer safely
    */
    chatDisconnect: function () {
        // TODO: this function is outdated
        if (!this.peer.disconnected || !this.peer.destroyed) {
            this.peer.destroy();
        }
    },
    
    /**
    * Adds peer to chat
    * @param {DataConnection|Peer} anotherPeer New peer or established connection
    */
    addPeer: function (anotherPeer) {
        var conn;

        // TODO: Peer replication
        if (typeof anotherPeer === "string") {
            // TODO: add error handling
            conn = this.peer.connect(anotherPeer);
        } else {
            conn = anotherPeer;
        }

        conn.on('data', handleMessage);
        this.connPool.push(conn);
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

        if (type === "unencrypted")
        {
            writeToChat(this.nickname, message);
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
    }
};

/**
 * Writes authorized message to chat
 * @param {string} author
 * @param {string} message
 */
function writeToChat(author, message) {
    // TODO: Add this function to client
    var msg = document.createElement('code');
    $(msg).text(author + ': ' + message + '\n');
    $('#chat').append(msg);
    // Autoscroll
    $('#chat').scrollTop($('#chat')[0].scrollHeight);
}

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
            writeToChat(this.peer, data["data"]);
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
        default:
            // TODO: Something more adequate
            alert("Error: unexpected message type");
    }
}
