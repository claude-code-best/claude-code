import { AuthError } from "@azure/msal-common/browser";
import * as BrowserConfigurationAuthErrorCodes from "./BrowserConfigurationAuthErrorCodes.js";
export { BrowserConfigurationAuthErrorCodes };
/**
 * Browser library error class thrown by the MSAL.js library for SPAs
 */
export declare class BrowserConfigurationAuthError extends AuthError {
    constructor(errorCode: string, errorMessage?: string);
}
export declare function createBrowserConfigurationAuthError(errorCode: string): BrowserConfigurationAuthError;
//# sourceMappingURL=BrowserConfigurationAuthError.d.ts.map