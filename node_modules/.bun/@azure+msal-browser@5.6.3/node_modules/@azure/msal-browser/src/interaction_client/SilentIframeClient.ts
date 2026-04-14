/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICrypto,
    Logger,
    Constants,
    AuthorizationCodeClient,
    AuthError,
    IPerformanceClient,
    PerformanceEvents,
    invokeAsync,
    invoke,
    ProtocolMode,
    CommonAuthorizationUrlRequest,
} from "@azure/msal-common/browser";
import {
    initializeAuthorizationRequest,
    StandardInteractionClient,
} from "./StandardInteractionClient.js";
import * as BrowserPerformanceEvents from "../telemetry/BrowserPerformanceEvents.js";
import { BrowserConfiguration } from "../config/Configuration.js";
import { BrowserCacheManager } from "../cache/BrowserCacheManager.js";
import { EventHandler } from "../event/EventHandler.js";
import { INavigationClient } from "../navigation/INavigationClient.js";
import {
    createBrowserAuthError,
    BrowserAuthErrorCodes,
} from "../error/BrowserAuthError.js";
import {
    InteractionType,
    ApiId,
    BrowserConstants,
} from "../utils/BrowserConstants.js";
import {
    initiateCodeRequest,
    initiateCodeFlowWithPost,
    initiateEarRequest,
    removeHiddenIframe,
} from "../interaction_handler/SilentHandler.js";
import { SsoSilentRequest } from "../request/SsoSilentRequest.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import * as BrowserUtils from "../utils/BrowserUtils.js";
import * as ResponseHandler from "../response/ResponseHandler.js";
import * as Authorize from "../protocol/Authorize.js";
import { generatePkceCodes } from "../crypto/PkceGenerator.js";
import { isPlatformAuthAllowed } from "../broker/nativeBroker/PlatformAuthProvider.js";
import { generateEarKey } from "../crypto/BrowserCrypto.js";
import { IPlatformAuthHandler } from "../broker/nativeBroker/IPlatformAuthHandler.js";
import {
    getDiscoveredAuthority,
    initializeServerTelemetryManager,
} from "./BaseInteractionClient.js";

export class SilentIframeClient extends StandardInteractionClient {
    protected apiId: ApiId;
    protected nativeStorage: BrowserCacheManager;

    constructor(
        config: BrowserConfiguration,
        storageImpl: BrowserCacheManager,
        browserCrypto: ICrypto,
        logger: Logger,
        eventHandler: EventHandler,
        navigationClient: INavigationClient,
        apiId: ApiId,
        performanceClient: IPerformanceClient,
        nativeStorageImpl: BrowserCacheManager,
        correlationId: string,
        platformAuthProvider?: IPlatformAuthHandler
    ) {
        super(
            config,
            storageImpl,
            browserCrypto,
            logger,
            eventHandler,
            navigationClient,
            performanceClient,
            correlationId,
            platformAuthProvider
        );
        this.apiId = apiId;
        this.nativeStorage = nativeStorageImpl;
    }

    /**
     * Acquires a token silently by opening a hidden iframe to the /authorize endpoint with prompt=none or prompt=no_session
     * @param request
     */
    async acquireToken(
        request: SsoSilentRequest
    ): Promise<AuthenticationResult> {
        // Check that we have some SSO data
        if (
            !request.loginHint &&
            !request.sid &&
            (!request.account || !request.account.username)
        ) {
            this.logger.warning(
                "No user hint provided. The authorization server may need more information to complete this request.",
                this.correlationId
            );
        }

        // Check the prompt value
        const inputRequest = { ...request };
        if (inputRequest.prompt) {
            if (
                inputRequest.prompt !== Constants.PromptValue.NONE &&
                inputRequest.prompt !== Constants.PromptValue.NO_SESSION
            ) {
                this.logger.warning(
                    `SilentIframeClient. Replacing invalid prompt '${inputRequest.prompt}' with '${Constants.PromptValue.NONE}'`,
                    this.correlationId
                );
                inputRequest.prompt = Constants.PromptValue.NONE;
            }
        } else {
            inputRequest.prompt = Constants.PromptValue.NONE;
        }

        // Create silent request
        const silentRequest: CommonAuthorizationUrlRequest = await invokeAsync(
            initializeAuthorizationRequest,
            BrowserPerformanceEvents.StandardInteractionClientInitializeAuthorizationRequest,
            this.logger,
            this.performanceClient,
            this.correlationId
        )(
            inputRequest,
            InteractionType.Silent,
            this.config,
            this.browserCrypto,
            this.browserStorage,
            this.logger,
            this.performanceClient,
            this.correlationId
        );
        silentRequest.platformBroker = isPlatformAuthAllowed(
            this.config,
            this.logger,
            this.correlationId,
            this.platformAuthProvider,
            silentRequest.authenticationScheme
        );
        BrowserUtils.preconnect(silentRequest.authority);

        if (this.config.system.protocolMode === ProtocolMode.EAR) {
            return this.executeEarFlow(silentRequest);
        } else {
            return this.executeCodeFlow(silentRequest);
        }
    }

