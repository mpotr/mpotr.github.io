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
    "use strict";

    $('body').onbeforeunload = function() {
        // TODO: Panic! Public keys!
        client.chatDisconnect();
    };

    $('#sendMessage').on('click', function () {
        if (client.blockChat) {
            return;
        }
        
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
        if (e.keyCode === 13 && (e.metaKey || e.ctrlKey)) {
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

    $("#mpOTR").on("click", function() {
        if (this.innerText === "stop mpOTR") {
            client.context.stopChat();
            this.innerText = "start mpOTR";
        } else {
            this.innerText = "stop mpOTR";
            client.context.start();
        }
    });

    /**
     * Writes authorized message to chat
     * @param {String} author
     * @param {String} message
     */
    function writeToChat(author, message) {
        // TODO: Add this function to client
        var msg = document.createElement('code');
        msg.innerText = author + ': ' + unescape(message) + '\n';
        var $chat = $('#chat');
        $chat.append(msg);
        // Autoscroll
        $chat.scrollTop($chat[0].scrollHeight);
    }

    function updateContactList() {
        $("#CLTableBody > tr").remove();
        localStorage[client.peer.id] = JSON.stringify(client.friends);

        for (var i = 0; i < client.friends.length; ++i) {
            var friend = client.friends[i];

            $("#CLTableBody").append(
                "<tr>" +
                "   <td>" +
                "       <button id='" + friend + "' class='btn-block'>" +
                friend +
                "       </button>" +
                "   </td>" +
                "</tr>");

            for (var j = 0; j < client.connPool.length; ++j) {
                if (client.connPool[j].peer === friend) {
                    $("#" + friend).prop("className", "btn-success btn-block");
                    break;
                }
            }

            $("#" + friend).on("click", (function(friend) {
                return function () {
                    this.disabled = true;
                    client.addPeer(friend);
                    setTimeout(() => {
                        this.disabled = false;
                    }, 5000);
                }
            })(friend));
        }
    }


    $("#init").on("click", function () {
        var peerID = $("#nickname").val();
        var $mpOTR = $("#mpOTR");

        client.init(
            peerID,
            writeToChat,
            {
                open: function (id) {
                    $('#peerID').html("Your id is: " + id);
                    $('#sendMessage').prop("disabled", false);
                    $('#addPeer').prop("disabled", false);
                    $("#init").prop("disabled", true);
                    $("#nickname").prop("disabled", true);
                    client.nickname = id;
                },
                add: updateContactList,
                close: updateContactList
            });

        client.context.subscribeOnEvent(client.context.EVENTS.MPOTR_INIT, function() {
            $mpOTR.text("stop mpOTR");
        });

        client.context.subscribeOnEvent(client.context.EVENTS.MPOTR_SHUTDOWN, function() {
            $mpOTR.text("start mpOTR");
        });

        if (localStorage[peerID]) {
            client.friends = JSON.parse(localStorage[peerID]);
            updateContactList();
        }
    });
});
