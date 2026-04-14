/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    buildClientConfiguration,
    ClientConfiguration,
    CommonClientConfiguration,
    isOidcProtocolMode,
} from "../config/ClientConfiguration.js";
import { CommonRefreshTokenRequest } from "../request/CommonRefreshTokenRequest.js";
import { Authority } from "../authority/Authority.js";
import { ServerAuthorizationTokenResponse } from "../response/ServerAuthorizationTokenResponse.js";
import * as RequestParameterBuilder from "../request/RequestParameterBuilder.js";
import * as UrlUtils from "../utils/UrlUtils.js";
import * as Constants from "../utils/Constants.js";
import * as AADServerParamKeys from "../constants/AADServerParamKeys.js";
import { ResponseHandler } from "../response/ResponseHandler.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import { PopTokenGenerator } from "../crypto/PopTokenGenerator.js";
import { StringUtils } from "../utils/StringUtils.js";
import { NetworkResponse } from "../network/NetworkResponse.js";
import { CommonSilentFlowRequest } from "../request/CommonSilentFlowRequest.js";
import {
    createClientConfigurationError,
    ClientConfigurationErrorCodes,
} from "../error/ClientConfigurationError.js";
import {
    createClientAuthError,
    ClientAuthErrorCodes,
} from "../error/ClientAuthError.js";
import { ServerError } from "../error/ServerError.js";
import * as TimeUtils from "../utils/TimeUtils.js";
import { UrlString } from "../url/UrlString.js";
import { CcsCredentialType } from "../account/CcsCredential.js";
import { buildClientInfoFromHomeAccountId } from "../account/ClientInfo.js";
import {
    InteractionRequiredAuthError,
    InteractionRequiredAuthErrorCodes,
    createInteractionRequiredAuthError,
} from "../error/InteractionRequiredAuthError.js";
import * as PerformanceEvents from "../telemetry/performance/PerformanceEvents.js";
import { IPerformanceClient } from "../telemetry/performance/IPerformanceClient.js";
import { invoke, invokeAsync } from "../utils/FunctionWrappers.js";
import { ClientAssertion } from "../account/ClientCredentials.js";
import { getClientAssertion } from "../utils/ClientAssertionUtils.js";
import { getRequestThumbprint } from "../network/RequestThumbprint.js";
import {
    createTokenQueryParameters,
    createTokenRequestHeaders,
    executePostToTokenEndpoint,
} from "../protocol/Token.js";
import { ServerTelemetryManager } from "../telemetry/server/ServerTelemetryManager.js";
import { INetworkModule } from "../network/INetworkModule.js";
import { CacheManager } from "../cache/CacheManager.js";
import { ICrypto } from "../crypto/ICrypto.js";
import { Logger } from "../logger/Logger.js";
import { version, name } from "../packageMetadata.js";

const DEFAULT_REFRESH_TOKEN_EXPIRATION_OFFSET_SECONDS = 300; // 5 Minutes

/**
 * OAuth2.0 refresh token client
 * @internal
 */
export class RefreshTokenClient {
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
    public async acquireToken(
        request: CommonRefreshTokenRequest,
        apiId: number
    ): Promise<AuthenticationResult> {
        const reqTimestamp = TimeUtils.nowSeconds();
        const response = await invokeAsync(
            this.executeTokenRequest.bind(this),
            PerformanceEvents.RefreshTokenClientExecuteTokenRequest,
            this.logger,
            this.performanceClient,
            request.correlationId
        )(request, this.authority);

        // Retrieve requestId from response headers
        const requestId =
            response.headers?.[Constants.HeaderNames.X_MS_REQUEST_ID];
        const responseHandler = new ResponseHandler(
            this.config.authOptions.clientId,
            this.cacheManager,
            this.cryptoUtils,
            this.logger,
            this.performanceClient,
            this.config.serializableCache,
            this.config.persistencePlugin
        );
        responseHandler.validateTokenResponse(
            response.body,
            request.correlationId
        );

        return invokeAsync(
            responseHandler.handleServerTokenResponse.bind(responseHandler),
            PerformanceEvents.HandleServerTokenResponse,
            this.logger,
            this.performanceClient,
            request.correlationId
        )(
            response.body,
            this.authority,
            reqTimestamp,
            request,
            apiId,
            undefined,
            undefined,
            true,
            request.forceCache,
            requestId
        );
    }

