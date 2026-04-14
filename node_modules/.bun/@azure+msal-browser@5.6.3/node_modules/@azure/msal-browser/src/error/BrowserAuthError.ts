/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthError } from "@azure/msal-common/browser";
import * as BrowserAuthErrorCodes from "./BrowserAuthErrorCodes.js";
export { BrowserAuthErrorCodes }; // Allow importing as "BrowserAuthErrorCodes"

export function getDefaultErrorMessage(code: string): string {
    return `See https://aka.ms/msal.js.errors#${code} for details`;
}

/**
 * Browser library error class thrown by the MSAL.js library for SPAs
 */
export class BrowserAuthError extends AuthError {
    constructor(errorCode: string, subError?: string) {
        super(errorCode, getDefaultErrorMessage(errorCode), subError);

        Object.setPrototypeOf(this, BrowserAuthError.prototype);
        this.name = "BrowserAuthError";
    }
}

export function createBrowserAuthError(
    errorCode: string,
    subError?: string
): BrowserAuthError {
    return new BrowserAuthError(errorCode, subError);
}
