/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthError } from "@azure/msal-common/browser";
import * as BrowserConfigurationAuthErrorCodes from "./BrowserConfigurationAuthErrorCodes.js";
import { getDefaultErrorMessage } from "./BrowserAuthError.js";
export { BrowserConfigurationAuthErrorCodes };
/**
 * Browser library error class thrown by the MSAL.js library for SPAs
 */
export class BrowserConfigurationAuthError extends AuthError {
    constructor(errorCode: string, errorMessage?: string) {
        super(errorCode, errorMessage);
        this.name = "BrowserConfigurationAuthError";

        Object.setPrototypeOf(this, BrowserConfigurationAuthError.prototype);
    }
}

export function createBrowserConfigurationAuthError(
    errorCode: string
): BrowserConfigurationAuthError {
    return new BrowserConfigurationAuthError(
        errorCode,
        getDefaultErrorMessage(errorCode)
    );
}
