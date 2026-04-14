/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICrypto,
    Logger,
    CommonAuthorizationCodeRequest,
    AuthError,
    IPerformanceClient,
    PerformanceEvents,
    invokeAsync,
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
import { InteractionType, ApiId } from "../utils/BrowserConstants.js";
import { AuthorizationCodeRequest } from "../request/AuthorizationCodeRequest.js";
import { HybridSpaAuthorizationCodeClient } from "./HybridSpaAuthorizationCodeClient.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import { InteractionHandler } from "../interaction_handler/InteractionHandler.js";
import { IPlatformAuthHandler } from "../broker/nativeBroker/IPlatformAuthHandler.js";
import { initializeServerTelemetryManager } from "./BaseInteractionClient.js";

export class SilentAuthCodeClient extends StandardInteractionClient {
    private apiId: ApiId;

    constructor(
        config: BrowserConfiguration,
        storageImpl: BrowserCacheManager,
        browserCrypto: ICrypto,
        logger: Logger,
        eventHandler: EventHandler,
        navigationClient: INavigationClient,
        apiId: ApiId,
        performanceClient: IPerformanceClient,
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
    }

    /**
     * Acquires a token silently by redeeming an authorization code against the /token endpoint
     * @param request
     */
    async acquireToken(
        request: AuthorizationCodeRequest
    ): Promise<AuthenticationResult> {
        // Auth code payload is required
        if (!request.code) {
            throw createBrowserAuthError(
                BrowserAuthErrorCodes.authCodeRequired
            );
        }

        // Create silent request
        const silentRequest: CommonAuthorizationUrlRequest = await invokeAsync(
            initializeAuthorizationRequest,
            BrowserPerformanceEvents.StandardInteractionClientInitializeAuthorizationRequest,
            this.logger,
            this.performanceClient,
            this.correlationId
        )(
            request,
            InteractionType.Silent,
            this.config,
            this.browserCrypto,
            this.browserStorage,
            this.logger,
            this.performanceClient,
            /*
             * correlationId is optional in request payload, while this.correlationId is always instantiated as request.correlationId || createGuid().
             * Each auth request creates a new instance of *Client so we can safely use this.correlationId.
             */
            this.correlationId
        );

        const serverTelemetryManager = initializeServerTelemetryManager(
            this.apiId,
            this.config.auth.clientId,
            this.correlationId,
            this.browserStorage,
            this.logger
        );

        try {
            // Create auth code request (PKCE not needed)
            const authCodeRequest: CommonAuthorizationCodeRequest = {
                ...silentRequest,
                code: request.code,
            };

            // Initialize the client
            const clientConfig = await invokeAsync(
                this.getClientConfiguration.bind(this),
                BrowserPerformanceEvents.StandardInteractionClientGetClientConfiguration,
                this.logger,
                this.performanceClient,
                this.correlationId
            )({
                serverTelemetryManager,
                requestAuthority: silentRequest.authority,
                requestAzureCloudOptions: silentRequest.azureCloudOptions,
                requestExtraQueryParameters: silentRequest.extraQueryParameters,
                account: silentRequest.account,
            });
            const authClient: HybridSpaAuthorizationCodeClient =
                new HybridSpaAuthorizationCodeClient(
                    clientConfig,
                    this.performanceClient
                );
            this.logger.verbose("Auth code client created", this.correlationId);

            // Create silent handler
            const interactionHandler = new InteractionHandler(
                authClient,
                this.browserStorage,
                authCodeRequest,
                this.logger,
                this.performanceClient
            );

            // Handle auth code parameters from request
            return await invokeAsync(
                interactionHandler.handleCodeResponseFromServer.bind(
                    interactionHandler
                ),
                PerformanceEvents.HandleCodeResponseFromServer,
                this.logger,
                this.performanceClient,
                this.correlationId
            )(
                {
                    code: request.code,
                    msgraph_host: request.msGraphHost,
                    cloud_graph_host_name: request.cloudGraphHostName,
                    cloud_instance_host_name: request.cloudInstanceHostName,
                },
                silentRequest,
                this.apiId,
                false
            );
        } catch (e) {
            if (e instanceof AuthError) {
                (e as AuthError).setCorrelationId(this.correlationId);
                serverTelemetryManager.cacheFailedRequest(e);
            }
            throw e;
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
}