    /**
     * Executes auth code + PKCE flow
     * @param request
     * @returns
     */
    async executeCodeFlow(
        request: CommonAuthorizationUrlRequest
    ): Promise<AuthenticationResult> {
        let authClient: AuthorizationCodeClient | undefined;
        const serverTelemetryManager = initializeServerTelemetryManager(
            this.apiId,
            this.config.auth.clientId,
            this.correlationId,
            this.browserStorage,
            this.logger
        );

        try {
            // Initialize the client
            authClient = await invokeAsync(
                this.createAuthCodeClient.bind(this),
                BrowserPerformanceEvents.StandardInteractionClientCreateAuthCodeClient,
                this.logger,
                this.performanceClient,
                request.correlationId
            )({
                serverTelemetryManager,
                requestAuthority: request.authority,
                requestAzureCloudOptions: request.azureCloudOptions,
                requestExtraQueryParameters: request.extraQueryParameters,
                account: request.account,
            });

            return await invokeAsync(
                this.silentTokenHelper.bind(this),
                BrowserPerformanceEvents.SilentIframeClientTokenHelper,
                this.logger,
                this.performanceClient,
                request.correlationId
            )(authClient, request);
        } catch (e) {
            if (e instanceof AuthError) {
                (e as AuthError).setCorrelationId(this.correlationId);
                serverTelemetryManager.cacheFailedRequest(e);
            }

            if (
                !authClient ||
                !(e instanceof AuthError) ||
                e.errorCode !== BrowserConstants.INVALID_GRANT_ERROR
            ) {
                throw e;
            }

            this.performanceClient.addFields(
                {
                    retryError: e.errorCode,
                },
                this.correlationId
            );

            return await invokeAsync(
                this.silentTokenHelper.bind(this),
                BrowserPerformanceEvents.SilentIframeClientTokenHelper,
                this.logger,
                this.performanceClient,
                this.correlationId
            )(authClient, request);
        }
    }

    /**
     * Executes EAR flow
     * @param request
     */
    async executeEarFlow(
        request: CommonAuthorizationUrlRequest
    ): Promise<AuthenticationResult> {
        const {
            correlationId,
            authority,
            azureCloudOptions,
            extraQueryParameters,
            account,
        } = request;
        const discoveredAuthority = await invokeAsync(
            getDiscoveredAuthority,
            BrowserPerformanceEvents.StandardInteractionClientGetDiscoveredAuthority,
            this.logger,
            this.performanceClient,
            correlationId
        )(
            this.config,
            this.correlationId,
            this.performanceClient,
            this.browserStorage,
            this.logger,
            authority,
            azureCloudOptions,
            extraQueryParameters,
            account
        );

        const earJwk = await invokeAsync(
            generateEarKey,
            BrowserPerformanceEvents.GenerateEarKey,
            this.logger,
            this.performanceClient,
            correlationId
        )();
        const pkceCodes = await invokeAsync(
            generatePkceCodes,
            BrowserPerformanceEvents.GeneratePkceCodes,
            this.logger,
            this.performanceClient,
            correlationId
        )(this.performanceClient, this.logger, correlationId);
        const silentRequest = {
            ...request,
            earJwk: earJwk,
            codeChallenge: pkceCodes.challenge,
        };
        const iframe = await invokeAsync(
            initiateEarRequest,
            BrowserPerformanceEvents.SilentHandlerInitiateAuthRequest,
            this.logger,
            this.performanceClient,
            correlationId
        )(
            this.config,
            discoveredAuthority,
            silentRequest,
            this.logger,
            this.performanceClient
        );

        const responseType = this.config.auth.OIDCOptions.responseMode;
        let responseString: string;
        try {
            responseString = await invokeAsync(
                BrowserUtils.waitForBridgeResponse,
                BrowserPerformanceEvents.SilentHandlerMonitorIframeForHash,
                this.logger,
                this.performanceClient,
                correlationId
            )(
                this.config.system.iframeBridgeTimeout,
                this.logger,
                this.browserCrypto,
                request,
                this.performanceClient,
                this.config.experimental
            );
        } finally {
            invoke(
                removeHiddenIframe,
                BrowserPerformanceEvents.RemoveHiddenIframe,
                this.logger,
                this.performanceClient,
                correlationId
            )(iframe);
        }

        const serverParams = invoke(
            ResponseHandler.deserializeResponse,
            BrowserPerformanceEvents.DeserializeResponse,
            this.logger,
            this.performanceClient,
            correlationId
        )(responseString, responseType, this.logger, this.correlationId);

        if (!serverParams.ear_jwe && serverParams.code) {
            // If server doesn't support EAR, they may fallback to auth code flow instead
            const authClient = await invokeAsync(
                this.createAuthCodeClient.bind(this),
                BrowserPerformanceEvents.StandardInteractionClientCreateAuthCodeClient,
                this.logger,
                this.performanceClient,
                correlationId
            )({
                serverTelemetryManager: initializeServerTelemetryManager(
                    this.apiId,
                    this.config.auth.clientId,
                    correlationId,
                    this.browserStorage,
                    this.logger
                ),
                requestAuthority: request.authority,
                requestAzureCloudOptions: request.azureCloudOptions,
                requestExtraQueryParameters: request.extraQueryParameters,
                account: request.account,
                authority: discoveredAuthority,
            });

            return invokeAsync(
                Authorize.handleResponseCode,
                BrowserPerformanceEvents.HandleResponseCode,
                this.logger,
                this.performanceClient,
                correlationId
            )(
                silentRequest,
                serverParams,
                pkceCodes.verifier,
                this.apiId,
                this.config,
                authClient,
                this.browserStorage,
                this.nativeStorage,
                this.eventHandler,
                this.logger,
                this.performanceClient,
                this.platformAuthProvider
            );
        } else {
            return invokeAsync(
                Authorize.handleResponseEAR,
                BrowserPerformanceEvents.HandleResponseEar,
                this.logger,
                this.performanceClient,
                correlationId
            )(
                silentRequest,
                serverParams,
                this.apiId,
                this.config,
                discoveredAuthority,
                this.browserStorage,
                this.nativeStorage,
                this.eventHandler,
                this.logger,
                this.performanceClient,
                this.platformAuthProvider
            );
        }
    }

