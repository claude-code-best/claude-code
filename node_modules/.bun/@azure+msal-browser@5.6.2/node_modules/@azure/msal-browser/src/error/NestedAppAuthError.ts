/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthError } from "@azure/msal-common/browser";
import { unsupportedMethod } from "./NativeAuthErrorCodes.js";

export class NestedAppAuthError extends AuthError {
    constructor(errorCode: string, errorMessage?: string) {
        super(errorCode, errorMessage);

        Object.setPrototypeOf(this, NestedAppAuthError.prototype);
        this.name = "NestedAppAuthError";
    }

    public static createUnsupportedError(): NestedAppAuthError {
        return new NestedAppAuthError(unsupportedMethod);
    }
}
