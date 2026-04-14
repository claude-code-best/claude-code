/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ICrypto,
    INetworkModule,
    Logger,
    AccountInfo,
    UrlString,
    ServerTelemetryManager,
    ServerTelemetryRequest,
    createClientConfigurationError,
    ClientConfigurationErrorCodes,
    Authority,
    AuthorityOptions,
    AuthorityFactory,
    IPerformanceClient,
    AzureCloudOptions,
    invokeAsync,
    StringDict,
} from "@azure/msal-common/browser";
import * as BrowserPerformanceEvents from "../telemetry/BrowserPerformanceEvents.js";
import { BrowserConfiguration } from "../config/Configuration.js";
import { BrowserCacheManager } from "../cache/BrowserCacheManager.js";
import { EventHandler } from "../event/EventHandler.js";
import { EndSessionRequest } from "../request/EndSessionRequest.js";
import { RedirectRequest } from "../request/RedirectRequest.js";
import { PopupRequest } from "../request/PopupRequest.js";
import { SsoSilentRequest } from "../request/SsoSilentRequest.js";
import { version } from "../packageMetadata.js";
import { BrowserConstants } from "../utils/BrowserConstants.js";
import * as BrowserUtils from "../utils/BrowserUtils.js";
import { INavigationClient } from "../navigation/INavigationClient.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import { ClearCacheRequest } from "../request/ClearCacheRequest.js";
import { IPlatformAuthHandler } from "../broker/nativeBroker/IPlatformAuthHandler.js";

export abstract class BaseInteractionClient {
    protected config: BrowserConfiguration;
    protected browserStorage: BrowserCacheManager;
    protected browserCrypto: ICrypto;
    protected networkClient: INetworkModule;
    protected logger: Logger;
    protected eventHandler: EventHandler;
    protected navigationClient: INavigationClient;
    protected platformAuthProvider: IPlatformAuthHandler | undefined;
    protected correlationId: string;
    protected performanceClient: IPerformanceClient;

    constructor(
        config: BrowserConfiguration,
        storageImpl: BrowserCacheManager,
        browserCrypto: ICrypto,
        logger: Logger,
        eventHandler: EventHandler,
        navigationClient: INavigationClient,
        performanceClient: IPerformanceClient,
        correlationId: string,
        platformAuthProvider?: IPlatformAuthHandler
    ) {
        this.config = config;
        this.browserStorage = storageImpl;
        this.browserCrypto = browserCrypto;
        this.networkClient = this.config.system.networkClient;
        this.eventHandler = eventHandler;
        this.navigationClient = navigationClient;
        this.platformAuthProvider = platformAuthProvider;
        this.correlationId = correlationId;
        this.logger = logger.clone(BrowserConstants.MSAL_SKU, version);
        this.performanceClient = performanceClient;
    }

    abstract acquireToken(
        request: RedirectRequest | PopupRequest | SsoSilentRequest
    ): Promise<AuthenticationResult | void>;

    abstract logout(
        request: EndSessionRequest | ClearCacheRequest | undefined
    ): Promise<void>;
}

/**
 * Use to get the redirect URI configured in MSAL or construct one from the current page.
 * @param requestRedirectUri - Redirect URI from the request or undefined if not configured
 * @param clientConfigRedirectUri - Redirect URI from the client configuration or undefined if not configured
 * @param logger - Logger instance from the calling client
 * @param correlationId
 * @returns Absolute redirect URL constructed from the provided URI, config, or current page
 */
export function getRedirectUri(
    requestRedirectUri: string | undefined,
    clientConfigRedirectUri: string | undefined,
    logger: Logger,
    correlationId: string
): string {
    logger.verbose("getRedirectUri called", correlationId);
    const redirectUri = requestRedirectUri || clientConfigRedirectUri || "";
    return UrlString.getAbsoluteUrl(redirectUri, BrowserUtils.getCurrentUri());
}

/**
 * Initializes and returns a ServerTelemetryManager with the provided telemetry configuration.
 * @param apiId - The API identifier for telemetry tracking
 * @param clientId - The client application identifier
 * @param correlationId - Unique identifier for correlating requests
 * @param browserStorage - Browser cache manager instance for storing telemetry data
 * @param logger - Optional logger instance for verbose logging
 * @param forceRefresh - Optional flag to force refresh of telemetry data
 * @returns Configured ServerTelemetryManager instance
 */
export function initializeServerTelemetryManager(
    apiId: number,
    clientId: string,
    correlationId: string,
    browserStorage: BrowserCacheManager,
    logger: Logger,
    forceRefresh?: boolean
): ServerTelemetryManager {
    logger.verbose("initializeServerTelemetryManager called", correlationId);
    const telemetryPayload: ServerTelemetryRequest = {
        clientId: clientId,
        correlationId: correlationId,
        apiId: apiId,
        forceRefresh: forceRefresh || false,
        wrapperSKU: browserStorage.getWrapperMetadata()[0],
        wrapperVer: browserStorage.getWrapperMetadata()[1],
    };

    return new ServerTelemetryManager(telemetryPayload, browserStorage);
}

