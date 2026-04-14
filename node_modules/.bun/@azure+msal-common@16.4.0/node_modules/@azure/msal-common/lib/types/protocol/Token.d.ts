import { CcsCredential } from "../account/CcsCredential.js";
import { Logger } from "../logger/Logger.js";
import { BaseAuthRequest } from "../request/BaseAuthRequest.js";
import { IPerformanceClient } from "../exports-browser-only.js";
import { ServerAuthorizationTokenResponse } from "../response/ServerAuthorizationTokenResponse.js";
import { RequestThumbprint } from "../network/RequestThumbprint.js";
import { INetworkModule, NetworkRequestOptions } from "../network/INetworkModule.js";
import { NetworkResponse } from "../network/NetworkResponse.js";
import { CacheManager } from "../cache/CacheManager.js";
import { ServerTelemetryManager } from "../telemetry/server/ServerTelemetryManager.js";
/**
 * Creates default headers for requests to token endpoint
 */
export declare function createTokenRequestHeaders(logger: Logger, preventCorsPreflight: boolean, ccsCred?: CcsCredential): Record<string, string>;
/**
 * Creates query string for the /token request
 * @param request
 */
export declare function createTokenQueryParameters(request: BaseAuthRequest, clientId: string, redirectUri: string, performanceClient: IPerformanceClient): string;
/**
 * Http post to token endpoint
 * @param tokenEndpoint
 * @param queryString
 * @param headers
 * @param thumbprint
 */
export declare function executePostToTokenEndpoint(tokenEndpoint: string, queryString: string, headers: Record<string, string>, thumbprint: RequestThumbprint, correlationId: string, cacheManager: CacheManager, networkClient: INetworkModule, logger: Logger, performanceClient: IPerformanceClient, serverTelemetryManager: ServerTelemetryManager | null): Promise<NetworkResponse<ServerAuthorizationTokenResponse>>;
/**
 * Wraps sendPostRequestAsync with necessary preflight and postflight logic
 * @param thumbprint - Request thumbprint for throttling
 * @param tokenEndpoint - Endpoint to make the POST to
 * @param options - Body and Headers to include on the POST request
 * @param correlationId - CorrelationId for telemetry
 * @param cacheManager - Cache manager instance
 * @param networkClient - Network module instance
 * @param logger - Logger instance
 * @param performanceClient - Performance client instance
 */
export declare function sendPostRequest<T extends ServerAuthorizationTokenResponse>(thumbprint: RequestThumbprint, tokenEndpoint: string, options: NetworkRequestOptions, correlationId: string, cacheManager: CacheManager, networkClient: INetworkModule, logger: Logger, performanceClient: IPerformanceClient): Promise<NetworkResponse<T>>;
//# sourceMappingURL=Token.d.ts.map