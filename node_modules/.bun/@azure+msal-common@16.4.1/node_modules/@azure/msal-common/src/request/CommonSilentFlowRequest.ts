/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AccountInfo } from "../account/AccountInfo.js";
import { BaseAuthRequest } from "./BaseAuthRequest.js";

/**
 * SilentFlow parameters passed by the user to retrieve credentials silently
 */
export type CommonSilentFlowRequest = BaseAuthRequest & {
    /**
     * Account object to lookup the credentials
     */
    account: AccountInfo;
    /**
     * Skip cache lookup and forces network call(s) to get fresh tokens
     */
    forceRefresh: boolean;
    /**
     * RedirectUri registered on the app registration - only required in brokering scenarios
     */
    redirectUri?: string;
    /**
     * If refresh token will expire within the configured value, consider it already expired. Used to pre-emptively invoke interaction when cached refresh token is close to expiry.
     */
    refreshTokenExpirationOffsetSeconds?: number;
};
