/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ClientConfiguration,
    buildClientConfiguration,
    CommonClientConfiguration,
    INetworkModule,
    NetworkRequestOptions,
    Logger,
    ICrypto,
    CacheManager,
    ServerTelemetryManager,
    Authority,
    CcsCredential,
    TokenProtocol,
    RequestThumbprint,
    ServerAuthorizationTokenResponse,
    NetworkResponse,
    BaseAuthRequest,
    StubPerformanceClient,
} from "@azure/msal-common/node";
import { version, name } from "../packageMetadata.js";

/**
 * Base application class which will construct requests to send to and handle responses from the Microsoft STS using the authorization code flow.
 * @internal
 */
export abstract class BaseClient {
    // Logger object
    public logger: Logger;

    // Application config
    protected config: CommonClientConfiguration;

    // Crypto Interface
    protected cryptoUtils: ICrypto;

    // Storage Interface
    protected cacheManager: CacheManager;

    // Network Interface
    protected networkClient: INetworkModule;

    // Server Telemetry Manager
    protected serverTelemetryManager: ServerTelemetryManager | null;

    // Default authority object
    public authority: Authority;

    protected performanceClient: StubPerformanceClient;

    protected constructor(configuration: ClientConfiguration) {
        // Set the configuration
        this.config = buildClientConfiguration(configuration);

        // Initialize the logger
        this.logger = new Logger(this.config.loggerOptions, name, version);

        // Initialize crypto
        this.cryptoUtils = this.config.cryptoInterface;

        // Initialize storage interface
        this.cacheManager = this.config.storageInterface;

        // Set the network interface
        this.networkClient = this.config.networkInterface;

        // Set TelemetryManager
        this.serverTelemetryManager = this.config.serverTelemetryManager;

        // set Authority
        this.authority = this.config.authOptions.authority;

        this.performanceClient = new StubPerformanceClient();
    }

    /**
     * Creates default headers for requests to token endpoint
     */
    protected createTokenRequestHeaders(
        ccsCred?: CcsCredential
    ): Record<string, string> {
        return TokenProtocol.createTokenRequestHeaders(
            this.logger,
            false,
            ccsCred
        );
    }

    /**
     * Http post to token endpoint
     * @param tokenEndpoint
     * @param queryString
     * @param headers
     * @param thumbprint
     */
    protected async executePostToTokenEndpoint(
        tokenEndpoint: string,
        queryString: string,
        headers: Record<string, string>,
        thumbprint: RequestThumbprint,
        correlationId: string
    ): Promise<NetworkResponse<ServerAuthorizationTokenResponse>> {
        return TokenProtocol.executePostToTokenEndpoint(
            tokenEndpoint,
            queryString,
            headers,
            thumbprint,
            correlationId,
            this.cacheManager,
            this.networkClient,
            this.logger,
            this.performanceClient,
            this.serverTelemetryManager
        );
    }

    /**
     * Wraps sendPostRequestAsync with necessary preflight and postflight logic
     * @param thumbprint - Request thumbprint for throttling
     * @param tokenEndpoint - Endpoint to make the POST to
     * @param options - Body and Headers to include on the POST request
     * @param correlationId - CorrelationId for telemetry
     */
    async sendPostRequest<T extends ServerAuthorizationTokenResponse>(
        thumbprint: RequestThumbprint,
        tokenEndpoint: string,
        options: NetworkRequestOptions,
        correlationId: string
    ): Promise<NetworkResponse<T>> {
        return TokenProtocol.sendPostRequest<T>(
            thumbprint,
            tokenEndpoint,
            options,
            correlationId,
            this.cacheManager,
            this.networkClient,
            this.logger,
            this.performanceClient
        );
    }

    /**
     * Creates query string for the /token request
     * @param request
     */
    createTokenQueryParameters(request: BaseAuthRequest): string {
        return TokenProtocol.createTokenQueryParameters(
            request,
            this.config.authOptions.clientId,
            this.config.authOptions.redirectUri,
            this.performanceClient
        );
    }
}
