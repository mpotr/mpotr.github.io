require.config({
    baseUrl: "js",
    paths: {
        "bootstrap": "lib/bootstrap/bootstrap.min",
        "jquery": "lib/jquery/jquery.min",
        "peerjs": "lib/peerjs/peer",
        "cryptico": "lib/cryptico/cryptico"
    },
    shim: {
        "bootstrap": {
            deps: ['jquery']
        },
        "cryptico": {},
        "peerjs": {}
    }
});

require(['jquery', 'client'], function($, client) {
    $('#sendMessage').on('click', function () {
        var msgBox = $('#messageText');
        var message = escape(msgBox.val());

        var clearFlag = true;
        switch (client.context["status"]) {
            case "not started":
                client.sendMessage(message, "unencrypted");
                break;
            case "auth":
                alert("wait a bit and resend it plz");
                clearFlag = false;
                break;
            case "chat":
                client.context.sendMessage(message);
                break;
            default:
                alert("something is wrong, write an email to developers");
        }

        if (clearFlag) {
            msgBox.val("");
        }
        msgBox.focus();
    });

    $('#messageText').on('keypress', function(e) {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            $('#sendMessage').click();
        }
    });

    $('#addPeer').on('click', function() {
        var newPeer = $('#newPeer');
        var pID = newPeer.val();

        if (pID !== "") {
            client.addPeer(pID);
            newPeer.val("");
        }
    });

    $("#startmpOTR").on("click", function() {
        client.sendMessage("init", "mpOTR");
        $("#startmpOTR").prop("disabled", true);
    });

    /**
     * Writes authorized message to chat
     * @param {string} author
     * @param {string} message
     */
    function writeToChat(author, message) {
        // TODO: Add this function to client
        var msg = document.createElement('code');
        $(msg).text(author + ': ' + unescape(message) + '\n');
        $('#chat').append(msg);
        // Autoscroll
        $('#chat').scrollTop($('#chat')[0].scrollHeight);
    }

    client.init(
        writeToChat,
        function(id) {
            $('#peerID').html("Your id is: " + id);
            client.nickname = id;
        }
    );

    client.context.on['init'] = function() {
        $("#startmpOTR").prop("disabled", true);
    }
});