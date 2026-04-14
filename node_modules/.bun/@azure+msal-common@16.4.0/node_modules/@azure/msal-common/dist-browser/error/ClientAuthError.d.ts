import { AuthError } from "./AuthError.js";
import * as ClientAuthErrorCodes from "./ClientAuthErrorCodes.js";
export { ClientAuthErrorCodes };
/**
 * ClientAuthErrorMessage class containing string constants used by error codes and messages.
 */
/**
 * Error thrown when there is an error in the client code running on the browser.
 */
export declare class ClientAuthError extends AuthError {
    constructor(errorCode: string, additionalMessage?: string);
}
export declare function createClientAuthError(errorCode: string, additionalMessage?: string): ClientAuthError;
//# sourceMappingURL=ClientAuthError.d.ts.map