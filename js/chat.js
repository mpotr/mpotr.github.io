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

    $('body').onunload = function() {
        client.chatDisconnect();
    };

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

    $("#mpOTR").on("click", function() {
        if ($("#mpOTR").text() === "stop mpOTR") {
            client.context.sendShutdown();
            $("#mpOTR").text("start mpOTR");
        } else {
            $("#mpOTR").text("stop mpOTR");
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
        $(msg).text(author + ': ' + unescape(message) + '\n');
        $('#chat').append(msg);
        // Autoscroll
        $('#chat').scrollTop($('#chat')[0].scrollHeight);
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
                    client.addPeer(friend);
                }
            })(friend));
        }
    }


    $("#init").on("click", function () {
        var peerID = $("#nickname").val();

        client.init(
            peerID,
            writeToChat,
            {
                open: function (id) {
                    $('#peerID').html("Your id is: " + id);
                    client.nickname = id;
                },
                add: updateContactList,
                close: updateContactList
            });

        client.context.subscribeOnEvent('init', function() {
            $("#mpOTR").text("stop mpOTR");
        });

        client.context.subscribeOnEvent('shutdown', function() {
            $("#mpOTR").text("start mpOTR");
        });

        $("#init").prop("disabled", true);
        $("#nickname").prop("disabled", true);

        if (localStorage[peerID]) {
            client.friends = JSON.parse(localStorage[peerID]);
            updateContactList();
        }
    });
});
