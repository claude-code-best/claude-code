/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    DeviceCodeResponse,
    StringDict,
    BaseAuthRequest,
} from "@azure/msal-common/node";

/**
 * Parameters for Oauth2 device code flow.
 */
export type CommonDeviceCodeRequest = BaseAuthRequest & {
    /**
     * Callback containing device code response. Message should be shown to end user. End user can then navigate to the verification_uri, input the user_code, and input credentials.
     */
    deviceCodeCallback: (response: DeviceCodeResponse) => void;
    /**
     * Boolean to cancel polling of device code endpoint. While the user authenticates on a separate device, MSAL polls the the token endpoint of security token service for the interval specified in the device code response (usually 15 minutes). To stop polling and cancel the request, set cancel=true.
     */
    cancel?: boolean;
    /**
     * Timeout period in seconds which the user explicitly configures for the polling of the device code endpoint. At the end of this period; assuming the device code has not expired yet; the device code polling is stopped and the request cancelled. The device code expiration window will always take precedence over this set period.
     */
    timeout?: number;
    /**
     * String to string map of custom query parameters added to outgoing token service requests.
     */
    extraQueryParameters?: StringDict;
};
