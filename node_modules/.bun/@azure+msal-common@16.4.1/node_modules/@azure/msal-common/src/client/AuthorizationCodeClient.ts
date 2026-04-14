/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonAuthorizationCodeRequest } from "../request/CommonAuthorizationCodeRequest.js";
import { Authority } from "../authority/Authority.js";
import * as RequestParameterBuilder from "../request/RequestParameterBuilder.js";
import * as UrlUtils from "../utils/UrlUtils.js";
import * as Constants from "../utils/Constants.js";
import * as AADServerParamKeys from "../constants/AADServerParamKeys.js";
import {
    buildClientConfiguration,
    ClientConfiguration,
    CommonClientConfiguration,
    isOidcProtocolMode,
} from "../config/ClientConfiguration.js";
import { ServerAuthorizationTokenResponse } from "../response/ServerAuthorizationTokenResponse.js";
import { NetworkResponse } from "../network/NetworkResponse.js";
import { ResponseHandler } from "../response/ResponseHandler.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import { StringUtils } from "../utils/StringUtils.js";
import {
    ClientAuthErrorCodes,
    createClientAuthError,
} from "../error/ClientAuthError.js";
import { UrlString } from "../url/UrlString.js";
import { CommonEndSessionRequest } from "../request/CommonEndSessionRequest.js";
import { PopTokenGenerator } from "../crypto/PopTokenGenerator.js";
import { AuthorizationCodePayload } from "../response/AuthorizationCodePayload.js";
import * as TimeUtils from "../utils/TimeUtils.js";
import {
    buildClientInfoFromHomeAccountId,
    buildClientInfo,
} from "../account/ClientInfo.js";
import { CcsCredentialType, CcsCredential } from "../account/CcsCredential.js";
import {
    createClientConfigurationError,
    ClientConfigurationErrorCodes,
} from "../error/ClientConfigurationError.js";
import { IPerformanceClient } from "../telemetry/performance/IPerformanceClient.js";
import * as PerformanceEvents from "../telemetry/performance/PerformanceEvents.js";
import { invokeAsync } from "../utils/FunctionWrappers.js";
import { ClientAssertion } from "../account/ClientCredentials.js";
import { getClientAssertion } from "../utils/ClientAssertionUtils.js";
import { getRequestThumbprint } from "../network/RequestThumbprint.js";
import {
    createTokenQueryParameters,
    createTokenRequestHeaders,
    executePostToTokenEndpoint,
} from "../protocol/Token.js";
import { createDiscoveredInstance } from "../authority/AuthorityFactory.js";
import { ServerTelemetryManager } from "../telemetry/server/ServerTelemetryManager.js";
import { Logger } from "../logger/Logger.js";
import { ICrypto } from "../crypto/ICrypto.js";
import { CacheManager } from "../cache/CacheManager.js";
import { INetworkModule } from "../network/INetworkModule.js";
import { version, name } from "../packageMetadata.js";

/**
 * Oauth2.0 Authorization Code client
 * @internal
 */
