import { CommonAuthorizationCodeRequest } from "@azure/msal-common/browser";
/**
 * AuthorizationCodeRequest: Request object passed by browser clients to exchange an authorization code for tokens.
 */
export type AuthorizationCodeRequest = Partial<Omit<CommonAuthorizationCodeRequest, "code" | "enableSpaAuthorizationCode">> & {
    /**
     * The authorization_code that the user acquired in the first leg of the flow.
     */
    code?: string;
    /**
     * Identifier for the native account when integrating with native or brokered experiences.
     */
    nativeAccountId?: string;
    /**
     * Hostname for the Microsoft Cloud instance's Graph endpoint (for example, graph.microsoft.com).
     */
    cloudGraphHostName?: string;
    /**
     * Hostname for the Microsoft Graph endpoint when overriding defaults.
     */
    msGraphHost?: string;
    /**
     * Hostname for the Azure AD cloud instance that issued the authorization code.
     */
    cloudInstanceHostName?: string;
};
//# sourceMappingURL=AuthorizationCodeRequest.d.ts.map