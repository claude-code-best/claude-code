/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as CacheErrorCodes from "./CacheErrorCodes.js";
import { getDefaultErrorMessage } from "./AuthError.js";
export { CacheErrorCodes };

/**
 * Error thrown when there is an error with the cache
 */
export class CacheError extends Error {
    /**
     * Short string denoting error
     */
    errorCode: string;

    /**
     * Detailed description of error
     */
    errorMessage: string;

    constructor(errorCode: string, errorMessage?: string) {
        const message = errorMessage || getDefaultErrorMessage(errorCode);
        super(message);
        Object.setPrototypeOf(this, CacheError.prototype);

        this.name = "CacheError";
        this.errorCode = errorCode;
        this.errorMessage = message;
    }
}

/**
 * Helper function to wrap browser errors in a CacheError object
 * @param e
 * @returns
 */
export function createCacheError(e: unknown): CacheError {
    if (!(e instanceof Error)) {
        return new CacheError(CacheErrorCodes.cacheErrorUnknown);
    }

    if (
        e.name === "QuotaExceededError" ||
        e.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
        e.message.includes("exceeded the quota")
    ) {
        return new CacheError(CacheErrorCodes.cacheQuotaExceeded);
    } else {
        return new CacheError(e.name, e.message);
    }
}
