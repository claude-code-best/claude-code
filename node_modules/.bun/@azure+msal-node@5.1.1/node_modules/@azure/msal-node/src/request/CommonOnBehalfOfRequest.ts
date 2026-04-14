/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { BaseAuthRequest } from "@azure/msal-common/node";

/**
 * CommonOnBehalfOfRequest
 */
export type CommonOnBehalfOfRequest = Omit<
    BaseAuthRequest,
    "extraQueryParameters" | "extraParameters"
> & {
    /**
     * The access token that was sent to the middle-tier API. This token must have an audience of the app making this OBO request.
     */
    oboAssertion: string;
    /**
     * Skip token cache lookup and force request to authority to get a a new token. Defaults to false.
     */
    skipCache?: boolean;
};