    /**
     * Gets cached refresh token and attaches to request, then calls acquireToken API
     * @param request
     */
    public async acquireTokenByRefreshToken(
        request: CommonSilentFlowRequest,
        apiId: number
    ): Promise<AuthenticationResult> {
        // Cannot renew token if no request object is given.
        if (!request) {
            throw createClientConfigurationError(
                ClientConfigurationErrorCodes.tokenRequestEmpty
            );
        }
        // We currently do not support silent flow for account === null use cases; This will be revisited for confidential flow usecases
        if (!request.account) {
            throw createClientAuthError(
                ClientAuthErrorCodes.noAccountInSilentRequest
            );
        }

        // try checking if FOCI is enabled for the given application
        const isFOCI = this.cacheManager.isAppMetadataFOCI(
            request.account.environment,
            request.correlationId
        );

        // if the app is part of the family, retrive a Family refresh token if present and make a refreshTokenRequest
        if (isFOCI) {
            try {
                return await invokeAsync(
                    this.acquireTokenWithCachedRefreshToken.bind(this),
                    PerformanceEvents.RefreshTokenClientAcquireTokenWithCachedRefreshToken,
                    this.logger,
                    this.performanceClient,
                    request.correlationId
                )(request, true, apiId);
            } catch (e) {
                const noFamilyRTInCache =
                    e instanceof InteractionRequiredAuthError &&
                    e.errorCode ===
                        InteractionRequiredAuthErrorCodes.noTokensFound;
                const clientMismatchErrorWithFamilyRT =
                    e instanceof ServerError &&
                    e.errorCode === Constants.INVALID_GRANT_ERROR &&
                    e.subError === Constants.CLIENT_MISMATCH_ERROR;

                // if family Refresh Token (FRT) cache acquisition fails or if client_mismatch error is seen with FRT, reattempt with application Refresh Token (ART)
                if (noFamilyRTInCache || clientMismatchErrorWithFamilyRT) {
                    return invokeAsync(
                        this.acquireTokenWithCachedRefreshToken.bind(this),
                        PerformanceEvents.RefreshTokenClientAcquireTokenWithCachedRefreshToken,
                        this.logger,
                        this.performanceClient,
                        request.correlationId
                    )(request, false, apiId);
                    // throw in all other cases
                } else {
                    throw e;
                }
            }
        }
        // fall back to application refresh token acquisition
        return invokeAsync(
            this.acquireTokenWithCachedRefreshToken.bind(this),
            PerformanceEvents.RefreshTokenClientAcquireTokenWithCachedRefreshToken,
            this.logger,
            this.performanceClient,
            request.correlationId
        )(request, false, apiId);
    }

