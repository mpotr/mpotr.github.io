define([], function () {
    "use strict";

    return {
        client: undefined,
        context: undefined,

        /**
         * Debug module initialization
         */
        init: function() {
            this.client = require('client');
            this.context = this.client.context;
        },

        /**
         * Adds all peers from friend-list
         */
        addAll: function() {
            this.client.friends.forEach(conn => this.client.addPeer(conn));
        },

        /**
         * Connects to the peer server with specified ID
         * If no ID was specified random one is set
         * @param peerID ID for client
         */
        connect: (peerID) => {
            if (peerID) {
                $("#nickname").val(peerID);
            }

            $("#init").click();
        },

        /**
         * Simple log function
         * @param {string} level Message level
         * @param {string} msg Log message
         */
        log: function (level, msg) {
            switch (level) {
                case "alert":
                    alert(msg);
                    console.log(msg);
                    break;
                case "info":
                    console.log(msg);
                    break;
                default:
                    console.log(msg);
            }
        }
    }
});