    /**
     * Currently Unsupported
     */
    logout(): Promise<void> {
        // Synchronous so we must reject
        return Promise.reject(
            createBrowserAuthError(
                BrowserAuthErrorCodes.silentLogoutUnsupported
            )
        );
    }

    /**
     * Helper which acquires an authorization code silently using a hidden iframe from given url
     * using the scopes requested as part of the id, and exchanges the code for a set of OAuth tokens.
     * @param navigateUrl
     * @param userRequestScopes
     */
    protected async silentTokenHelper(
        authClient: AuthorizationCodeClient,
        request: CommonAuthorizationUrlRequest
    ): Promise<AuthenticationResult> {
        const correlationId = request.correlationId;
        const pkceCodes = await invokeAsync(
            generatePkceCodes,
            BrowserPerformanceEvents.GeneratePkceCodes,
            this.logger,
            this.performanceClient,
            correlationId
        )(this.performanceClient, this.logger, correlationId);

        const silentRequest = {
            ...request,
            codeChallenge: pkceCodes.challenge,
        };

        let iframe: HTMLIFrameElement;
        if (request.httpMethod === Constants.HttpMethod.POST) {
            iframe = await invokeAsync(
                initiateCodeFlowWithPost,
                BrowserPerformanceEvents.SilentHandlerInitiateAuthRequest,
                this.logger,
                this.performanceClient,
                correlationId
            )(
                this.config,
                authClient.authority,
                silentRequest,
                this.logger,
                this.performanceClient
            );
        } else {
            // Create authorize request url
            const navigateUrl = await invokeAsync(
                Authorize.getAuthCodeRequestUrl,
                PerformanceEvents.GetAuthCodeUrl,
                this.logger,
                this.performanceClient,
                correlationId
            )(
                this.config,
                authClient.authority,
                silentRequest,
                this.logger,
                this.performanceClient
            );

            // Get the frame handle for the silent request
            iframe = await invokeAsync(
                initiateCodeRequest,
                BrowserPerformanceEvents.SilentHandlerInitiateAuthRequest,
                this.logger,
                this.performanceClient,
                correlationId
            )(navigateUrl, this.performanceClient, this.logger, correlationId);
        }

        const responseType = this.config.auth.OIDCOptions.responseMode;
        // Wait for response from the redirect bridge.
        let responseString: string;
        try {
            responseString = await invokeAsync(
                BrowserUtils.waitForBridgeResponse,
                BrowserPerformanceEvents.SilentHandlerMonitorIframeForHash,
                this.logger,
                this.performanceClient,
                correlationId
            )(
                this.config.system.iframeBridgeTimeout,
                this.logger,
                this.browserCrypto,
                request,
                this.performanceClient,
                this.config.experimental
            );
        } finally {
            invoke(
                removeHiddenIframe,
                BrowserPerformanceEvents.RemoveHiddenIframe,
                this.logger,
                this.performanceClient,
                correlationId
            )(iframe);
        }

        const serverParams = invoke(
            ResponseHandler.deserializeResponse,
            BrowserPerformanceEvents.DeserializeResponse,
            this.logger,
            this.performanceClient,
            correlationId
        )(responseString, responseType, this.logger, this.correlationId);

        return invokeAsync(
            Authorize.handleResponseCode,
            BrowserPerformanceEvents.HandleResponseCode,
            this.logger,
            this.performanceClient,
            correlationId
        )(
            request,
            serverParams,
            pkceCodes.verifier,
            this.apiId,
            this.config,
            authClient,
            this.browserStorage,
            this.nativeStorage,
            this.eventHandler,
            this.logger,
            this.performanceClient,
            this.platformAuthProvider
        );
    }
}
