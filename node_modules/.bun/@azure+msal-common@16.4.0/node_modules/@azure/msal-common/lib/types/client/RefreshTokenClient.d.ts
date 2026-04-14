import { ClientConfiguration, CommonClientConfiguration } from "../config/ClientConfiguration.js";
import { CommonRefreshTokenRequest } from "../request/CommonRefreshTokenRequest.js";
import { Authority } from "../authority/Authority.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import { CommonSilentFlowRequest } from "../request/CommonSilentFlowRequest.js";
import { IPerformanceClient } from "../telemetry/performance/IPerformanceClient.js";
import { ServerTelemetryManager } from "../telemetry/server/ServerTelemetryManager.js";
import { INetworkModule } from "../network/INetworkModule.js";
import { CacheManager } from "../cache/CacheManager.js";
import { ICrypto } from "../crypto/ICrypto.js";
import { Logger } from "../logger/Logger.js";
/**
 * OAuth2.0 refresh token client
 * @internal
 */
export declare class RefreshTokenClient {
    logger: Logger;
    protected config: CommonClientConfiguration;
    protected cryptoUtils: ICrypto;
    protected cacheManager: CacheManager;
    protected networkClient: INetworkModule;
    protected serverTelemetryManager: ServerTelemetryManager | null;
    authority: Authority;
    protected performanceClient: IPerformanceClient;
    constructor(configuration: ClientConfiguration, performanceClient: IPerformanceClient);
    acquireToken(request: CommonRefreshTokenRequest, apiId: number): Promise<AuthenticationResult>;
    /**
     * Gets cached refresh token and attaches to request, then calls acquireToken API
     * @param request
     */
    acquireTokenByRefreshToken(request: CommonSilentFlowRequest, apiId: number): Promise<AuthenticationResult>;
    /**
     * makes a network call to acquire tokens by exchanging RefreshToken available in userCache; throws if refresh token is not cached
     * @param request
     */
    private acquireTokenWithCachedRefreshToken;
    /**
     * Constructs the network message and makes a NW call to the underlying secure token service
     * @param request
     * @param authority
     */
    private executeTokenRequest;
    /**
     * Helper function to create the token request body
     * @param request
     */
    private createTokenRequestBody;
}
//# sourceMappingURL=RefreshTokenClient.d.ts.map