/**
 * Used to get a discovered version of the default authority.
 * @param params - Configuration object containing authority and cloud options
 * @param params.requestAuthority - Optional specific authority URL to use
 * @param params.requestAzureCloudOptions - Optional Azure cloud configuration options
 * @param params.requestExtraQueryParameters - Optional additional query parameters
 * @param params.account - Optional account info for instance-aware scenarios
 * @param config - Browser configuration containing auth settings
 * @param correlationId - Unique identifier for correlating requests
 * @param performanceClient - Performance monitoring client instance
 * @param browserStorage - Browser cache manager instance
 * @param logger - Logger instance for tracking operations
 * @returns Promise that resolves to a discovered Authority instance
 */
export async function getDiscoveredAuthority(
    config: BrowserConfiguration,
    correlationId: string,
    performanceClient: IPerformanceClient,
    browserStorage: BrowserCacheManager,
    logger: Logger,
    requestAuthority?: string,
    requestAzureCloudOptions?: AzureCloudOptions,
    requestExtraQueryParameters?: StringDict,
    account?: AccountInfo
): Promise<Authority> {
    const instanceAwareEQ =
        requestExtraQueryParameters &&
        requestExtraQueryParameters.hasOwnProperty("instance_aware")
            ? requestExtraQueryParameters["instance_aware"]
            : undefined;

    const authorityOptions: AuthorityOptions = {
        protocolMode: config.system.protocolMode,
        OIDCOptions: config.auth.OIDCOptions,
        knownAuthorities: config.auth.knownAuthorities,
        cloudDiscoveryMetadata: config.auth.cloudDiscoveryMetadata,
        authorityMetadata: config.auth.authorityMetadata,
    };

    // build authority string based on auth params, precedence - azureCloudInstance + tenant >> authority
    const resolvedAuthority = requestAuthority || config.auth.authority;
    const resolvedInstanceAware = instanceAwareEQ?.length
        ? instanceAwareEQ === "true"
        : config.auth.instanceAware;

    const userAuthority =
        account && resolvedInstanceAware
            ? config.auth.authority.replace(
                  UrlString.getDomainFromUrl(resolvedAuthority),
                  account.environment
              )
            : resolvedAuthority;

    // fall back to the authority from config
    const builtAuthority = Authority.generateAuthority(
        userAuthority,
        requestAzureCloudOptions || config.auth.azureCloudOptions
    );
    const discoveredAuthority = await invokeAsync(
        AuthorityFactory.createDiscoveredInstance,
        BrowserPerformanceEvents.AuthorityFactoryCreateDiscoveredInstance,
        logger,
        performanceClient,
        correlationId
    )(
        builtAuthority,
        config.system.networkClient,
        browserStorage,
        authorityOptions,
        logger,
        correlationId,
        performanceClient
    );

    if (account && !discoveredAuthority.isAlias(account.environment)) {
        throw createClientConfigurationError(
            ClientConfigurationErrorCodes.authorityMismatch
        );
    }

    return discoveredAuthority;
}

/**
 * Clears cache and account information during logout.
 *
 * If an account is provided, removes the account from cache and, if it is the active account, sets the active account to null.
 * If no account is provided, clears all accounts and tokens from cache.
 *
 * @param browserStorage - The browser cache manager instance used to manage cache.
 * @param browserCrypto - The crypto interface for cache operations.
 * @param logger - Logger instance for logging operations.
 * @param correlationId - Correlation ID for the logout operation.
 * @param account - (Optional) The account to clear from cache. If not provided, all accounts are cleared.
 * @returns A promise that resolves when the cache has been cleared.
 */
export async function clearCacheOnLogout(
    browserStorage: BrowserCacheManager,
    browserCrypto: ICrypto,
    logger: Logger,
    correlationId: string,
    account?: AccountInfo | null
): Promise<void> {
    if (account) {
        // Clear given account.
        try {
            browserStorage.removeAccount(account, correlationId);
            logger.verbose(
                "Cleared cache items belonging to the account provided in the logout request.",
                correlationId
            );
        } catch (error) {
            logger.error(
                "Account provided in logout request was not found. Local cache unchanged.",
                correlationId
            );
        }
    } else {
        try {
            logger.verbose(
                "No account provided in logout request, clearing all cache items.",
                correlationId
            );
            // Clear all accounts and tokens
            browserStorage.clear(correlationId);
            // Clear any stray keys from IndexedDB
            await browserCrypto.clearKeystore(correlationId);
        } catch (e) {
            logger.error(
                "Attempted to clear all MSAL cache items and failed. Local cache unchanged.",
                correlationId
            );
        }
    }
}
