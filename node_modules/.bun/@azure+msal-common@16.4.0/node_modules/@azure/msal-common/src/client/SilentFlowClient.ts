/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    buildClientConfiguration,
    ClientConfiguration,
    CommonClientConfiguration,
} from "../config/ClientConfiguration.js";
import { CommonSilentFlowRequest } from "../request/CommonSilentFlowRequest.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import * as TimeUtils from "../utils/TimeUtils.js";
import {
    ClientAuthErrorCodes,
    createClientAuthError,
} from "../error/ClientAuthError.js";
import { ResponseHandler } from "../response/ResponseHandler.js";
import { CacheRecord } from "../cache/entities/CacheRecord.js";
import { CacheOutcome } from "../utils/Constants.js";
import { IPerformanceClient } from "../telemetry/performance/IPerformanceClient.js";
import { StringUtils } from "../utils/StringUtils.js";
import { checkMaxAge, extractTokenClaims } from "../account/AuthToken.js";
import { TokenClaims } from "../account/TokenClaims.js";
import * as PerformanceEvents from "../telemetry/performance/PerformanceEvents.js";
import { invokeAsync } from "../utils/FunctionWrappers.js";
import {
    Authority,
    getTenantFromAuthorityString,
} from "../authority/Authority.js";
import { Logger } from "../logger/Logger.js";
import { ICrypto } from "../crypto/ICrypto.js";
import { CacheManager } from "../cache/CacheManager.js";
import { INetworkModule } from "../network/INetworkModule.js";
import { ServerTelemetryManager } from "../telemetry/server/ServerTelemetryManager.js";
import { version, name } from "../packageMetadata.js";

/** @internal */
export class SilentFlowClient {
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

    // Performance telemetry client
    protected performanceClient: IPerformanceClient;

    constructor(
        configuration: ClientConfiguration,
        performanceClient: IPerformanceClient
    ) {
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

        // set performance telemetry client
        this.performanceClient = performanceClient;
    }

    /**
     * Retrieves token from cache or throws an error if it must be refreshed.
     * @param request
     */
    async acquireCachedToken(
        request: CommonSilentFlowRequest
    ): Promise<[AuthenticationResult, CacheOutcome]> {
        let lastCacheOutcome: CacheOutcome = CacheOutcome.NOT_APPLICABLE;

        if (request.forceRefresh || !StringUtils.isEmptyObj(request.claims)) {
            // Must refresh due to present force_refresh flag.
            this.setCacheOutcome(
                CacheOutcome.FORCE_REFRESH_OR_CLAIMS,
                request.correlationId
            );
            throw createClientAuthError(
                ClientAuthErrorCodes.tokenRefreshRequired
            );
        }

        // We currently do not support silent flow for account === null use cases; This will be revisited for confidential flow usecases
        if (!request.account) {
            throw createClientAuthError(
                ClientAuthErrorCodes.noAccountInSilentRequest
            );
        }

        const requestTenantId =
            request.account.tenantId ||
            getTenantFromAuthorityString(request.authority);
        const tokenKeys = this.cacheManager.getTokenKeys();
        const cachedAccessToken = this.cacheManager.getAccessToken(
            request.account,
            request,
            tokenKeys,
            requestTenantId
        );

        if (!cachedAccessToken) {
            // must refresh due to non-existent access_token
            this.setCacheOutcome(
                CacheOutcome.NO_CACHED_ACCESS_TOKEN,
                request.correlationId
            );
            throw createClientAuthError(
                ClientAuthErrorCodes.tokenRefreshRequired
            );
        } else if (
            TimeUtils.wasClockTurnedBack(cachedAccessToken.cachedAt) ||
            TimeUtils.isTokenExpired(
                cachedAccessToken.expiresOn,
                this.config.systemOptions.tokenRenewalOffsetSeconds
            )
        ) {
            // must refresh due to the expires_in value
            this.setCacheOutcome(
                CacheOutcome.CACHED_ACCESS_TOKEN_EXPIRED,
                request.correlationId
            );
            throw createClientAuthError(
                ClientAuthErrorCodes.tokenRefreshRequired
            );
        } else if (request.resource) {
            // cached access token must have a resource that matches the request resource for MCP scenarios
            if (cachedAccessToken.resource !== request.resource) {
                this.setCacheOutcome(
                    CacheOutcome.NO_CACHED_ACCESS_TOKEN,
                    request.correlationId
                );
                throw createClientAuthError(
                    ClientAuthErrorCodes.tokenRefreshRequired
                );
            }
        } else if (
            cachedAccessToken.refreshOn &&
            TimeUtils.isTokenExpired(cachedAccessToken.refreshOn, 0)
        ) {
            // must refresh (in the background) due to the refresh_in value
            lastCacheOutcome = CacheOutcome.PROACTIVELY_REFRESHED;

            // don't throw ClientAuthError.createRefreshRequiredError(), return cached token instead
        }

        const environment =
            request.authority || this.authority.getPreferredCache();
        const cacheRecord: CacheRecord = {
            account: this.cacheManager.getAccount(
                this.cacheManager.generateAccountKey(request.account),
                request.correlationId
            ),
            accessToken: cachedAccessToken,
            idToken: this.cacheManager.getIdToken(
                request.account,
                request.correlationId,
                tokenKeys,
                requestTenantId
            ),
            refreshToken: null,
            appMetadata: this.cacheManager.readAppMetadataFromCache(
                environment,
                request.correlationId
            ),
        };

        this.setCacheOutcome(lastCacheOutcome, request.correlationId);

        if (this.config.serverTelemetryManager) {
            this.config.serverTelemetryManager.incrementCacheHits();
        }

        return [
            await invokeAsync(
                this.generateResultFromCacheRecord.bind(this),
                PerformanceEvents.SilentFlowClientGenerateResultFromCacheRecord,
                this.logger,
                this.performanceClient,
                request.correlationId
            )(cacheRecord, request),
            lastCacheOutcome,
        ];
    }

    private setCacheOutcome(
        cacheOutcome: CacheOutcome,
        correlationId: string
    ): void {
        this.serverTelemetryManager?.setCacheOutcome(cacheOutcome);
        this.performanceClient?.addFields(
            {
                cacheOutcome: cacheOutcome,
            },
            correlationId
        );
        if (cacheOutcome !== CacheOutcome.NOT_APPLICABLE) {
            this.logger.info(
                `Token refresh is required due to cache outcome: '${cacheOutcome}'`,
                correlationId
            );
        }
    }

    /**
     * Helper function to build response object from the CacheRecord
     * @param cacheRecord
     */
    private async generateResultFromCacheRecord(
        cacheRecord: CacheRecord,
        request: CommonSilentFlowRequest
    ): Promise<AuthenticationResult> {
        let idTokenClaims: TokenClaims | undefined;
        if (cacheRecord.idToken) {
            idTokenClaims = extractTokenClaims(
                cacheRecord.idToken.secret,
                this.config.cryptoInterface.base64Decode
            );
        }

        // token max_age check
        if (request.maxAge || request.maxAge === 0) {
            const authTime = idTokenClaims?.auth_time;
            if (!authTime) {
                throw createClientAuthError(
                    ClientAuthErrorCodes.authTimeNotFound
                );
            }

            checkMaxAge(authTime, request.maxAge);
        }

        return ResponseHandler.generateAuthenticationResult(
            this.cryptoUtils,
            this.authority,
            cacheRecord,
            true,
            request,
            this.performanceClient,
            idTokenClaims
        );
    }
}
