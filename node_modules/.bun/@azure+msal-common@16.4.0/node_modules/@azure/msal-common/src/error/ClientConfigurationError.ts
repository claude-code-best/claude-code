/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthError } from "./AuthError.js";
import * as ClientConfigurationErrorCodes from "./ClientConfigurationErrorCodes.js";
export { ClientConfigurationErrorCodes };

/**
 * Error thrown when there is an error in configuration of the MSAL.js library.
 */
export class ClientConfigurationError extends AuthError {
    constructor(errorCode: string) {
        super(errorCode);
        this.name = "ClientConfigurationError";
        Object.setPrototypeOf(this, ClientConfigurationError.prototype);
    }
}

export function createClientConfigurationError(
    errorCode: string
): ClientConfigurationError {
    return new ClientConfigurationError(errorCode);
}
