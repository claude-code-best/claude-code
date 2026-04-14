/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    CommonAuthorizationUrlRequest,
    PerformanceCallbackFunction,
    AccountInfo,
    Logger,
    ICrypto,
    IPerformanceClient,
    DEFAULT_CRYPTO_IMPLEMENTATION,
    TimeUtils,
    buildStaticAuthorityOptions,
    Constants,
    BaseAuthRequest,
    AccountFilter,
    AuthError,
    AccountEntityUtils,
    AuthToken,
    enforceResourceParameter,
} from "@azure/msal-common/browser";
import * as RootPerformanceEvents from "../telemetry/BrowserRootPerformanceEvents.js";
import { BrowserConfiguration } from "../config/Configuration.js";
import { INavigationClient } from "../navigation/INavigationClient.js";
import { AuthorizationCodeRequest } from "../request/AuthorizationCodeRequest.js";
import { EndSessionPopupRequest } from "../request/EndSessionPopupRequest.js";
import { EndSessionRequest } from "../request/EndSessionRequest.js";
import { PopupRequest } from "../request/PopupRequest.js";
import { RedirectRequest } from "../request/RedirectRequest.js";
import { SilentRequest } from "../request/SilentRequest.js";
import { SsoSilentRequest } from "../request/SsoSilentRequest.js";
import {
    WrapperSKU,
    InteractionType,
    DEFAULT_REQUEST,
    CacheLookupPolicy,
    ApiId,
} from "../utils/BrowserConstants.js";
import { IController } from "./IController.js";
import { NestedAppOperatingContext } from "../operatingcontext/NestedAppOperatingContext.js";
import { IBridgeProxy } from "../naa/IBridgeProxy.js";
import { CryptoOps } from "../crypto/CryptoOps.js";
import { NestedAppAuthAdapter } from "../naa/mapping/NestedAppAuthAdapter.js";
import { NestedAppAuthError } from "../error/NestedAppAuthError.js";
import { EventHandler } from "../event/EventHandler.js";
import { EventType } from "../event/EventType.js";
import { EventCallbackFunction, EventError } from "../event/EventMessage.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import {
    BrowserCacheManager,
    DEFAULT_BROWSER_CACHE_MANAGER,
} from "../cache/BrowserCacheManager.js";
import { ClearCacheRequest } from "../request/ClearCacheRequest.js";
import * as AccountManager from "../cache/AccountManager.js";
import { AccountContext } from "../naa/BridgeAccountContext.js";
import { InitializeApplicationRequest } from "../request/InitializeApplicationRequest.js";
import { createNewGuid } from "../crypto/BrowserCrypto.js";
import { HandleRedirectPromiseOptions } from "../request/HandleRedirectPromiseOptions.js";

export class NestedAppAuthController implements IController {
    // OperatingContext
    protected readonly operatingContext: NestedAppOperatingContext;

    // BridgeProxy
    protected readonly bridgeProxy: IBridgeProxy;

    // Crypto interface implementation
    protected readonly browserCrypto: ICrypto;

    // Input configuration by developer/user
    protected readonly config: BrowserConfiguration;

    // Storage interface implementation
    protected readonly browserStorage!: BrowserCacheManager;

    // Logger
    protected logger: Logger;

    // Performance telemetry client
    protected readonly performanceClient: IPerformanceClient;

    // EventHandler
    protected readonly eventHandler: EventHandler;

    // NestedAppAuthAdapter
    protected readonly nestedAppAuthAdapter: NestedAppAuthAdapter;

    // currentAccount for NAA apps
    protected currentAccountContext: AccountContext | null;

