import { AuthError } from "./AuthError.js";
import * as ClientConfigurationErrorCodes from "./ClientConfigurationErrorCodes.js";
export { ClientConfigurationErrorCodes };
/**
 * Error thrown when there is an error in configuration of the MSAL.js library.
 */
export declare class ClientConfigurationError extends AuthError {
    constructor(errorCode: string);
}
export declare function createClientConfigurationError(errorCode: string): ClientConfigurationError;
//# sourceMappingURL=ClientConfigurationError.d.ts.map