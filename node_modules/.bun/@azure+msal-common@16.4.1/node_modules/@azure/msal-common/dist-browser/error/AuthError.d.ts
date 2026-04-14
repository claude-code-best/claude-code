import * as AuthErrorCodes from "./AuthErrorCodes.js";
import type { PlatformBrokerError } from "./PlatformBrokerError.js";
export { AuthErrorCodes };
export declare function getDefaultErrorMessage(code: string): string;
/**
 * General error class thrown by the MSAL.js library.
 */
export declare class AuthError extends Error {
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
    constructor(errorCode?: string, errorMessage?: string, suberror?: string);
    setCorrelationId(correlationId: string): void;
}
export declare function createAuthError(code: string, additionalMessage?: string): AuthError;
//# sourceMappingURL=AuthError.d.ts.map