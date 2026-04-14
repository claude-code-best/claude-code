import { ClientConfiguration, CommonClientConfiguration } from "../config/ClientConfiguration.js";
import { CommonSilentFlowRequest } from "../request/CommonSilentFlowRequest.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import { CacheOutcome } from "../utils/Constants.js";
import { IPerformanceClient } from "../telemetry/performance/IPerformanceClient.js";
import { Authority } from "../authority/Authority.js";
import { Logger } from "../logger/Logger.js";
import { ICrypto } from "../crypto/ICrypto.js";
import { CacheManager } from "../cache/CacheManager.js";
import { INetworkModule } from "../network/INetworkModule.js";
import { ServerTelemetryManager } from "../telemetry/server/ServerTelemetryManager.js";
/** @internal */
export declare class SilentFlowClient {
    logger: Logger;
    protected config: CommonClientConfiguration;
    protected cryptoUtils: ICrypto;
    protected cacheManager: CacheManager;
    protected networkClient: INetworkModule;
    protected serverTelemetryManager: ServerTelemetryManager | null;
    authority: Authority;
    protected performanceClient: IPerformanceClient;
    constructor(configuration: ClientConfiguration, performanceClient: IPerformanceClient);
    /**
     * Retrieves token from cache or throws an error if it must be refreshed.
     * @param request
     */
    acquireCachedToken(request: CommonSilentFlowRequest): Promise<[AuthenticationResult, CacheOutcome]>;
    private setCacheOutcome;
    /**
     * Helper function to build response object from the CacheRecord
     * @param cacheRecord
     */
    private generateResultFromCacheRecord;
}
//# sourceMappingURL=SilentFlowClient.d.ts.map