export class AuthorizationCodeClient {
    // Flag to indicate if client is for hybrid spa auth code redemption
    protected includeRedirectUri: boolean = true;
    private oidcDefaultScopes;

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
        this.oidcDefaultScopes =
            this.config.authOptions.authority.options.OIDCOptions?.defaultScopes;
    }

    /**
     * API to acquire a token in exchange of 'authorization_code` acquired by the user in the first leg of the
     * authorization_code_grant
     * @param request
     */
    async acquireToken(
        request: CommonAuthorizationCodeRequest,
        apiId: number,
        authCodePayload?: AuthorizationCodePayload
    ): Promise<AuthenticationResult> {
        if (!request.code) {
            throw createClientAuthError(
                ClientAuthErrorCodes.requestCannotBeMade
            );
        }

        // Check for new cloud instance
        if (authCodePayload && authCodePayload.cloud_instance_host_name) {
            await invokeAsync(
                this.updateTokenEndpointAuthority.bind(this),
                PerformanceEvents.UpdateTokenEndpointAuthority,
                this.logger,
                this.performanceClient,
                request.correlationId
            )(authCodePayload.cloud_instance_host_name, request.correlationId);
        }

        const reqTimestamp = TimeUtils.nowSeconds();
        const response = await invokeAsync(
            this.executeTokenRequest.bind(this),
            PerformanceEvents.AuthClientExecuteTokenRequest,
            this.logger,
            this.performanceClient,
            request.correlationId
        )(this.authority, request, this.serverTelemetryManager);

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

        // Validate response. This function throws a server error if an error is returned by the server.
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
            authCodePayload,
            undefined,
            undefined,
            undefined,
            requestId
        );
    }

    /**
     * Used to log out the current user, and redirect the user to the postLogoutRedirectUri.
     * Default behaviour is to redirect the user to `window.location.href`.
     * @param authorityUri
     */
    getLogoutUri(logoutRequest: CommonEndSessionRequest): string {
        // Throw error if logoutRequest is null/undefined
        if (!logoutRequest) {
            throw createClientConfigurationError(
                ClientConfigurationErrorCodes.logoutRequestEmpty
            );
        }
        const queryString = this.createLogoutUrlQueryString(logoutRequest);

        // Construct logout URI
        return UrlString.appendQueryString(
            this.authority.endSessionEndpoint,
            queryString
        );
    }

    /**
     * Executes POST request to token endpoint
     * @param authority
     * @param request
     */
    private async executeTokenRequest(
        authority: Authority,
        request: CommonAuthorizationCodeRequest,
        serverTelemetryManager: ServerTelemetryManager | null
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
            PerformanceEvents.AuthClientCreateTokenRequestBody,
            this.logger,
            this.performanceClient,
            request.correlationId
        )(request);

        let ccsCredential: CcsCredential | undefined = undefined;
        if (request.clientInfo) {
            try {
                const clientInfo = buildClientInfo(
                    request.clientInfo,
                    this.cryptoUtils.base64Decode
                );
                ccsCredential = {
                    credential: `${clientInfo.uid}${Constants.CLIENT_INFO_SEPARATOR}${clientInfo.utid}`,
                    type: CcsCredentialType.HOME_ACCOUNT_ID,
                };
            } catch (e) {
                this.logger.verbose(
                    `Could not parse client info for CCS Header: '${e}'`,
                    request.correlationId
                );
            }
        }
        const headers: Record<string, string> = createTokenRequestHeaders(
            this.logger,
            this.config.systemOptions.preventCorsPreflight,
            ccsCredential || request.ccsCredential
        );

        const thumbprint = getRequestThumbprint(
            this.config.authOptions.clientId,
            request
        );

        return invokeAsync(
            executePostToTokenEndpoint,
            PerformanceEvents.AuthorizationCodeClientExecutePostToTokenEndpoint,
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
            serverTelemetryManager
        );
    }

    /**
     * Generates a map for all the params to be sent to the service
     * @param request
     */
    private async createTokenRequestBody(
        request: CommonAuthorizationCodeRequest
    ): Promise<string> {
        const parameters = new Map<string, string>();

        RequestParameterBuilder.addClientId(
            parameters,
            request.embeddedClientId ||
                request.extraParameters?.[AADServerParamKeys.CLIENT_ID] ||
                this.config.authOptions.clientId
        );

        /*
         * For hybrid spa flow, there will be a code but no verifier
         * In this scenario, don't include redirect uri as auth code will not be bound to redirect URI
         */
        if (!this.includeRedirectUri) {
            // Just validate
            if (!request.redirectUri) {
                throw createClientConfigurationError(
                    ClientConfigurationErrorCodes.redirectUriEmpty
                );
            }
        } else {
            // Validate and include redirect uri
            RequestParameterBuilder.addRedirectUri(
                parameters,
                request.redirectUri
            );
        }

        // Add scope array, parameter builder will add default scopes and dedupe
        RequestParameterBuilder.addScopes(
            parameters,
            request.scopes,
            true,
            this.oidcDefaultScopes
        );

        RequestParameterBuilder.addResource(parameters, request.resource);

        // add code: user set, not validated
        RequestParameterBuilder.addAuthorizationCode(parameters, request.code);

        // Add library metadata
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

        // add code_verifier if passed
        if (request.codeVerifier) {
            RequestParameterBuilder.addCodeVerifier(
                parameters,
                request.codeVerifier
            );
        }

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

        RequestParameterBuilder.addGrantType(
            parameters,
            Constants.GrantType.AUTHORIZATION_CODE_GRANT
        );
        RequestParameterBuilder.addClientInfo(parameters);

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

        let ccsCred: CcsCredential | undefined = undefined;
        if (request.clientInfo) {
            try {
                const clientInfo = buildClientInfo(
                    request.clientInfo,
                    this.cryptoUtils.base64Decode
                );
                ccsCred = {
                    credential: `${clientInfo.uid}${Constants.CLIENT_INFO_SEPARATOR}${clientInfo.utid}`,
                    type: CcsCredentialType.HOME_ACCOUNT_ID,
                };
            } catch (e) {
                this.logger.verbose(
                    `Could not parse client info for CCS Header: '${e}'`,
                    request.correlationId
                );
            }
        } else {
            ccsCred = request.ccsCredential;
        }

        // Adds these as parameters in the request instead of headers to prevent CORS preflight request
        if (this.config.systemOptions.preventCorsPreflight && ccsCred) {
            switch (ccsCred.type) {
                case CcsCredentialType.HOME_ACCOUNT_ID:
                    try {
                        const clientInfo = buildClientInfoFromHomeAccountId(
                            ccsCred.credential
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
                        ccsCred.credential
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
            RequestParameterBuilder.addExtraParameters(
                parameters,
                request.extraParameters
            );
        }

        // Add hybrid spa parameters if not already provided
        if (
            request.enableSpaAuthorizationCode &&
            (!request.extraParameters ||
                !request.extraParameters[AADServerParamKeys.RETURN_SPA_CODE])
        ) {
            RequestParameterBuilder.addExtraParameters(parameters, {
                [AADServerParamKeys.RETURN_SPA_CODE]: "1",
            });
        }

        RequestParameterBuilder.instrumentBrokerParams(
            parameters,
            request.correlationId,
            this.performanceClient
        );
        return UrlUtils.mapToQueryString(parameters);
    }

    /**
     * This API validates the `EndSessionRequest` and creates a URL
     * @param request
     */
    private createLogoutUrlQueryString(
        request: CommonEndSessionRequest
    ): string {
        const parameters = new Map<string, string>();

        if (request.postLogoutRedirectUri) {
            RequestParameterBuilder.addPostLogoutRedirectUri(
                parameters,
                request.postLogoutRedirectUri
            );
        }

        if (request.correlationId) {
            RequestParameterBuilder.addCorrelationId(
                parameters,
                request.correlationId
            );
        }

        if (request.idTokenHint) {
            RequestParameterBuilder.addIdTokenHint(
                parameters,
                request.idTokenHint
            );
        }

        if (request.state) {
            RequestParameterBuilder.addState(parameters, request.state);
        }

        if (request.logoutHint) {
            RequestParameterBuilder.addLogoutHint(
                parameters,
                request.logoutHint
            );
        }

        if (request.extraQueryParameters) {
            RequestParameterBuilder.addExtraParameters(
                parameters,
                request.extraQueryParameters
            );
        }

        if (this.config.authOptions.instanceAware) {
            RequestParameterBuilder.addInstanceAware(parameters);
        }

        return UrlUtils.mapToQueryString(parameters);
    }

    /**
     * Updates the authority to the cloud instance provided in the authorization response
     * @param cloudInstanceHostName - cloud instance host name from authorization code payload
     * @param correlationId - request correlation id
     */
    private async updateTokenEndpointAuthority(
        cloudInstanceHostName: string,
        correlationId: string
    ): Promise<void> {
        const cloudInstanceAuthorityUri = `https://${cloudInstanceHostName}/${this.authority.tenant}/`;
        const cloudInstanceAuthority = await createDiscoveredInstance(
            cloudInstanceAuthorityUri,
            this.networkClient,
            this.cacheManager,
            this.authority.options,
            this.logger,
            correlationId,
            this.performanceClient
        );
        this.authority = cloudInstanceAuthority;
    }
}
