export declare const EventType: {
    readonly INITIALIZE_START: "msal:initializeStart";
    readonly INITIALIZE_END: "msal:initializeEnd";
    readonly ACTIVE_ACCOUNT_CHANGED: "msal:activeAccountChanged";
    readonly LOGIN_SUCCESS: "msal:loginSuccess";
    readonly ACQUIRE_TOKEN_START: "msal:acquireTokenStart";
    readonly BROKERED_REQUEST_START: "msal:brokeredRequestStart";
    readonly ACQUIRE_TOKEN_SUCCESS: "msal:acquireTokenSuccess";
    readonly BROKERED_REQUEST_SUCCESS: "msal:brokeredRequestSuccess";
    readonly ACQUIRE_TOKEN_FAILURE: "msal:acquireTokenFailure";
    readonly BROKERED_REQUEST_FAILURE: "msal:brokeredRequestFailure";
    readonly ACQUIRE_TOKEN_NETWORK_START: "msal:acquireTokenFromNetworkStart";
    readonly HANDLE_REDIRECT_START: "msal:handleRedirectStart";
    readonly HANDLE_REDIRECT_END: "msal:handleRedirectEnd";
    readonly POPUP_OPENED: "msal:popupOpened";
    readonly LOGOUT_START: "msal:logoutStart";
    readonly LOGOUT_SUCCESS: "msal:logoutSuccess";
    readonly LOGOUT_FAILURE: "msal:logoutFailure";
    readonly LOGOUT_END: "msal:logoutEnd";
    readonly RESTORE_FROM_BFCACHE: "msal:restoreFromBFCache";
    readonly BROKER_CONNECTION_ESTABLISHED: "msal:brokerConnectionEstablished";
};
export type EventType = (typeof EventType)[keyof typeof EventType];
//# sourceMappingURL=EventType.d.ts.map