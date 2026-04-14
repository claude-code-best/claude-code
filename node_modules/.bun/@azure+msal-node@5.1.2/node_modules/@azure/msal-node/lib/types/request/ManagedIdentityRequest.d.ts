import { CommonClientCredentialRequest } from "./CommonClientCredentialRequest.js";
import { ManagedIdentityRequestParams } from "./ManagedIdentityRequestParams.js";
/**
 * ManagedIdentityRequest
 */
export type ManagedIdentityRequest = ManagedIdentityRequestParams & CommonClientCredentialRequest & {
    /**
     * An array of capabilities to be added to all network requests as part of the `xms_cc` claim
     */
    clientCapabilities?: Array<string>;
    /**
     * A SHA256 hash of the token that was revoked. The managed identity will revoke the token based on the SHA256 hash of the token, not the token itself. This is to prevent the token from being leaked in transit.
     */
    revokedTokenSha256Hash?: string;
};
//# sourceMappingURL=ManagedIdentityRequest.d.ts.map