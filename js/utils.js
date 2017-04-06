define([], function () {
    "use strict";

    return {
        client: undefined,
        context: undefined,
        ee: undefined,

        /**
         * Debug module initialization
         */
        init: function() {
            this.client = require('client');
            this.context = this.client.context;
            this.ee = require('events');
        },

        /**
         * Adds all peers from friend-list
         */
        addAll: function() {
            this.client.whitelist.forEach(conn => this.client.addPeer(conn));
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
        },

        /**
         * Outputs to console all subscriptions for specified
         * type of event
         * @param ev type of event (ee.MSG, ee.EVENTS)
         */
        listSubscriptions: function(ev) {
            for (let i in ev) {
                console.log(ev[i], ': ', this.ee.ee.getListeners(ev[i]));
            }
        }
    }
});
