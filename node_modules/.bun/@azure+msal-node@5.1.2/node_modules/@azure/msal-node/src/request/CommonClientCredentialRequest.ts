/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    BaseAuthRequest,
    AzureRegion,
    ClientAssertion,
} from "@azure/msal-common/node";

/**
 * CommonClientCredentialRequest
 */
export type CommonClientCredentialRequest = Omit<
    BaseAuthRequest,
    "extraQueryParameters" | "extraParameters"
> & {
    /**
     * Skip token cache lookup and force request to authority to get a a new token. Defaults to false.
     */
    skipCache?: boolean;
    /**
     * Azure region to be used for regional authentication.
     */
    azureRegion?: AzureRegion;
    /**
     * An assertion string or a callback function that returns an assertion string (both are Base64Url-encoded signed JWTs) used in the Client Credential flow.
     */
    clientAssertion?: ClientAssertion;
};
