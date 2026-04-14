/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseAuthRequest } from "@azure/msal-common/node";

/**
 * CommonUsernamePassword parameters passed by the user to retrieve credentials
 * Note: The latest OAuth 2.0 Security Best Current Practice disallows the password grant entirely. This flow is added for internal testing.
 */
export type CommonUsernamePasswordRequest = BaseAuthRequest & {
    /**
     * Username of the client
     */
    username: string;
    /**
     * Credentials
     */
    password: string;
};
