/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AccountInfo, CommonSilentFlowRequest } from "@azure/msal-common/node";

/**
 * SilentFlow parameters passed by the user to retrieve credentials silently
 * @public
 */
export type SilentFlowRequest = Partial<
    Omit<CommonSilentFlowRequest, "account" | "scopes" | "storeInCache">
> & {
    /**
     * Account entity to lookup the credentials.
     */
    account: AccountInfo;
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes: Array<string>;
};
