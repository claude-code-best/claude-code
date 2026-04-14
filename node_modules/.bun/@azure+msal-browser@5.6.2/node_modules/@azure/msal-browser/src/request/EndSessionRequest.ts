/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonEndSessionRequest } from "@azure/msal-common/browser";

/**
 * EndSessionRequest
 */
export type EndSessionRequest = Partial<CommonEndSessionRequest> & {
    /**
     * Authority to send logout request.
     */
    authority?: string;
};
