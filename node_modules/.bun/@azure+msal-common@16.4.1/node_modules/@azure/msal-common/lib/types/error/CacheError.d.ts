import * as CacheErrorCodes from "./CacheErrorCodes.js";
export { CacheErrorCodes };
/**
 * Error thrown when there is an error with the cache
 */
export declare class CacheError extends Error {
    /**
     * Short string denoting error
     */
    errorCode: string;
    /**
     * Detailed description of error
     */
    errorMessage: string;
    constructor(errorCode: string, errorMessage?: string);
}
/**
 * Helper function to wrap browser errors in a CacheError object
 * @param e
 * @returns
 */
export declare function createCacheError(e: unknown): CacheError;
//# sourceMappingURL=CacheError.d.ts.map