    /**
     * makes a network call to acquire tokens by exchanging RefreshToken available in userCache; throws if refresh token is not cached
     * @param request
     */
    private async acquireTokenWithCachedRefreshToken(
        request: CommonSilentFlowRequest,
        foci: boolean,
        apiId: number
    ) {
        // fetches family RT or application RT based on FOCI value
        const refreshToken = invoke(
            this.cacheManager.getRefreshToken.bind(this.cacheManager),
            PerformanceEvents.CacheManagerGetRefreshToken,
            this.logger,
            this.performanceClient,
            request.correlationId
        )(request.account, foci, request.correlationId, undefined);

        if (!refreshToken) {
            throw createInteractionRequiredAuthError(
                InteractionRequiredAuthErrorCodes.noTokensFound
            );
        }

        if (refreshToken.expiresOn) {
            const offset =
                request.refreshTokenExpirationOffsetSeconds ||
                DEFAULT_REFRESH_TOKEN_EXPIRATION_OFFSET_SECONDS;
            this.performanceClient?.addFields(
                {
                    cacheRtExpiresOnSeconds: Number(refreshToken.expiresOn),
                    rtOffsetSeconds: offset,
                },
                request.correlationId
            );

            if (TimeUtils.isTokenExpired(refreshToken.expiresOn, offset)) {
                throw createInteractionRequiredAuthError(
                    InteractionRequiredAuthErrorCodes.refreshTokenExpired
                );
            }
        }
        // attach cached RT size to the current measurement

        const refreshTokenRequest: CommonRefreshTokenRequest = {
            ...request,
            refreshToken: refreshToken.secret,
            authenticationScheme:
                request.authenticationScheme ||
                Constants.AuthenticationScheme.BEARER,
            ccsCredential: {
                credential: request.account.homeAccountId,
                type: CcsCredentialType.HOME_ACCOUNT_ID,
            },
        };

        try {
            return await invokeAsync(
                this.acquireToken.bind(this),
                PerformanceEvents.RefreshTokenClientAcquireToken,
                this.logger,
                this.performanceClient,
                request.correlationId
            )(refreshTokenRequest, apiId);
        } catch (e) {
            if (e instanceof InteractionRequiredAuthError) {
                if (e.subError === InteractionRequiredAuthErrorCodes.badToken) {
                    // Remove bad refresh token from cache
                    this.logger.verbose(
                        "acquireTokenWithRefreshToken: bad refresh token, removing from cache",
                        request.correlationId
                    );
                    const badRefreshTokenKey =
                        this.cacheManager.generateCredentialKey(refreshToken);
                    this.cacheManager.removeRefreshToken(
                        badRefreshTokenKey,
                        request.correlationId
                    );
                }
            }

            throw e;
        }
    }

    /**
     * Constructs the network message and makes a NW call to the underlying secure token service
     * @param request
     * @param authority
     */
    private async executeTokenRequest(
        request: CommonRefreshTokenRequest,
        authority: Authority
    ): Promise<NetworkResponse<ServerAuthorizationTokenResponse>> {
        const queryParametersString = createTokenQueryParameters(
            request,
            this.config.authOptions.clientId,
            this.config.authOptions.redirectUri,
            this.performanceClient
        );
        const endpoint = UrlString.appendQueryString(
            authority.tokenEndpoint,
            queryParametersString
        );

        const requestBody = await invokeAsync(
            this.createTokenRequestBody.bind(this),
            PerformanceEvents.RefreshTokenClientCreateTokenRequestBody,
            this.logger,
            this.performanceClient,
            request.correlationId
        )(request);
        const headers: Record<string, string> = createTokenRequestHeaders(
            this.logger,
            this.config.systemOptions.preventCorsPreflight,
            request.ccsCredential
        );

        const thumbprint = getRequestThumbprint(
            this.config.authOptions.clientId,
            request
        );

        return invokeAsync(
            executePostToTokenEndpoint,
            PerformanceEvents.RefreshTokenClientExecutePostToTokenEndpoint,
            this.logger,
            this.performanceClient,
            request.correlationId
        )(
            endpoint,
            requestBody,
            headers,
            thumbprint,
            request.correlationId,
            this.cacheManager,
            this.networkClient,
            this.logger,
            this.performanceClient,
            this.serverTelemetryManager
        );
    }