    constructor(operatingContext: NestedAppOperatingContext) {
        this.operatingContext = operatingContext;
        const proxy = this.operatingContext.getBridgeProxy();
        if (proxy !== undefined) {
            this.bridgeProxy = proxy;
        } else {
            throw new Error("unexpected: bridgeProxy is undefined");
        }

        // Set the configuration.
        this.config = operatingContext.getConfig();

        // Initialize logger
        this.logger = this.operatingContext.getLogger();

        // Initialize performance client
        this.performanceClient = this.config.telemetry.client;

        // Initialize the crypto class.
        this.browserCrypto = operatingContext.isBrowserEnvironment()
            ? new CryptoOps(this.logger, this.performanceClient, true)
            : DEFAULT_CRYPTO_IMPLEMENTATION;

        this.eventHandler = new EventHandler(this.logger);
        // Initialize the browser storage class.
        this.browserStorage = this.operatingContext.isBrowserEnvironment()
            ? new BrowserCacheManager(
                  this.config.auth.clientId,
                  this.config.cache,
                  this.browserCrypto,
                  this.logger,
                  this.performanceClient,
                  this.eventHandler,
                  buildStaticAuthorityOptions(this.config.auth)
              )
            : DEFAULT_BROWSER_CACHE_MANAGER(
                  this.config.auth.clientId,
                  this.logger,
                  this.performanceClient,
                  this.eventHandler
              );

        this.nestedAppAuthAdapter = new NestedAppAuthAdapter(
            this.config.auth.clientId,
            this.config.auth.clientCapabilities,
            this.browserCrypto,
            this.logger
        );

        // Set the active account if available
        const accountContext = this.bridgeProxy.getAccountContext();
        this.currentAccountContext = accountContext ? accountContext : null;
    }

    /**
     * Factory function to create a new instance of NestedAppAuthController
     * @param operatingContext
     * @returns Promise<IController>
     */
    static async createController(
        operatingContext: NestedAppOperatingContext
    ): Promise<IController> {
        const controller = new NestedAppAuthController(operatingContext);
        return Promise.resolve(controller);
    }

    /**
     * Specific implementation of initialize function for NestedAppAuthController
     * @returns
     */
    async initialize(
        request?: InitializeApplicationRequest,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        isBroker?: boolean
    ): Promise<void> {
        const initCorrelationId = request?.correlationId || createNewGuid();
        await this.browserStorage.initialize(initCorrelationId);
        return Promise.resolve();
    }

    /**
     * Validate the incoming request and add correlationId if not present
     * @param request
     * @returns
     */
    private ensureValidRequest<
        T extends
            | SsoSilentRequest
            | SilentRequest
            | PopupRequest
            | RedirectRequest
    >(request: T): T {
        if (request?.correlationId) {
            return request;
        }
        return {
            ...request,
            correlationId: this.browserCrypto.createNewGuid(),
        };
    }

    /**
     * Internal implementation of acquireTokenInteractive flow
     * @param request
     * @returns
     */
    private async acquireTokenInteractive(
        request: PopupRequest | RedirectRequest
    ): Promise<AuthenticationResult> {
        const validRequest = this.ensureValidRequest(request);
        const correlationId = validRequest.correlationId || createNewGuid();

        this.eventHandler.emitEvent(
            EventType.ACQUIRE_TOKEN_START,
            correlationId,
            InteractionType.Popup,
            validRequest
        );

        const atPopupMeasurement = this.performanceClient.startMeasurement(
            RootPerformanceEvents.AcquireTokenPopup,
            correlationId
        );

        atPopupMeasurement.add({ nestedAppAuthRequest: true });

        try {
            enforceResourceParameter(this.config.auth.isMcp, validRequest);
            const naaRequest =
                this.nestedAppAuthAdapter.toNaaTokenRequest(validRequest);
            const reqTimestamp = TimeUtils.nowSeconds();
            const response = await this.bridgeProxy.getTokenInteractive(
                naaRequest
            );
            const result: AuthenticationResult = {
                ...this.nestedAppAuthAdapter.fromNaaTokenResponse(
                    naaRequest,
                    response,
                    reqTimestamp
                ),
            };

            // cache the tokens in the response
            try {
                // cache hydration can fail in JS Runtime scenario that doesn't support full crypto API
                await this.hydrateCache(result, request);
            } catch (error) {
                this.logger.warningPii(
                    `Failed to hydrate cache. Error: ${error}`,
                    correlationId
                );
            }

            // cache the account context in memory after successful token fetch
            this.currentAccountContext = {
                homeAccountId: result.account.homeAccountId,
                environment: result.account.environment,
                tenantId: result.account.tenantId,
            };

            this.eventHandler.emitEvent(
                EventType.ACQUIRE_TOKEN_SUCCESS,
                correlationId,
                InteractionType.Popup,
                result
            );

            atPopupMeasurement.add({
                accessTokenSize: result.accessToken.length,
                idTokenSize: result.idToken.length,
            });

            atPopupMeasurement.end(
                {
                    success: true,
                    requestId: result.requestId,
                },
                undefined,
                result.account
            );

            return result;
        } catch (e) {
            const error =
                e instanceof AuthError
                    ? e
                    : this.nestedAppAuthAdapter.fromBridgeError(e);
            this.eventHandler.emitEvent(
                EventType.ACQUIRE_TOKEN_FAILURE,
                correlationId,
                InteractionType.Popup,
                null,
                e as EventError
            );

            atPopupMeasurement.end(
                {
                    success: false,
                },
                e,
                request.account
            );

            throw error;
        }
    }

