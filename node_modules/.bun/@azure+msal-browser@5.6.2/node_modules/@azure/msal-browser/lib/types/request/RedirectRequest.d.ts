import { CommonAuthorizationUrlRequest } from "@azure/msal-common/browser";
/**
 * RedirectRequest: Request object passed by user to retrieve a Code from the
 * server (first leg of authorization code grant flow) with a full page redirect.
 */
export type RedirectRequest = Partial<Omit<CommonAuthorizationUrlRequest, "responseMode" | "scopes" | "earJwk" | "codeChallenge" | "codeChallengeMethod" | "platformBroker">> & {
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes: Array<string>;
    /**
     * The page that should be returned to after loginRedirect or acquireTokenRedirect. This should only be used if this is different from the redirectUri and will default to the page that initiates the request. When the navigateToLoginRequestUrl config option is set to false this parameter will be ignored.
     */
    redirectStartPage?: string;
};
//# sourceMappingURL=RedirectRequest.d.ts.map