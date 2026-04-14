/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonAuthorizationUrlRequest } from "@azure/msal-common/browser";

/**
 * Request object passed by user to ssoSilent to retrieve a Code from the server (first leg of authorization code grant flow)
 */
export type SsoSilentRequest = Partial<
    Omit<
        CommonAuthorizationUrlRequest,
        | "responseMode"
        | "earJwk"
        | "codeChallenge"
        | "codeChallengeMethod"
        | "platformBroker"
    >
>;