    /**
     * Internal implementation of acquireTokenSilent flow
     * @param request
     * @returns
     */
    private async acquireTokenSilentInternal(
        request: SilentRequest
    ): Promise<AuthenticationResult> {
        const validRequest = this.ensureValidRequest(request);
        const correlationId = validRequest.correlationId || createNewGuid();
        this.eventHandler.emitEvent(
            EventType.ACQUIRE_TOKEN_START,
            correlationId,
            InteractionType.Silent,
            validRequest
        );

        // Look for tokens in the cache first
        const result = await this.acquireTokenFromCache(validRequest);
        if (result) {
            this.eventHandler.emitEvent(
                EventType.ACQUIRE_TOKEN_SUCCESS,
                correlationId,
                InteractionType.Silent,
                result
            );
            return result;
        }

        // proceed with acquiring tokens via the host
        const ssoSilentMeasurement = this.performanceClient.startMeasurement(
            RootPerformanceEvents.SsoSilent,
            correlationId
        );

        ssoSilentMeasurement.increment({
            visibilityChangeCount: 0,
        });
        ssoSilentMeasurement.add({
            nestedAppAuthRequest: true,
        });

        try {
            enforceResourceParameter(this.config.auth.isMcp, validRequest);
            const naaRequest =
                this.nestedAppAuthAdapter.toNaaTokenRequest(validRequest);
            naaRequest.forceRefresh = validRequest.forceRefresh;
            const reqTimestamp = TimeUtils.nowSeconds();
            const response = await this.bridgeProxy.getTokenSilent(naaRequest);

            const result: AuthenticationResult =
                this.nestedAppAuthAdapter.fromNaaTokenResponse(
                    naaRequest,
                    response,
                    reqTimestamp
                );

            // cache the tokens in the response
            try {
                // cache hydration can fail in JS Runtime scenario that doesn't support full crypto API
                await this.hydrateCache(result, request);
            } catch (error) {
                this.logger.warningPii(
                    `Failed to hydrate cache. Error: ${error}`,
                    correlationId
                );
            }

            // cache the account context in memory after successful token fetch
            this.currentAccountContext = {
                homeAccountId: result.account.homeAccountId,
                environment: result.account.environment,
                tenantId: result.account.tenantId,
            };

            this.eventHandler.emitEvent(
                EventType.ACQUIRE_TOKEN_SUCCESS,
                correlationId,
                InteractionType.Silent,
                result
            );
            ssoSilentMeasurement?.add({
                accessTokenSize: result.accessToken.length,
                idTokenSize: result.idToken.length,
            });
            ssoSilentMeasurement?.end(
                {
                    success: true,
                    requestId: result.requestId,
                },
                undefined,
                result.account
            );
            return result;
        } catch (e) {
            const error =
                e instanceof AuthError
                    ? e
                    : this.nestedAppAuthAdapter.fromBridgeError(e);
            this.eventHandler.emitEvent(
                EventType.ACQUIRE_TOKEN_FAILURE,
                correlationId,
                InteractionType.Silent,
                null,
                e as EventError
            );
            ssoSilentMeasurement?.end(
                {
                    success: false,
                },
                e,
                request.account
            );
            throw error;
        }
    }

