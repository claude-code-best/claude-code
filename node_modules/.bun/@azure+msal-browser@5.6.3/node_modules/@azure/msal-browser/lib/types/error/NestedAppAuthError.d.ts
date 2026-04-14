import { AuthError } from "@azure/msal-common/browser";
export declare class NestedAppAuthError extends AuthError {
    constructor(errorCode: string, errorMessage?: string);
    static createUnsupportedError(): NestedAppAuthError;
}
//# sourceMappingURL=NestedAppAuthError.d.ts.map