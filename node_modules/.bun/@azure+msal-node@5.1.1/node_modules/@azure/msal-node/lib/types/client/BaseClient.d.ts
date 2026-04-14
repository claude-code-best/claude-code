import { ClientConfiguration, CommonClientConfiguration, INetworkModule, NetworkRequestOptions, Logger, ICrypto, CacheManager, ServerTelemetryManager, Authority, CcsCredential, RequestThumbprint, ServerAuthorizationTokenResponse, NetworkResponse, BaseAuthRequest, StubPerformanceClient } from "@azure/msal-common/node";
/**
 * Base application class which will construct requests to send to and handle responses from the Microsoft STS using the authorization code flow.
 * @internal
 */
export declare abstract class BaseClient {
    logger: Logger;
    protected config: CommonClientConfiguration;
    protected cryptoUtils: ICrypto;
    protected cacheManager: CacheManager;
    protected networkClient: INetworkModule;
    protected serverTelemetryManager: ServerTelemetryManager | null;
    authority: Authority;
    protected performanceClient: StubPerformanceClient;
    protected constructor(configuration: ClientConfiguration);
    /**
     * Creates default headers for requests to token endpoint
     */
    protected createTokenRequestHeaders(ccsCred?: CcsCredential): Record<string, string>;
    /**
     * Http post to token endpoint
     * @param tokenEndpoint
     * @param queryString
     * @param headers
     * @param thumbprint
     */
    protected executePostToTokenEndpoint(tokenEndpoint: string, queryString: string, headers: Record<string, string>, thumbprint: RequestThumbprint, correlationId: string): Promise<NetworkResponse<ServerAuthorizationTokenResponse>>;
    /**
     * Wraps sendPostRequestAsync with necessary preflight and postflight logic
     * @param thumbprint - Request thumbprint for throttling
     * @param tokenEndpoint - Endpoint to make the POST to
     * @param options - Body and Headers to include on the POST request
     * @param correlationId - CorrelationId for telemetry
     */
    sendPostRequest<T extends ServerAuthorizationTokenResponse>(thumbprint: RequestThumbprint, tokenEndpoint: string, options: NetworkRequestOptions, correlationId: string): Promise<NetworkResponse<T>>;
    /**
     * Creates query string for the /token request
     * @param request
     */
    createTokenQueryParameters(request: BaseAuthRequest): string;
}
//# sourceMappingURL=BaseClient.d.ts.map