    /**
     * acquires tokens from cache
     * @param request
     * @returns
     */
    private async acquireTokenFromCache(
        request: SilentRequest
    ): Promise<AuthenticationResult | null> {
        const correlationId = request.correlationId || createNewGuid();
        const atsMeasurement = this.performanceClient.startMeasurement(
            RootPerformanceEvents.AcquireTokenSilent,
            correlationId
        );

        atsMeasurement?.add({
            nestedAppAuthRequest: true,
        });

        // if the request has claims, we cannot look up in the cache
        if (request.claims) {
            this.logger.verbose(
                "Claims are present in the request, skipping cache lookup",
                correlationId
            );
            return null;
        }

        // if the request has forceRefresh, we cannot look up in the cache
        if (request.forceRefresh) {
            this.logger.verbose(
                "forceRefresh is set to true, skipping cache lookup",
                correlationId
            );
            return null;
        }

        // respect cache lookup policy
        let result: AuthenticationResult | null = null;
        if (!request.cacheLookupPolicy) {
            request.cacheLookupPolicy = CacheLookupPolicy.Default;
        }

        switch (request.cacheLookupPolicy) {
            case CacheLookupPolicy.Default:
            case CacheLookupPolicy.AccessToken:
            case CacheLookupPolicy.AccessTokenAndRefreshToken:
                result = await this.acquireTokenFromCacheInternal(request);
                break;
            default:
                return null;
        }

        if (result) {
            this.eventHandler.emitEvent(
                EventType.ACQUIRE_TOKEN_SUCCESS,
                correlationId,
                InteractionType.Silent,
                result
            );
            atsMeasurement.add({
                accessTokenSize: result.accessToken.length,
                idTokenSize: result.idToken.length,
            });
            atsMeasurement.end(
                {
                    success: true,
                },
                undefined,
                result.account
            );
            return result;
        }

        this.logger.warning(
            "Cached tokens are not found for the account, proceeding with silent token request.",
            correlationId
        );

        this.eventHandler.emitEvent(
            EventType.ACQUIRE_TOKEN_FAILURE,
            correlationId,
            InteractionType.Silent,
            null
        );
        atsMeasurement.end(
            {
                success: false,
            },
            undefined,
            request.account
        );

        return null;
    }

    /**
     *
     * @param request
     * @returns
     */
    private async acquireTokenFromCacheInternal(
        request: SilentRequest
    ): Promise<AuthenticationResult | null> {
        // always prioritize the account context from the bridge
        const accountContext =
            this.bridgeProxy.getAccountContext() || this.currentAccountContext;
        const correlationId = request.correlationId || createNewGuid();
        let currentAccount: AccountInfo | null = null;
        if (accountContext) {
            currentAccount = AccountManager.getAccount(
                accountContext,
                this.logger,
                this.browserStorage,
                correlationId
            );
        }

        // fall back to brokering if no cached account is found
        if (!currentAccount) {
            this.logger.verbose(
                "No active account found, falling back to the host",
                correlationId
            );
            return Promise.resolve(null);
        }

        this.logger.verbose(
            "active account found, attempting to acquire token silently",
            correlationId
        );

        const authRequest: BaseAuthRequest = {
            ...request,
            correlationId: correlationId,
            authority: request.authority || currentAccount.environment,
            scopes: request.scopes?.length
                ? request.scopes
                : [...Constants.OIDC_DEFAULT_SCOPES],
        };

        // fetch access token and check for expiry
        const tokenKeys = this.browserStorage.getTokenKeys();
        const cachedAccessToken = this.browserStorage.getAccessToken(
            currentAccount,
            authRequest,
            tokenKeys,
            currentAccount.tenantId
        );

        // If there is no access token, log it and return null
        if (!cachedAccessToken) {
            this.logger.verbose("No cached access token found", correlationId);
            return Promise.resolve(null);
        } else if (
            TimeUtils.wasClockTurnedBack(cachedAccessToken.cachedAt) ||
            TimeUtils.isTokenExpired(
                cachedAccessToken.expiresOn,
                this.config.system.tokenRenewalOffsetSeconds
            )
        ) {
            this.logger.verbose(
                "Cached access token has expired",
                correlationId
            );
            return Promise.resolve(null);
        } else if (authRequest.resource) {
            const requestedResource = authRequest.resource;
            const cachedResource = cachedAccessToken.resource;

            if (!cachedResource || cachedResource !== requestedResource) {
                this.logger.verbose(
                    "Cached access token resource does not match requested resource for MCP flow",
                    correlationId
                );
                return Promise.resolve(null);
            }
        }

        const cachedIdToken = this.browserStorage.getIdToken(
            currentAccount,
            authRequest.correlationId,
            tokenKeys,
            currentAccount.tenantId
        );

        if (!cachedIdToken) {
            this.logger.verbose("No cached id token found", correlationId);
            return Promise.resolve(null);
        }

        return this.nestedAppAuthAdapter.toAuthenticationResultFromCache(
            currentAccount,
            cachedIdToken,
            cachedAccessToken,
            authRequest,
            authRequest.correlationId
        );
    }

