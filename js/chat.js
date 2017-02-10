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

require(['jquery', 'client', 'debug'], function($, client, debug) {
    "use strict";

    $('body').onbeforeunload = function() {
        // TODO: Panic! Public keys! Wait... Or not?
        client.chatDisconnect();
    };

    $('#sendMessage').on('click', function () {
        if (client.blockChat) {
            return;
        }
        
        let msgBox = $('#messageText');
        let message = escape(msgBox.val());
        let clearFlag = true;

        switch (client.context["status"]) {

            case client.context.STATUS.UNENCRYPTED:
                client.sendMessage(message, client.context.MSG.UNENCRYPTED);
                break;

            case client.context.STATUS.ROUND1:
            case client.context.STATUS.ROUND2:
            case client.context.STATUS.ROUND3:
            case client.context.STATUS.ROUND4:
                notify("Wait a bit. Now is ");
                clearFlag = false;
                break;

            case client.context.STATUS.MPOTR:
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
        let newPeer = $('#newPeer');
        let pID = newPeer.val();

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
        let msg = document.createElement('code');
        msg.innerText = author + ': ' + unescape(message) + '\n';
        let $chat = $('#chat');
        $chat.append(msg);
        // Autoscroll
        $chat.scrollTop($chat[0].scrollHeight);
    }

    let $userNotification = $('#userNotification');
    $userNotification.click(() => {
        $userNotification.slideUp()
    });
    $userNotification.hide();

    /**
     * User friendly notification
     * @param message
     */
    function notify(message) {
        debug.log('Notification: ' + message);
        $userNotification.slideDown();
        $userNotification.text(message);
    }

    /**
     * Redraw contact list.
     */
    function updateContactList() {
        $("#CLTableBody > tr").remove();
        localStorage[client.peer.id] = JSON.stringify(client.friends);

        for (let i = 0; i < client.friends.length; ++i) {
            let friend = client.friends[i];

            $("#CLTableBody").append(
                "<tr>" +
                "   <td>" +
                "       <button id='" + friend + "' class='btn-block'>" +
                friend +
                "       </button>" +
                "   </td>" +
                "</tr>");

            let $friend = $("[id='" + friend + "']");

            for (let j = 0; j < client.connPool.length; ++j) {
                if (client.connPool[j].peer === friend) {
                  $friend.prop("className", "btn-success btn-block");
                    break;
                }
            }

            $friend.on("click", (function(friend) {
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
        let peerID = $("#nickname").val();
        let $mpOTR = $("#mpOTR");

        client.init(
            peerID,
            writeToChat,
            {
                open: function (id) {
                    $('#peerID').text("Your id is: " + id);
                    $('#sendMessage').prop("disabled", false);
                    $('#addPeer').prop("disabled", false);
                    $("#init").prop("disabled", true);
                    $("#nickname").prop("disabled", true);
                    client.nickname = id;
                },
                add: updateContactList,
                close: updateContactList,
                notify: notify
            });

        client.context.subscribeOnEvent(client.context.EVENTS.MPOTR_INIT, function() {
            $mpOTR.text("stop mpOTR");
        });

        client.context.subscribeOnEvent(client.context.EVENTS.MPOTR_SHUTDOWN_FINISH, function() {
            $mpOTR.text("start mpOTR");
        });

        if (localStorage[peerID]) {
            client.friends = JSON.parse(localStorage[peerID]);
            updateContactList();
        }
    });
});
