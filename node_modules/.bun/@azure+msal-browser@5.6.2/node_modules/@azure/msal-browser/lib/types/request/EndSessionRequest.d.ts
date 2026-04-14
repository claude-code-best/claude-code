import { CommonEndSessionRequest } from "@azure/msal-common/browser";
/**
 * EndSessionRequest
 */
export type EndSessionRequest = Partial<CommonEndSessionRequest> & {
    /**
     * Authority to send logout request.
     */
    authority?: string;
};
//# sourceMappingURL=EndSessionRequest.d.ts.map