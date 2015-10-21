var _id = 0;

/**
 * Disconnects peer on close
 * @param {Peer} peer Peer to disconnect
 */
function chatDisconnect(peer) {
    if (peer && (!peer.disconnected || !peer.destroyed)) {
        peer.destroy();
    }
}

/**
 * Adds peer to chat
 * @param {Peer} peer Client peer
 * @param {Array} connPool Connections pool
 * @param {DataConnection|Peer} anotherPeer New peer or established connection
 */
function addPeer(peer, connPool, anotherPeer) {
    var conn;

    // TODO: Peer replication
    if (typeof anotherPeer === "string") {
        // TODO: add error handling
        conn = peer.connect(anotherPeer);
    } else {
        conn = anotherPeer;
    }

    conn.on('data', handleMessage);
    connPool.push(conn);

    return conn;
}

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
            this.send({
                "type": "ack",
                "id": data["id"],
                "data": ""
            });
            break;
        case "ack":
            if (msgPool) {
                if (msgPool[0]["chk"] || msgPool[0]["id"] === data["id"]) {
                    writeToChat('Me', msgPool.shift()["data"]);
                } else {
                    for (idx in msgPool) {
                        if (msgPool[idx]["id"] === data["id"]) {
                            msgPool[idx]["chk"] = true;
                            break;
                        }
                    }
                }
            }
            break;
        default:
            // TODO: Something more adequate
            alert("Error: unexpected message type");
    }
}


/**
 * Globally replaces danger characters in str
 * @param {string} str
 * @returns {string} "safe" string
 */
function makeSafe(str) {
    return str.replace(/</g, '&lt;').
            replace(/>/g, '&gt;').
            replace(/&/g, '&amp;').
            replace(/\\/g, '&#x5c;').
            replace(/"/g, '&quot;').
            replace(/'/g, '&#x27;').
            replace(/\//g, '&#x2f');
}

/**
 * Sends text message to peers in
 * connPool
 * @param {Array} connPool
 * @param {string} message
 */
function sendMessage(connPool, message) {
    var data = {
        "type": "msg",
        "id": _id++,
        "data": message
    };

    for (var idx in connPool) {
        connPool[idx].send(data);

        data["chk"] = false;
        msgPool.push(data);
    }
}