    /**
     * Helper function to create the token request body
     * @param request
     */
    private async createTokenRequestBody(
        request: CommonRefreshTokenRequest
    ): Promise<string> {
        const parameters = new Map<string, string>();

        RequestParameterBuilder.addClientId(
            parameters,
            request.embeddedClientId ||
                request.extraParameters?.[AADServerParamKeys.CLIENT_ID] ||
                this.config.authOptions.clientId
        );

        if (request.redirectUri) {
            RequestParameterBuilder.addRedirectUri(
                parameters,
                request.redirectUri
            );
        }

        RequestParameterBuilder.addScopes(
            parameters,
            request.scopes,
            true,
            this.config.authOptions.authority.options.OIDCOptions?.defaultScopes
        );

        RequestParameterBuilder.addGrantType(
            parameters,
            Constants.GrantType.REFRESH_TOKEN_GRANT
        );

        RequestParameterBuilder.addClientInfo(parameters);

        RequestParameterBuilder.addLibraryInfo(
            parameters,
            this.config.libraryInfo
        );
        RequestParameterBuilder.addApplicationTelemetry(
            parameters,
            this.config.telemetry.application
        );
        RequestParameterBuilder.addThrottling(parameters);

        if (this.serverTelemetryManager && !isOidcProtocolMode(this.config)) {
            RequestParameterBuilder.addServerTelemetry(
                parameters,
                this.serverTelemetryManager
            );
        }

        RequestParameterBuilder.addRefreshToken(
            parameters,
            request.refreshToken
        );

        if (this.config.clientCredentials.clientSecret) {
            RequestParameterBuilder.addClientSecret(
                parameters,
                this.config.clientCredentials.clientSecret
            );
        }

        if (this.config.clientCredentials.clientAssertion) {
            const clientAssertion: ClientAssertion =
                this.config.clientCredentials.clientAssertion;

            RequestParameterBuilder.addClientAssertion(
                parameters,
                await getClientAssertion(
                    clientAssertion.assertion,
                    this.config.authOptions.clientId,
                    request.resourceRequestUri
                )
            );
            RequestParameterBuilder.addClientAssertionType(
                parameters,
                clientAssertion.assertionType
            );
        }

        if (
            request.authenticationScheme === Constants.AuthenticationScheme.POP
        ) {
            const popTokenGenerator = new PopTokenGenerator(
                this.cryptoUtils,
                this.performanceClient
            );

            let reqCnfData;
            if (!request.popKid) {
                const generatedReqCnfData = await invokeAsync(
                    popTokenGenerator.generateCnf.bind(popTokenGenerator),
                    PerformanceEvents.PopTokenGenerateCnf,
                    this.logger,
                    this.performanceClient,
                    request.correlationId
                )(request, this.logger);

                reqCnfData = generatedReqCnfData.reqCnfString;
            } else {
                reqCnfData = this.cryptoUtils.encodeKid(request.popKid);
            }

            // SPA PoP requires full Base64Url encoded req_cnf string (unhashed)
            RequestParameterBuilder.addPopToken(parameters, reqCnfData);
        } else if (
            request.authenticationScheme === Constants.AuthenticationScheme.SSH
        ) {
            if (request.sshJwk) {
                RequestParameterBuilder.addSshJwk(parameters, request.sshJwk);
            } else {
                throw createClientConfigurationError(
                    ClientConfigurationErrorCodes.missingSshJwk
                );
            }
        }

        if (
            !StringUtils.isEmptyObj(request.claims) ||
            (this.config.authOptions.clientCapabilities &&
                this.config.authOptions.clientCapabilities.length > 0)
        ) {
            RequestParameterBuilder.addClaims(
                parameters,
                request.claims,
                this.config.authOptions.clientCapabilities
            );
        }

        if (
            this.config.systemOptions.preventCorsPreflight &&
            request.ccsCredential
        ) {
            switch (request.ccsCredential.type) {
                case CcsCredentialType.HOME_ACCOUNT_ID:
                    try {
                        const clientInfo = buildClientInfoFromHomeAccountId(
                            request.ccsCredential.credential
                        );
                        RequestParameterBuilder.addCcsOid(
                            parameters,
                            clientInfo
                        );
                    } catch (e) {
                        this.logger.verbose(
                            `Could not parse home account ID for CCS Header: '${e}'`,
                            request.correlationId
                        );
                    }
                    break;
                case CcsCredentialType.UPN:
                    RequestParameterBuilder.addCcsUpn(
                        parameters,
                        request.ccsCredential.credential
                    );
                    break;
            }
        }

        if (request.embeddedClientId) {
            RequestParameterBuilder.addBrokerParameters(
                parameters,
                this.config.authOptions.clientId,
                this.config.authOptions.redirectUri
            );
        }

        if (request.extraParameters) {
            RequestParameterBuilder.addExtraParameters(parameters, {
                ...request.extraParameters,
            });
        }

        RequestParameterBuilder.instrumentBrokerParams(
            parameters,
            request.correlationId,
            this.performanceClient
        );
        return UrlUtils.mapToQueryString(parameters);
    }
}
