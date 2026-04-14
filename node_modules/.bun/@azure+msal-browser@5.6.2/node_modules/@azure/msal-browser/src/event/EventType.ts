/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const EventType = {
    INITIALIZE_START: "msal:initializeStart",
    INITIALIZE_END: "msal:initializeEnd",
    ACTIVE_ACCOUNT_CHANGED: "msal:activeAccountChanged",
    LOGIN_SUCCESS: "msal:loginSuccess",
    ACQUIRE_TOKEN_START: "msal:acquireTokenStart",
    BROKERED_REQUEST_START: "msal:brokeredRequestStart",
    ACQUIRE_TOKEN_SUCCESS: "msal:acquireTokenSuccess",
    BROKERED_REQUEST_SUCCESS: "msal:brokeredRequestSuccess",
    ACQUIRE_TOKEN_FAILURE: "msal:acquireTokenFailure",
    BROKERED_REQUEST_FAILURE: "msal:brokeredRequestFailure",
    ACQUIRE_TOKEN_NETWORK_START: "msal:acquireTokenFromNetworkStart",
    HANDLE_REDIRECT_START: "msal:handleRedirectStart",
    HANDLE_REDIRECT_END: "msal:handleRedirectEnd",
    POPUP_OPENED: "msal:popupOpened",
    LOGOUT_START: "msal:logoutStart",
    LOGOUT_SUCCESS: "msal:logoutSuccess",
    LOGOUT_FAILURE: "msal:logoutFailure",
    LOGOUT_END: "msal:logoutEnd",
    RESTORE_FROM_BFCACHE: "msal:restoreFromBFCache",
    BROKER_CONNECTION_ESTABLISHED: "msal:brokerConnectionEstablished",
} as const;
export type EventType = (typeof EventType)[keyof typeof EventType];
