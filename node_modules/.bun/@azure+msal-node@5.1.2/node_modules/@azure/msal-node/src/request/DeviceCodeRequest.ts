/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DeviceCodeResponse } from "@azure/msal-common/node";
import { CommonDeviceCodeRequest } from "./CommonDeviceCodeRequest.js";

/**
 * Parameters for Oauth2 device code flow.
 * @public
 */
export type DeviceCodeRequest = Partial<
    Omit<
        CommonDeviceCodeRequest,
        | "scopes"
        | "deviceCodeCallback"
        | "resourceRequestMethod"
        | "resourceRequestUri"
        | "storeInCache"
    >
> & {
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes: Array<string>;
    /**
     * Callback containing device code response. Message should be shown to end user. End user can then navigate to the verification_uri, input the user_code, and input credentials.
     */
    deviceCodeCallback: (response: DeviceCodeResponse) => void;
};
