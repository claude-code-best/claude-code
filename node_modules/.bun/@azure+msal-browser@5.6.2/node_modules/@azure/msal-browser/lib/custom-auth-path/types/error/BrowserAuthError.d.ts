import { AuthError } from "@azure/msal-common/browser";
import * as BrowserAuthErrorCodes from "./BrowserAuthErrorCodes.js";
export { BrowserAuthErrorCodes };
export declare function getDefaultErrorMessage(code: string): string;
/**
 * Browser library error class thrown by the MSAL.js library for SPAs
 */
export declare class BrowserAuthError extends AuthError {
    constructor(errorCode: string, subError?: string);
}
export declare function createBrowserAuthError(errorCode: string, subError?: string): BrowserAuthError;
//# sourceMappingURL=BrowserAuthError.d.ts.map