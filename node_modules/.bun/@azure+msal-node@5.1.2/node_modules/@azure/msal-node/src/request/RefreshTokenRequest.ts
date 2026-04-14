/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonRefreshTokenRequest } from "@azure/msal-common/node";

/**
 * CommonRefreshTokenRequest
 * @public
 */
export type RefreshTokenRequest = Partial<
    Omit<
        CommonRefreshTokenRequest,
        | "scopes"
        | "refreshToken"
        | "authenticationScheme"
        | "resourceRequestMethod"
        | "resourceRequestUri"
        | "storeInCache"
    >
> & {
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes: Array<string>;
    /**
     * A refresh token returned from a previous request to the Identity provider.
     */
    refreshToken: string;
    /**
     * Force MSAL to cache a refresh token flow response when there is no account in the cache. Used for migration scenarios.
     */
    forceCache?: boolean;
};
