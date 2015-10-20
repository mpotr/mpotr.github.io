/* 
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */

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
    if (typeof(anotherPeer) === "string") {
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
    $('#chat').append(author + ': ' + message + '\n');
}

/**
 * Function responsible for message handling:
 * - prints message
 * - sends acknoledgements
 * @param {Object} data message received
 */
function handleMessage(data) {
    // TODO: send ACK
    if (data["type"] === "message") {
        writeToChat(this.peer, data["data"]);
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
    message = makeSafe(message);

    var data = {
        "type": "message",
        "data": message
    };

    for (var idx in connPool) {
        connPool[idx].send(data);
    };
    
    writeToChat('Me', message);
}