import { BaseAuthRequest } from "./BaseAuthRequest.js";
import { CcsCredential } from "../account/CcsCredential.js";
/**
 * Request object passed by user to acquire a token from the server exchanging a valid authorization code (second leg of OAuth2.0 Authorization Code flow)
 */
export type CommonAuthorizationCodeRequest = BaseAuthRequest & {
    /**
     * The authorization_code that the user acquired in the first leg of the flow.
     */
    code: string;
    /**
     * The redirect URI of your app, where the authority will redirect to after the user inputs credentials and consents. It must exactly match one of the redirect URIs you registered in the portal
     */
    redirectUri: string;
    /**
     * The same code_verifier that was used to obtain the authorization_code. Required if PKCE was used in the authorization code grant request.For more information, see the PKCE RFC: https://tools.ietf.org/html/rfc7636
     */
    codeVerifier?: string;
    /**
     * Enables the acquisition of a SPA authorization code (confidential clients only).
     */
    enableSpaAuthorizationCode?: boolean;
    /**
     * Encoded client_info returned with the authorization code, used to bind the token response to a specific account.
     */
    clientInfo?: string;
    /**
     * Credential used to populate the CCS (Cache Credential Service) header.
     */
    ccsCredential?: CcsCredential;
};
//# sourceMappingURL=CommonAuthorizationCodeRequest.d.ts.map