/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonAuthorizationUrlRequest } from "@azure/msal-common/node";

/**
 * Request object passed by user to retrieve a Code from the server (first leg of authorization code grant flow)
 * @public
 */
export type AuthorizationUrlRequest = Partial<
    Omit<
        CommonAuthorizationUrlRequest,
        | "scopes"
        | "redirectUri"
        | "resourceRequestMethod"
        | "resourceRequestUri"
        | "authenticationScheme"
        | "storeInCache"
    >
> & {
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes: Array<string>;
    /**
     * The redirect URI where authentication responses can be received by your application. It must exactly match one of the redirect URIs registered in the Azure portal.
     */
    redirectUri: string;
};
