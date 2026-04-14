/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonUsernamePasswordRequest } from "./CommonUsernamePasswordRequest.js";

/**
 * UsernamePassword parameters passed by the user to retrieve credentials
 * Note: The latest OAuth 2.0 Security Best Current Practice disallows the password grant entirely. This flow is added for internal testing.
 * @public
 */
export type UsernamePasswordRequest = Partial<
    Omit<
        CommonUsernamePasswordRequest,
        | "scopes"
        | "resourceRequestMethod"
        | "resourceRequestUri"
        | "username"
        | "password"
        | "storeInCache"
    >
> & {
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes: Array<string>;
    /**
     * Username of the client
     */
    username: string;
    /**
     * Credentials
     */
    password: string;
};