    /**
     * acquireTokenPopup flow implementation
     * @param request
     * @returns
     */
    async acquireTokenPopup(
        request: PopupRequest
    ): Promise<AuthenticationResult> {
        return this.acquireTokenInteractive(request);
    }

    /**
     * acquireTokenRedirect flow is not supported in nested app auth
     * @param request
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    acquireTokenRedirect(request: RedirectRequest): Promise<void> {
        throw NestedAppAuthError.createUnsupportedError();
    }

    /**
     * acquireTokenSilent flow implementation
     * @param silentRequest
     * @returns
     */
    async acquireTokenSilent(
        silentRequest: SilentRequest
    ): Promise<AuthenticationResult> {
        return this.acquireTokenSilentInternal(silentRequest);
    }

    /**
     * Hybrid flow is not currently supported in nested app auth
     * @param request
     */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    acquireTokenByCode(
        request: AuthorizationCodeRequest // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<AuthenticationResult> {
        throw NestedAppAuthError.createUnsupportedError();
    }

    /**
     * Adds event callbacks to array
     * @param callback
     * @param eventTypes
     */
    addEventCallback(
        callback: EventCallbackFunction,
        eventTypes?: Array<EventType>
    ): string | null {
        return this.eventHandler.addEventCallback(callback, eventTypes);
    }

