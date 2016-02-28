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
        var message = msgBox.val();

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
            client.addPeer(pID, function() {
                client.friends.push(pID);
            });
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
        $(msg).text(author + ': ' + message + '\n');
        $('#chat').append(msg);
        // Autoscroll
        $('#chat').scrollTop($('#chat')[0].scrollHeight);
    }

    function updateContactList() {
        $("#CLTableBody > tr").remove();

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
                    client.addPeer(friend, (function (self) {
                        return function () {
                            self.className = "btn-success btn-block";
                            updateContactList();
                        }
                    })(this))
                }
            })(friend));
        }
    }


    $("#init").on("click", function () {
        var peerID = $("#nickname").val();

        client.init(
            writeToChat,
            peerID,
            function (id) {
                $('#peerID').html("Your id is: " + id);
                client.nickname = id;
            }
        );

        client.context.on['init'] = function() {
            $("#startmpOTR").prop("disabled", true);
        };

        $("#init").prop("disabled", true);
        $("#nickname").prop("disabled", true);

        if (localStorage[peerID]) {
            client.friends = JSON.parse(localStorage[peerID]);
            updateContactList();
        }
    });
});