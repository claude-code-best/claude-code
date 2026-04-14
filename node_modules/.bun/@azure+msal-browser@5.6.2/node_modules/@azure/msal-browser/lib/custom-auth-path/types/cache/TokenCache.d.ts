import { ExternalTokenResponse, IPerformanceClient } from "@azure/msal-common/browser";
import { Configuration } from "../config/Configuration.js";
import type { SilentRequest } from "../request/SilentRequest.js";
import type { AuthenticationResult } from "../response/AuthenticationResult.js";
export type LoadTokenOptions = {
    clientInfo?: string;
    expiresOn?: number;
    extendedExpiresOn?: number;
};
/**
 * API to load tokens to msal-browser cache.
 * @param config - Object to configure the MSAL app.
 * @param request - Silent request containing authority, scopes, and account.
 * @param response - External token response to load into the cache.
 * @param options - Options controlling how tokens are loaded into the cache.
 * @param performanceClient - Optional performance client used for telemetry measurements.
 * @returns `AuthenticationResult` for the response that was loaded.
 */
export declare function loadExternalTokens(config: Configuration, request: SilentRequest, response: ExternalTokenResponse, options: LoadTokenOptions, performanceClient?: IPerformanceClient): Promise<AuthenticationResult>;
//# sourceMappingURL=TokenCache.d.ts.map