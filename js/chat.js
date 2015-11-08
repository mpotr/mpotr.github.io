/**
 * @property {Peer} peer Peer object
 * @property {Array} connPool Connections' pool
 * @property {string} nickname Nickname used in chat
 */
var client = {
    peer: undefined,
    connPool: [],
    nickname: "",

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
    },

    /**
    * Disconnects peer safely
    */
    chatDisconnect: function () {
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
    sendMessage: function (message, type="msg") {
        var data = {
           "type": type,
           "data": message
        };

        // Is sendMessage always initialized?
        for (var idx in this.connPool) {
            this.connPool[idx].send(data);
        }
        
        if (type === "msg")
        {
            writeToChat(this.nickname, message);
        }
    }
};

/**
 * Writes authorized message to chat
 * @param {string} author
 * @param {string} message
 */
function writeToChat(author, message) {
    var msg = document.createElement('code');
    $(msg).text(author + ': ' + message + '\n');
    $('#chat').append(msg);
    // Autoscroll
    $('#chat').scrollTop($('#chat')[0].scrollHeight);
}

var context = new mpOTRContext(client);

/**
 * Function responsible for message handling:
 * - prints message
 * - sends acknoledgements
 * @param {Object} data message received
 */
function handleMessage(data) {
    // TODO: send ACK
    switch (data["type"]) {
        case "msg":
            writeToChat(this.peer, data["data"]);
            break;
        case "ack":
            // Another message types
            break;
        case "mpOTR":
            context.receive(this.peer, data["data"], client);
            break;
        default:
            // TODO: Something more adequate
            alert("Error: unexpected message type");
    }
}
