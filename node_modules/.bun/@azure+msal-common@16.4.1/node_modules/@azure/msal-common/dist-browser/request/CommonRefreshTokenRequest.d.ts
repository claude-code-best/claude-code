import { BaseAuthRequest } from "./BaseAuthRequest.js";
import { CcsCredential } from "../account/CcsCredential.js";
/**
 * CommonRefreshTokenRequest
 */
export type CommonRefreshTokenRequest = BaseAuthRequest & {
    /**
     * A refresh token returned from a previous request to the Identity provider.
     */
    refreshToken: string;
    /**
     * Credential used to populate the CCS (Cache Credential Service) header.
     */
    ccsCredential?: CcsCredential;
    /**
     * Force MSAL to cache a refresh token flow response when there is no account in the cache. Used for migration scenarios.
     */
    forceCache?: boolean;
    /**
     * Redirect URI to send with the refresh token request.
     */
    redirectUri?: string;
};
//# sourceMappingURL=CommonRefreshTokenRequest.d.ts.map