/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AccountInfo } from "../account/AccountInfo.js";
import { StringDict } from "../utils/MsalTypes.js";

/**
 * CommonEndSessionRequest
 */
export type CommonEndSessionRequest = {
    /**
     * Unique GUID set per request to trace a request end-to-end for telemetry purposes.
     */
    correlationId: string;
    /**
     * Account object that will be logged out of. All tokens tied to this account will be cleared.
     */
    account?: AccountInfo | null;
    /**
     * URI to navigate to after logout page.
     */
    postLogoutRedirectUri?: string | null;
    /**
     * ID Token used by B2C to validate logout if required by the policy
     */
    idTokenHint?: string;
    /**
     * A value included in the request to the logout endpoint which will be returned in the query string upon post logout redirection. For security and privacy reasons, we do not recommend putting URLs or other sensitive data directly in the state parameter. Instead, use a key or identifier that corresponds to data stored in browser storage (e.g., localStorage, sessionStorage), allowing your app to securely reference the necessary data after logout.
     */
    state?: string;
    /**
     * A string that specifies the account that is being logged out in order to skip the server account picker on logout
     */
    logoutHint?: string;
    /**
     * String to string map of custom query parameters added to the /authorize call
     */
    extraQueryParameters?: StringDict;
};
