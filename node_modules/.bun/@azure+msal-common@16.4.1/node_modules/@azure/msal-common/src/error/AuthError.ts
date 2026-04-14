/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as AuthErrorCodes from "./AuthErrorCodes.js";
import type { PlatformBrokerError } from "./PlatformBrokerError.js";
export { AuthErrorCodes };

export function getDefaultErrorMessage(code: string): string {
    return `See https://aka.ms/msal.js.errors#${code} for details`;
}

/**
 * General error class thrown by the MSAL.js library.
 */
export class AuthError extends Error {
    /**
     * Short string denoting error
     */
    errorCode: string;

    /**
     * Detailed description of error
     */
    errorMessage: string;

    /**
     * Describes the subclass of an error
     */
    subError: string;

    /**
     * CorrelationId associated with the error
     */
    correlationId: string;

    /**
     * Default PlatformBrokerError from MsalNodeRuntime when broker is enabled
     */
    platformBrokerError?: PlatformBrokerError;

    constructor(errorCode?: string, errorMessage?: string, suberror?: string) {
        const message =
            errorMessage ||
            (errorCode ? getDefaultErrorMessage(errorCode) : "");
        const errorString = message ? `${errorCode}: ${message}` : errorCode;
        super(errorString);
        Object.setPrototypeOf(this, AuthError.prototype);

        this.errorCode = errorCode || "";
        this.errorMessage = message || "";
        this.subError = suberror || "";
        this.name = "AuthError";
    }

    setCorrelationId(correlationId: string): void {
        this.correlationId = correlationId;
    }
}

export function createAuthError(
    code: string,
    additionalMessage?: string
): AuthError {
    return new AuthError(
        code,
        additionalMessage || getDefaultErrorMessage(code)
    );
}
