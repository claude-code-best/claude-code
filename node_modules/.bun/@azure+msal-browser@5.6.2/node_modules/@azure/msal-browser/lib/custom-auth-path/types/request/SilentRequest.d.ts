import { AccountInfo, CommonSilentFlowRequest, StringDict } from "@azure/msal-common/browser";
import { CacheLookupPolicy } from "../utils/BrowserConstants.js";
/**
 * SilentRequest: Request object passed by user to retrieve tokens from the
 * cache, renew an expired token with a refresh token, or retrieve a code (first leg of authorization code grant flow)
 * in a hidden iframe.
 */
export type SilentRequest = Omit<CommonSilentFlowRequest, "authority" | "correlationId" | "forceRefresh" | "account"> & {
    /**
     * The redirect URI where authentication responses can be received by your application. It must exactly match one of the redirect URIs registered in the Azure portal. Only used for cases where refresh token is expired.
     */
    redirectUri?: string;
    /**
     * String to string map of custom query parameters added to outgoing token service requests. Unless the parameter is ONLY supported on query string use extraParameters instead.
     */
    extraQueryParameters?: StringDict;
    /**
     * Url of the authority which the application acquires tokens from.
     */
    authority?: string;
    /**
     * Account entity to lookup the credentials.
     */
    account?: AccountInfo;
    /**
     * Unique GUID set per request to trace a request end-to-end for telemetry purposes.
     */
    correlationId?: string;
    /**
     * Forces silent requests to make network calls if true.
     */
    forceRefresh?: boolean;
    /**
     * Enum of different ways the silent token can be retrieved.
     */
    cacheLookupPolicy?: CacheLookupPolicy;
    /**
     * Indicates the type of user interaction that is required.
     *          login: will force the user to enter their credentials on that request, negating single-sign on
     *          none:  will ensure that the user isn't presented with any interactive prompt. if request can't be completed via single-sign on, the endpoint will return an interaction_required error
     *          consent: will the trigger the OAuth consent dialog after the user signs in, asking the user to grant permissions to the app
     *          select_account: will interrupt single sign-=on providing account selection experience listing all the accounts in session or any remembered accounts or an option to choose to use a different account
     *          create: will direct the user to the account creation experience instead of the log in experience
     *          no_session: will not read existing session token when authenticating the user. Upon user being successfully authenticated, EVO won’t create a new session for the user. FOR INTERNAL USE ONLY.
     */
    prompt?: string;
    /**
     * A value included in the request that is also returned in the token response when a hidden iframe is used.
     */
    state?: string;
};
//# sourceMappingURL=SilentRequest.d.ts.map