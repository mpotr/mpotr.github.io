define(['eventEmitter'], function (EventEmitter) {
    "use strict";

    // TODO: functions to check existence of string
    return {
        /**
         * Possible events in application.
         */
        EVENTS: {
            PEER_OPENED: 'EVENTS.PEER_OPENED',
            NEW_CONN: 'EVENTS.NEW_CONN',
            MPOTR_INIT: 'EVENTS.MPOTR_INIT',
            MPOTR_START: 'EVENTS.MPOTR_START',
            MPOTR_SHUTDOWN_START: 'EVENTS.MPOTR_SHUTDOWN_START',
            MPOTR_SHUTDOWN_FINISH: 'EVENTS.MPOTR_SHUTDOWN_FINISH',
            BLOCK_CHAT: 'EVENTS.BLOCK_CHAT',
            CONN_LIST_ADD: "EVENTS.CONN_LIST_ADD",
            CONN_LIST_REMOVE: "EVENTS.CONN_LIST_REMOVE",
            INCOMING_MSG: "EVENTS.INCOMING_MSG",
            OLDBLUE_MSG_DELIVERED: "EVENTS.OLDBLUE_MSG_DELIVERED"
        },

        /**
         * Possible message types. Also used as event types for corresponding handlers.
         */
        MSG: {
            UNENCRYPTED: "MSG.UNENCRYPTED",
            CONN_LIST_SYNC: "MSG.CONN_LIST_SYNC",
            CONN_LIST_REMOVE: "MSG.CONN_LIST_REMOVE",
            MPOTR_INIT: "MSG.MPOTR_INIT",
            MPOTR_AUTH: "MSG.MPOTR_AUTH",
            MPOTR_CHAT: "MSG.MPOTR_CHAT",
            MPOTR_LOST_MSG: "MSG.MPOTR_LOST_MSG",
            MPOTR_SHUTDOWN: "MSG.MPOTR_SHUTDOWN",
            BD_KEY_RATCHET: "MSG.BD_KEY_RATCHET"
        },

        /**
         * Client's status
         * IMPORTANT: If you want to modify STATUS (add, remove)
         * consider rewriting all checkStatus() wrappers.
         */
        STATUS: {
            UNENCRYPTED:    "STATUS.UNENCRYPTED",
            AUTH:           "STATUS.AUTH",
            MPOTR:          "STATUS.MPOTR",
            SHUTDOWN:       "STATUS.SHUTDOWN"
        },

        ee: new EventEmitter()
    };
});
