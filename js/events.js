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
            CHAT_SYNCED: 'EVENTS.CHAT_SYNCED',
            CONN_POOL_ADD: "EVENTS.CONN_POOL_ADD",
            CONN_POOL_REMOVE: "EVENTS.CONN_POOL_REMOVE",
            INCOMING_MSG: "EVENTS.INCOMING_MSG"
        },

        /**
         * Possible message types. Also used as event types for corresponding handlers.
         */
        MSG: {
            UNENCRYPTED: "MSG.UNENCRYPTED",
            CONN_POOL_SYNC: "MSG.CONN_POOL_SYNC",
            CONN_POOL_REMOVE: "MSG.CONN_POOL_REMOVE",
            MPOTR_INIT: "MSG.MPOTR_INIT",
            MPOTR_AUTH: "MSG.MPOTR_AUTH",
            MPOTR_CHAT: "MSG.MPOTR_CHAT",
            MPOTR_LOST_MSG: "MSG.MPOTR_LOST_MSG",
            MPOTR_SHUTDOWN: "MSG.MPOTR_SHUTDOWN"
        },

        /**
         * Client's status
         * IMPORTANT: If you want to add / remove STATUS consider
         * rewriting all checkStatus() wrappers.
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
