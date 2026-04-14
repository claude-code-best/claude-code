/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonAuthorizationUrlRequest } from "@azure/msal-common/node";
import { ILoopbackClient } from "../network/ILoopbackClient.js";

/**
 * Request object passed by user to configure acquireTokenInteractive API
 * @public
 */
export type InteractiveRequest = Partial<
    Omit<CommonAuthorizationUrlRequest, "scopes" | "storeInCache">
> & {
    /**
     * Function to open a browser instance on user's system.
     */
    openBrowser: (url: string) => Promise<void>;
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes?: Array<string>;
    /**
     * Template to be displayed on the opened browser instance upon successful token acquisition.
     */
    successTemplate?: string;
    /**
     * Template to be displayed on the opened browser instance upon token acquisition failure.
     */
    errorTemplate?: string;
    /**
     * Used in native broker flows to properly parent the native broker window
     */
    windowHandle?: Buffer; // Relevant only to brokered requests
    /**
     * Custom implementation for a loopback server to listen for authorization code response.
     */
    loopbackClient?: ILoopbackClient;
};
