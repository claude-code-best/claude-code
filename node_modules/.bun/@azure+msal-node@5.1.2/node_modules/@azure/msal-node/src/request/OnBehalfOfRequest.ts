/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonOnBehalfOfRequest } from "./CommonOnBehalfOfRequest.js";

/**
 * OnBehalfOfRequest
 * @public
 */
export type OnBehalfOfRequest = Partial<
    Omit<
        CommonOnBehalfOfRequest,
        | "oboAssertion"
        | "scopes"
        | "resourceRequestMethod"
        | "resourceRequestUri"
        | "storeInCache"
    >
> & {
    /**
     * The access token that was sent to the middle-tier API. This token must have an audience of the app making this OBO request.
     */
    oboAssertion: string;
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes: Array<string>;
};