    /**
     * Removes callback with provided id from callback array
     * @param callbackId
     */
    removeEventCallback(callbackId: string): void {
        this.eventHandler.removeEventCallback(callbackId);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    addPerformanceCallback(callback: PerformanceCallbackFunction): string {
        throw NestedAppAuthError.createUnsupportedError();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    removePerformanceCallback(callbackId: string): boolean {
        throw NestedAppAuthError.createUnsupportedError();
    }

    // #region Account APIs

    /**
     * Returns all the accounts in the cache that match the optional filter. If no filter is provided, all accounts are returned.
     * @param accountFilter - (Optional) filter to narrow down the accounts returned
     * @returns Array of AccountInfo objects in cache
     */
    getAllAccounts(accountFilter?: AccountFilter): AccountInfo[] {
        return AccountManager.getAllAccounts(
            this.logger,
            this.browserStorage,
            this.isBrowserEnv(),
            createNewGuid(),
            accountFilter
        );
    }

    /**
     * Returns the first account found in the cache that matches the account filter passed in.
     * @param accountFilter
     * @returns The first account found in the cache matching the provided filter or null if no account could be found.
     */
    getAccount(accountFilter: AccountFilter): AccountInfo | null {
        return AccountManager.getAccount(
            accountFilter,
            this.logger,
            this.browserStorage,
            createNewGuid()
        );
    }

    /**
     * Sets the account to use as the active account. If no account is passed to the acquireToken APIs, then MSAL will use this active account.
     * @param account
     */
    setActiveAccount(account: AccountInfo | null): void {
        /*
         * StandardController uses this to allow the developer to set the active account
         * in the nested app auth scenario the active account is controlled by the app hosting the nested app
         */
        return AccountManager.setActiveAccount(
            account,
            this.browserStorage,
            createNewGuid()
        );
    }

    /**
     * Gets the currently active account
     */
    getActiveAccount(): AccountInfo | null {
        return AccountManager.getActiveAccount(
            this.browserStorage,
            createNewGuid()
        );
    }

    // #endregion

    handleRedirectPromise(
        options?: HandleRedirectPromiseOptions // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<AuthenticationResult | null> {
        return Promise.resolve(null);
    }
    loginPopup(
        request?: PopupRequest | undefined // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<AuthenticationResult> {
        return this.acquireTokenInteractive(request || DEFAULT_REQUEST);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    loginRedirect(request?: RedirectRequest | undefined): Promise<void> {
        throw NestedAppAuthError.createUnsupportedError();
    }
    logoutRedirect(
        logoutRequest?: EndSessionRequest | undefined // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<void> {
        throw NestedAppAuthError.createUnsupportedError();
    }
    logoutPopup(
        logoutRequest?: EndSessionPopupRequest | undefined // eslint-disable-line @typescript-eslint/no-unused-vars
    ): Promise<void> {
        throw NestedAppAuthError.createUnsupportedError();
    }
    ssoSilent(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        request: Partial<
            Omit<
                CommonAuthorizationUrlRequest,
                | "responseMode"
                | "earJwk"
                | "codeChallenge"
                | "codeChallengeMethod"
                | "platformBroker"
            >
        >
    ): Promise<AuthenticationResult> {
        return this.acquireTokenSilentInternal(request as SilentRequest);
    }

    /**
     * Returns the logger instance
     */
    public getLogger(): Logger {
        return this.logger;
    }

    /**
     * Replaces the default logger set in configurations with new Logger with new configurations
     * @param logger Logger instance
     */
    setLogger(logger: Logger): void {
        this.logger = logger;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    initializeWrapperLibrary(sku: WrapperSKU, version: string): void {
        /*
         * Standard controller uses this to set the sku and version of the wrapper library in the storage
         * we do nothing here
         */
        return;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    setNavigationClient(navigationClient: INavigationClient): void {
        this.logger.warning(
            "setNavigationClient is not supported in nested app auth",
            ""
        );
    }

    getConfiguration(): BrowserConfiguration {
        return this.config;
    }

    isBrowserEnv(): boolean {
        return this.operatingContext.isBrowserEnvironment();
    }

    getBrowserCrypto(): ICrypto {
        return this.browserCrypto;
    }

    getPerformanceClient(): IPerformanceClient {
        throw NestedAppAuthError.createUnsupportedError();
    }

    getRedirectResponse(): Map<string, Promise<AuthenticationResult | null>> {
        throw NestedAppAuthError.createUnsupportedError();
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async clearCache(logoutRequest?: ClearCacheRequest): Promise<void> {
        throw NestedAppAuthError.createUnsupportedError();
    }

    async hydrateCache(
        result: AuthenticationResult,
        request:
            | SilentRequest
            | SsoSilentRequest
            | RedirectRequest
            | PopupRequest
    ): Promise<void> {
        this.logger.verbose("hydrateCache called", result.correlationId);

        const accountEntity =
            AccountEntityUtils.createAccountEntityFromAccountInfo(
                result.account,
                result.cloudGraphHostName,
                result.msGraphHost
            );
        await this.browserStorage.setAccount(
            accountEntity,
            result.correlationId,
            AuthToken.isKmsi(result.idTokenClaims),
            ApiId.hydrateCache
        );
        return this.browserStorage.hydrateCache(result, request);
    }
}
