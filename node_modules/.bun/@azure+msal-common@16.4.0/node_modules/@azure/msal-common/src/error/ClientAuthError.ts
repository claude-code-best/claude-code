/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthError } from "./AuthError.js";
import * as ClientAuthErrorCodes from "./ClientAuthErrorCodes.js";
export { ClientAuthErrorCodes }; // Allow importing as "ClientAuthErrorCodes";

/**
 * ClientAuthErrorMessage class containing string constants used by error codes and messages.
 */

/**
 * Error thrown when there is an error in the client code running on the browser.
 */
export class ClientAuthError extends AuthError {
    constructor(errorCode: string, additionalMessage?: string) {
        super(errorCode, additionalMessage);
        this.name = "ClientAuthError";

        Object.setPrototypeOf(this, ClientAuthError.prototype);
    }
}

export function createClientAuthError(
    errorCode: string,
    additionalMessage?: string
): ClientAuthError {
    return new ClientAuthError(errorCode, additionalMessage);
}
