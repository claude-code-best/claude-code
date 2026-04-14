/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ClientAssertionCallback } from "@azure/msal-common/node";
import { CommonClientCredentialRequest } from "./CommonClientCredentialRequest.js";

/**
 * ClientCredentialRequest
 * @public
 */
export type ClientCredentialRequest = Partial<
    Omit<
        CommonClientCredentialRequest,
        | "resourceRequestMethod"
        | "resourceRequestUri"
        | "clientAssertion"
        | "storeInCache"
    >
> & {
    /**
     * An assertion string or a callback function that returns an assertion string (both are Base64Url-encoded signed JWTs) used in the Client Credential flow
     */
    clientAssertion?: string | ClientAssertionCallback;
};
