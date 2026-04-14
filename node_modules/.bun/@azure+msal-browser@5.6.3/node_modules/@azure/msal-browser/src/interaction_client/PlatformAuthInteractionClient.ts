/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    AADServerParamKeys,
    AccessTokenEntity,
    AccountEntity,
    AccountEntityUtils,
    AccountInfo,
    AuthError,
    AuthToken,
    AuthorityType,
    CacheHelpers,
    ClientAuthErrorCodes,
    CommonSilentFlowRequest,
    Constants,
    ICrypto,
    IPerformanceClient,
    IdTokenEntity,
    InProgressPerformanceEvent,
    Logger,
    PerformanceEvents,
    PopTokenGenerator,
    ScopeSet,
    ServerTelemetryManager,
    SignedHttpRequestParameters,
    TimeUtils,
    TokenClaims,
    UrlString,
    buildAccountToCache,
    createClientAuthError,
    invokeAsync,
    updateAccountTenantProfileData,
} from "@azure/msal-common/browser";
import { IPlatformAuthHandler } from "../broker/nativeBroker/IPlatformAuthHandler.js";
import { PlatformAuthRequest } from "../broker/nativeBroker/PlatformAuthRequest.js";
import {
    MATS,
    PlatformAuthResponse,
} from "../broker/nativeBroker/PlatformAuthResponse.js";
import { BrowserCacheManager } from "../cache/BrowserCacheManager.js";
import { BrowserConfiguration } from "../config/Configuration.js";
import { base64Decode } from "../encode/Base64Decode.js";
import {
    BrowserAuthErrorCodes,
    createBrowserAuthError,
} from "../error/BrowserAuthError.js";
import {
    NativeAuthError,
    NativeAuthErrorCodes,
    createNativeAuthError,
    isFatalNativeAuthError,
} from "../error/NativeAuthError.js";
import { EventHandler } from "../event/EventHandler.js";
import { INavigationClient } from "../navigation/INavigationClient.js";
import { NavigationOptions } from "../navigation/NavigationOptions.js";
import { version } from "../packageMetadata.js";
import { HandleRedirectPromiseOptions } from "../request/HandleRedirectPromiseOptions.js";
import { PopupRequest } from "../request/PopupRequest.js";
import { RedirectRequest } from "../request/RedirectRequest.js";
import { SilentRequest } from "../request/SilentRequest.js";
import { SsoSilentRequest } from "../request/SsoSilentRequest.js";
import { AuthenticationResult } from "../response/AuthenticationResult.js";
import * as BrowserPerformanceEvents from "../telemetry/BrowserPerformanceEvents.js";
import {
    ApiId,
    BrowserConstants,
    CacheLookupPolicy,
    PlatformAuthConstants,
    TemporaryCacheKeys,
} from "../utils/BrowserConstants.js";
import {
    BaseInteractionClient,
    getDiscoveredAuthority,
    getRedirectUri,
    initializeServerTelemetryManager,
} from "./BaseInteractionClient.js";
import { SilentCacheClient } from "./SilentCacheClient.js";

export class PlatformAuthInteractionClient extends BaseInteractionClient {
    protected apiId: ApiId;
    protected accountId: string;
    protected platformAuthProvider: IPlatformAuthHandler;
    protected silentCacheClient: SilentCacheClient;
    protected nativeStorageManager: BrowserCacheManager;
    protected skus: string;

    constructor(
        config: BrowserConfiguration,
        browserStorage: BrowserCacheManager,
        browserCrypto: ICrypto,
        logger: Logger,
        eventHandler: EventHandler,
        navigationClient: INavigationClient,
        apiId: ApiId,
        performanceClient: IPerformanceClient,
        provider: IPlatformAuthHandler,
        accountId: string,
        nativeStorageImpl: BrowserCacheManager,
        correlationId: string
    ) {
        super(
            config,
            browserStorage,
            browserCrypto,
            logger,
            eventHandler,
            navigationClient,
            performanceClient,
            correlationId,
            provider
        );
        this.apiId = apiId;
        this.accountId = accountId;
        this.platformAuthProvider = provider;
        this.nativeStorageManager = nativeStorageImpl;
        this.silentCacheClient = new SilentCacheClient(
            config,
            this.nativeStorageManager,
            browserCrypto,
            logger,
            eventHandler,
            navigationClient,
            performanceClient,
            correlationId,
            provider
        );

        const extensionName = this.platformAuthProvider.getExtensionName();

        this.skus = ServerTelemetryManager.makeExtraSkuString({
            libraryName: BrowserConstants.MSAL_SKU,
            libraryVersion: version,
            extensionName: extensionName,
            extensionVersion: this.platformAuthProvider.getExtensionVersion(),
        });
    }

    /**
     * Adds SKUs to request extra query parameters
     * @param request {PlatformAuthRequest}
     * @private
     */
    private addRequestSKUs(request: PlatformAuthRequest): void {
        request.extraParameters = {
            ...request.extraParameters,
            [AADServerParamKeys.X_CLIENT_EXTRA_SKU]: this.skus,
        };
    }

    /**
     * Acquire token from native platform via browser extension
     * @param request
     */
    async acquireToken(
        request: PopupRequest | SilentRequest | SsoSilentRequest,
        cacheLookupPolicy?: CacheLookupPolicy
    ): Promise<AuthenticationResult> {
        this.logger.trace(
            "NativeInteractionClient - acquireToken called.",
            this.correlationId
        );

        // start the perf measurement
        const nativeATMeasurement = this.performanceClient.startMeasurement(
            BrowserPerformanceEvents.NativeInteractionClientAcquireToken,
            request.correlationId
        );
        const reqTimestamp = TimeUtils.nowSeconds();

        const serverTelemetryManager = initializeServerTelemetryManager(
            this.apiId,
            this.config.auth.clientId,
            this.correlationId,
            this.browserStorage,
            this.logger
        );

        try {
            // initialize native request
            const nativeRequest = await this.initializeNativeRequest(request);

            // check if the tokens can be retrieved from internal cache
            try {
                const result = await this.acquireTokensFromCache(
                    this.accountId,
                    nativeRequest
                );
                nativeATMeasurement.end({
                    success: true,
                    isNativeBroker: false, // Should be true only when the result is coming directly from the broker
                    fromCache: true,
                });
                return result;
            } catch (e) {
                if (cacheLookupPolicy === CacheLookupPolicy.AccessToken) {
                    this.logger.info(
                        "MSAL internal Cache does not contain tokens, return error as per cache policy",
                        this.correlationId
                    );
                    throw e;
                }
                // continue with a native call for any and all errors
                this.logger.info(
                    "MSAL internal Cache does not contain tokens, proceed to make a native call",
                    this.correlationId
                );
            }

            const validatedResponse: PlatformAuthResponse =
                await this.platformAuthProvider.sendMessage(nativeRequest);

            return await this.handleNativeResponse(
                validatedResponse,
                nativeRequest,
                reqTimestamp
            )
                .then((result: AuthenticationResult) => {
                    nativeATMeasurement.end({
                        success: true,
                        isNativeBroker: true,
                        requestId: result.requestId,
                    });
                    serverTelemetryManager.clearNativeBrokerErrorCode();
                    return result;
                })
                .catch((error: AuthError) => {
                    nativeATMeasurement.end({
                        success: false,
                        errorCode: error.errorCode,
                        subErrorCode: error.subError,
                        isNativeBroker: true,
                    });
                    throw error;
                });
        } catch (e) {
            if (e instanceof NativeAuthError) {
                serverTelemetryManager.setNativeBrokerErrorCode(e.errorCode);
            }
            throw e;
        }
    }

    /**
     * Creates silent flow request
     * @param request
     * @param cachedAccount
     * @returns CommonSilentFlowRequest
     */
    private createSilentCacheRequest(
        request: PlatformAuthRequest,
        cachedAccount: AccountInfo
    ): CommonSilentFlowRequest {
        return {
            authority: request.authority,
            correlationId: this.correlationId,
            scopes: ScopeSet.fromString(request.scope).asArray(),
            account: cachedAccount,
            forceRefresh: false,
        };
    }

    /**
     * Fetches the tokens from the cache if un-expired
     * @param nativeAccountId
     * @param request
     * @returns authenticationResult
     */
    protected async acquireTokensFromCache(
        nativeAccountId: string,
        request: PlatformAuthRequest
    ): Promise<AuthenticationResult> {
        if (!nativeAccountId) {
            this.logger.warning(
                "NativeInteractionClient:acquireTokensFromCache - No nativeAccountId provided",
                this.correlationId
            );
            throw createClientAuthError(ClientAuthErrorCodes.noAccountFound);
        }
        // fetch the account from browser cache
        const account = this.browserStorage.getBaseAccountInfo(
            {
                nativeAccountId,
            },
            request.correlationId
        );

        if (!account) {
            throw createClientAuthError(ClientAuthErrorCodes.noAccountFound);
        }

        // leverage silent flow for cached tokens retrieval
        try {
            const silentRequest = this.createSilentCacheRequest(
                request,
                account
            );
            const result = await this.silentCacheClient.acquireToken(
                silentRequest
            );

            const fullAccount = {
                ...account,
                idTokenClaims: result?.idTokenClaims as TokenClaims,
                idToken: result?.idToken,
            };

            return {
                ...result,
                account: fullAccount,
            };
        } catch (e) {
            throw e;
        }
    }

    /**
     * Acquires a token from native platform then redirects to the redirectUri instead of returning the response
     * @param {RedirectRequest} request
     * @param {InProgressPerformanceEvent} rootMeasurement
     * @param {HandleRedirectPromiseOptions} options
     */
    async acquireTokenRedirect(
        request: RedirectRequest,
        rootMeasurement: InProgressPerformanceEvent,
        options?: HandleRedirectPromiseOptions
    ): Promise<void> {
        this.logger.trace(
            "NativeInteractionClient - acquireTokenRedirect called.",
            this.correlationId
        );

        const nativeRequest = await this.initializeNativeRequest(request);
        const navigateToLoginRequestUrl =
            options?.navigateToLoginRequestUrl ?? true;

        try {
            await this.platformAuthProvider.sendMessage(nativeRequest);
        } catch (e) {
            // Only throw fatal errors here to allow application to fallback to regular redirect. Otherwise proceed and the error will be thrown in handleRedirectPromise
            if (e instanceof NativeAuthError) {
                const serverTelemetryManager = initializeServerTelemetryManager(
                    this.apiId,
                    this.config.auth.clientId,
                    this.correlationId,
                    this.browserStorage,
                    this.logger
                );
                serverTelemetryManager.setNativeBrokerErrorCode(e.errorCode);
                if (isFatalNativeAuthError(e)) {
                    throw e;
                }
            }
        }
        this.browserStorage.setTemporaryCache(
            TemporaryCacheKeys.NATIVE_REQUEST,
            JSON.stringify(nativeRequest),
            true
        );

        const navigationOptions: NavigationOptions = {
            apiId: ApiId.acquireTokenRedirect,
            timeout: this.config.system.redirectNavigationTimeout,
            noHistory: false,
        };
        const redirectUri = navigateToLoginRequestUrl
            ? window.location.href
            : getRedirectUri(
                  request.redirectUri,
                  this.config.auth.redirectUri,
                  this.logger,
                  this.correlationId
              );
        rootMeasurement.end({ success: true });
        await this.navigationClient.navigateExternal(
            redirectUri,
            navigationOptions
        ); // Need to treat this as external to ensure handleRedirectPromise is run again
    }

    /**
     * If the previous page called native platform for a token using redirect APIs, send the same request again and return the response
     * @param performanceClient {IPerformanceClient?}
     * @param correlationId {string?} correlation identifier
     */
    async handleRedirectPromise(
        performanceClient?: IPerformanceClient,
        correlationId?: string
    ): Promise<AuthenticationResult | null> {
        this.logger.trace(
            "NativeInteractionClient - handleRedirectPromise called.",
            this.correlationId
        );
        if (!this.browserStorage.isInteractionInProgress(true)) {
            this.logger.info(
                "handleRedirectPromise called but there is no interaction in progress, returning null.",
                this.correlationId
            );
            return null;
        }

        // remove prompt from the request to prevent WAM from prompting twice
        const cachedRequest = this.browserStorage.getCachedNativeRequest();
        if (!cachedRequest) {
            this.logger.verbose(
                "NativeInteractionClient - handleRedirectPromise called but there is no cached request, returning null.",
                this.correlationId
            );
            if (performanceClient && correlationId) {
                performanceClient?.addFields(
                    { errorCode: "no_cached_request" },
                    correlationId
                );
            }
            return null;
        }

        const { prompt, ...request } = cachedRequest;
        if (prompt) {
            this.logger.verbose(
                "NativeInteractionClient - handleRedirectPromise called and prompt was included in the original request, removing prompt from cached request to prevent second interaction with native broker window.",
                this.correlationId
            );
        }

        this.browserStorage.removeItem(
            this.browserStorage.generateCacheKey(
                TemporaryCacheKeys.NATIVE_REQUEST
            )
        );

        const reqTimestamp = TimeUtils.nowSeconds();

        try {
            this.logger.verbose(
                "NativeInteractionClient - handleRedirectPromise sending message to native broker.",
                this.correlationId
            );
            const response: PlatformAuthResponse =
                await this.platformAuthProvider.sendMessage(request);
            const authResult = await this.handleNativeResponse(
                response,
                request,
                reqTimestamp
            );

            const serverTelemetryManager = initializeServerTelemetryManager(
                this.apiId,
                this.config.auth.clientId,
                this.correlationId,
                this.browserStorage,
                this.logger
            );
            serverTelemetryManager.clearNativeBrokerErrorCode();
            return authResult;
        } catch (e) {
            throw e;
        }
    }

    /**
     * Logout from native platform via browser extension
     * @param request
     */
    logout(): Promise<void> {
        this.logger.trace(
            "NativeInteractionClient - logout called.",
            this.correlationId
        );
        return Promise.reject("Logout not implemented yet");
    }

    /**
     * Transform response from native platform into AuthenticationResult object which will be returned to the end user
     * @param response
     * @param request
     * @param reqTimestamp
     */
    protected async handleNativeResponse(
        response: PlatformAuthResponse,
        request: PlatformAuthRequest,
        reqTimestamp: number
    ): Promise<AuthenticationResult> {
        this.logger.trace(
            "NativeInteractionClient - handleNativeResponse called.",
            this.correlationId
        );

        // generate identifiers
        const idTokenClaims = AuthToken.extractTokenClaims(
            response.id_token,
            base64Decode
        );

        const homeAccountIdentifier = this.createHomeAccountIdentifier(
            response,
            idTokenClaims
        );

        const cachedhomeAccountId =
            this.browserStorage.getAccountInfoFilteredBy(
                {
                    nativeAccountId: request.accountId,
                },
                this.correlationId
            )?.homeAccountId;

        // add exception for double brokering, please note this is temporary and will be fortified in future
        if (
            request.extraParameters?.child_client_id &&
            response.account.id !== request.accountId
        ) {
            this.logger.info(
                "handleNativeServerResponse: Double broker flow detected, ignoring accountId mismatch",
                this.correlationId
            );
        } else if (
            homeAccountIdentifier !== cachedhomeAccountId &&
            response.account.id !== request.accountId
        ) {
            // User switch in native broker prompt is not supported. All users must first sign in through web flow to ensure server state is in sync
            throw createNativeAuthError(NativeAuthErrorCodes.userSwitch);
        }

        // Get the preferred_cache domain for the given authority
        const authority = await getDiscoveredAuthority(
            this.config,
            this.correlationId,
            this.performanceClient,
            this.browserStorage,
            this.logger,
            request.authority
        );

        const baseAccount = buildAccountToCache(
            this.browserStorage,
            authority,
            homeAccountIdentifier,
            base64Decode,
            this.correlationId,
            idTokenClaims,
            response.client_info,
            authority.getPreferredCache(), // environment
            idTokenClaims.tid,
            undefined, // auth code payload
            response.account.id,
            this.logger,
            this.performanceClient
        );

        // Ensure expires_in is in number format
        response.expires_in = Number(response.expires_in);

        // generate authenticationResult
        const result = await this.generateAuthenticationResult(
            response,
            request,
            idTokenClaims,
            baseAccount,
            authority.canonicalAuthority,
            reqTimestamp
        );

        // cache accounts and tokens in the appropriate storage
        await this.cacheAccount(baseAccount, AuthToken.isKmsi(idTokenClaims));
        await this.cacheNativeTokens(
            response,
            request,
            homeAccountIdentifier,
            idTokenClaims,
            response.access_token,
            result.tenantId,
            reqTimestamp
        );

        return result;
    }

    /**
     * creates an homeAccountIdentifier for the account
     * @param response
     * @param idTokenObj
     * @returns
     */
    protected createHomeAccountIdentifier(
        response: PlatformAuthResponse,
        idTokenClaims: TokenClaims
    ): string {
        // Save account in browser storage
        const homeAccountIdentifier = AccountEntityUtils.generateHomeAccountId(
            response.client_info || "",
            AuthorityType.Default,
            this.logger,
            this.browserCrypto,
            this.correlationId,
            idTokenClaims
        );

        return homeAccountIdentifier;
    }

    /**
     * Helper to generate scopes
     * @param response
     * @param request
     * @returns
     */
    generateScopes(requestScopes: string, responseScopes?: string): ScopeSet {
        return responseScopes
            ? ScopeSet.fromString(responseScopes)
            : ScopeSet.fromString(requestScopes);
    }

    /**
     * If PoP token is requesred, records the PoP token if returned from the WAM, else generates one in the browser
     * @param request
     * @param response
     */
    async generatePopAccessToken(
        response: PlatformAuthResponse,
        request: PlatformAuthRequest
    ): Promise<string> {
        if (
            request.tokenType === Constants.AuthenticationScheme.POP &&
            request.signPopToken
        ) {
            /**
             * This code prioritizes SHR returned from the native layer. In case of error/SHR not calculated from WAM and the AT
             * is still received, SHR is calculated locally
             */

            // Check if native layer returned an SHR token
            if (response.shr) {
                this.logger.trace(
                    "handleNativeServerResponse: SHR is enabled in native layer",
                    this.correlationId
                );
                return response.shr;
            }

            // Generate SHR in msal js if WAM does not compute it when POP is enabled
            const popTokenGenerator: PopTokenGenerator = new PopTokenGenerator(
                this.browserCrypto,
                this.performanceClient
            );
            const shrParameters: SignedHttpRequestParameters = {
                resourceRequestMethod: request.resourceRequestMethod,
                resourceRequestUri: request.resourceRequestUri,
                shrClaims: request.shrClaims,
                shrNonce: request.shrNonce,
                correlationId: this.correlationId,
            };

            /**
             * KeyID must be present in the native request from when the PoP key was generated in order for
             * PopTokenGenerator to query the full key for signing
             */
            if (!request.keyId) {
                throw createClientAuthError(ClientAuthErrorCodes.keyIdMissing);
            }
            return popTokenGenerator.signPopToken(
                response.access_token,
                request.keyId,
                shrParameters
            );
        } else {
            return response.access_token;
        }
    }

    /**
     * Generates authentication result
     * @param response
     * @param request
     * @param idTokenObj
     * @param accountEntity
     * @param authority
     * @param reqTimestamp
     * @returns
     */
    protected async generateAuthenticationResult(
        response: PlatformAuthResponse,
        request: PlatformAuthRequest,
        idTokenClaims: TokenClaims,
        accountEntity: AccountEntity,
        authority: string,
        reqTimestamp: number
    ): Promise<AuthenticationResult> {
        // Add Native Broker fields to Telemetry
        const mats = this.addTelemetryFromNativeResponse(
            response.properties.MATS
        );

        // If scopes not returned in server response, use request scopes
        const responseScopes = this.generateScopes(
            request.scope,
            response.scope
        );

        const accountProperties = response.account.properties || {};
        const uid =
            accountProperties["UID"] ||
            idTokenClaims.oid ||
            idTokenClaims.sub ||
            "";
        const tid = accountProperties["TenantId"] || idTokenClaims.tid || "";

        const accountInfo: AccountInfo | null = updateAccountTenantProfileData(
            AccountEntityUtils.getAccountInfo(accountEntity),
            undefined, // tenantProfile optional
            idTokenClaims,
            response.id_token
        );

        /**
         * In pairwise broker flows, this check prevents the broker's native account id
         * from being returned over the embedded app's account id.
         */
        if (accountInfo.nativeAccountId !== response.account.id) {
            accountInfo.nativeAccountId = response.account.id;
        }

        // generate PoP token as needed
        const responseAccessToken = await this.generatePopAccessToken(
            response,
            request
        );
        const tokenType =
            request.tokenType === Constants.AuthenticationScheme.POP
                ? Constants.AuthenticationScheme.POP
                : Constants.AuthenticationScheme.BEARER;

        const result: AuthenticationResult = {
            authority: authority,
            uniqueId: uid,
            tenantId: tid,
            scopes: responseScopes.asArray(),
            account: accountInfo,
            idToken: response.id_token,
            idTokenClaims: idTokenClaims,
            accessToken: responseAccessToken,
            fromCache: mats ? this.isResponseFromCache(mats) : false,
            // Request timestamp and NativeResponse expires_in are in seconds, converting to Date for AuthenticationResult
            expiresOn: TimeUtils.toDateFromSeconds(
                reqTimestamp + response.expires_in
            ),
            tokenType: tokenType,
            correlationId: this.correlationId,
            state: response.state,
            fromPlatformBroker: true,
            ...(request.resource && { resource: request.resource }),
        };

        return result;
    }

    /**
     * cache the account entity in browser storage
     * @param accountEntity
     */
    async cacheAccount(
        accountEntity: AccountEntity,
        kmsi: boolean
    ): Promise<void> {
        // Store the account info and hence `nativeAccountId` in browser cache
        await this.browserStorage.setAccount(
            accountEntity,
            this.correlationId,
            kmsi,
            this.apiId
        );
        // Remove any existing cached tokens for this account in browser storage
        this.browserStorage.removeAccountContext(
            AccountEntityUtils.getAccountInfo(accountEntity),
            this.correlationId
        );
    }

    /**
     * Stores the access_token and id_token in inmemory storage
     * @param response
     * @param request
     * @param homeAccountIdentifier
     * @param idTokenObj
     * @param responseAccessToken
     * @param tenantId
     * @param reqTimestamp
     */
    cacheNativeTokens(
        response: PlatformAuthResponse,
        request: PlatformAuthRequest,
        homeAccountIdentifier: string,
        idTokenClaims: TokenClaims,
        responseAccessToken: string,
        tenantId: string,
        reqTimestamp: number
    ): Promise<void> {
        const cachedIdToken: IdTokenEntity | null =
            CacheHelpers.createIdTokenEntity(
                homeAccountIdentifier,
                request.authority,
                response.id_token || "",
                request.clientId,
                idTokenClaims.tid || ""
            );

        // cache accessToken in inmemory storage
        const expiresIn: number =
            request.tokenType === Constants.AuthenticationScheme.POP
                ? Constants.SHR_NONCE_VALIDITY
                : (typeof response.expires_in === "string"
                      ? parseInt(response.expires_in, 10)
                      : response.expires_in) || 0;
        const tokenExpirationSeconds = reqTimestamp + expiresIn;
        const responseScopes = this.generateScopes(
            response.scope,
            request.scope
        );

        const cachedAccessToken: AccessTokenEntity | null =
            CacheHelpers.createAccessTokenEntity(
                homeAccountIdentifier,
                request.authority,
                responseAccessToken,
                request.clientId,
                idTokenClaims.tid || tenantId,
                responseScopes.printScopes(),
                tokenExpirationSeconds,
                0,
                base64Decode,
                undefined,
                request.tokenType as Constants.AuthenticationScheme,
                undefined,
                request.keyId
            );

        const nativeCacheRecord = {
            idToken: cachedIdToken,
            accessToken: cachedAccessToken,
        };

        return this.nativeStorageManager.saveCacheRecord(
            nativeCacheRecord,
            this.correlationId,
            AuthToken.isKmsi(idTokenClaims),
            this.apiId,
            request.storeInCache
        );
    }

    getExpiresInValue(
        tokenType: string,
        expiresIn: string | number | undefined
    ): number {
        return tokenType === Constants.AuthenticationScheme.POP
            ? Constants.SHR_NONCE_VALIDITY
            : (typeof expiresIn === "string"
                  ? parseInt(expiresIn, 10)
                  : expiresIn) || 0;
    }

    protected addTelemetryFromNativeResponse(
        matsResponse?: string
    ): MATS | null {
        const mats = this.getMATSFromResponse(matsResponse);

        if (!mats) {
            return null;
        }

        this.performanceClient.addFields(
            {
                extensionId: this.platformAuthProvider.getExtensionId(),
                extensionVersion:
                    this.platformAuthProvider.getExtensionVersion(),
                matsBrokerVersion: mats.broker_version,
                matsAccountJoinOnStart: mats.account_join_on_start,
                matsAccountJoinOnEnd: mats.account_join_on_end,
                matsDeviceJoin: mats.device_join,
                matsPromptBehavior: mats.prompt_behavior,
                matsApiErrorCode: mats.api_error_code,
                matsUiVisible: mats.ui_visible,
                matsSilentCode: mats.silent_code,
                matsSilentBiSubCode: mats.silent_bi_sub_code,
                matsSilentMessage: mats.silent_message,
                matsSilentStatus: mats.silent_status,
                matsHttpStatus: mats.http_status,
                matsHttpEventCount: mats.http_event_count,
            },
            this.correlationId
        );

        return mats;
    }

    /**
     * Gets MATS telemetry from native response
     * @param response
     * @returns
     */
    private getMATSFromResponse(matsResponse: string | undefined): MATS | null {
        if (matsResponse) {
            try {
                return JSON.parse(matsResponse);
            } catch (e) {
                this.logger.error(
                    "NativeInteractionClient - Error parsing MATS telemetry, returning null instead",
                    this.correlationId
                );
            }
        }

        return null;
    }

    /**
     * Returns whether or not response came from native cache
     * @param response
     * @returns
     */
    protected isResponseFromCache(mats: MATS): boolean {
        if (typeof mats.is_cached === "undefined") {
            this.logger.verbose(
                "NativeInteractionClient - MATS telemetry does not contain field indicating if response was served from cache. Returning false.",
                this.correlationId
            );
            return false;
        }

        return !!mats.is_cached;
    }

    /**
     * Translates developer provided request object into NativeRequest object
     * @param request
     */
    protected async initializeNativeRequest(
        request: PopupRequest | SsoSilentRequest
    ): Promise<PlatformAuthRequest> {
        this.logger.trace(
            "NativeInteractionClient - initializeNativeRequest called",
            this.correlationId
        );

        const canonicalAuthority = await this.getCanonicalAuthority(request);

        // scopes are expected to be received by the native broker as "scope" and will be added to the request below. Other properties that should be dropped from the request to the native broker can be included in the object destructuring here.
        const { scopes, ...remainingProperties } = request;
        const scopeSet = new ScopeSet(scopes || []);
        scopeSet.appendScopes(Constants.OIDC_DEFAULT_SCOPES);

        const validatedRequest: PlatformAuthRequest = {
            ...remainingProperties,
            accountId: this.accountId,
            clientId: this.config.auth.clientId,
            authority: canonicalAuthority.urlString,
            scope: scopeSet.printScopes(),
            redirectUri: getRedirectUri(
                request.redirectUri,
                this.config.auth.redirectUri,
                this.logger,
                this.correlationId
            ),
            prompt: this.getPrompt(request.prompt),
            correlationId: this.correlationId,
            tokenType: request.authenticationScheme,
            windowTitleSubstring: document.title,
            extraParameters: {
                ...request.extraParameters,
            },
            extendedExpiryToken: false, // Make this configurable?
            keyId: request.popKid,
        };

        // Check for PoP token requests: signPopToken should only be set to true if popKid is not set
        if (validatedRequest.signPopToken && !!request.popKid) {
            throw createBrowserAuthError(
                BrowserAuthErrorCodes.invalidPopTokenRequest
            );
        }

        this.handleExtraBrokerParams(validatedRequest);
        validatedRequest.extraParameters =
            validatedRequest.extraParameters || {};
        validatedRequest.extraParameters.telemetry =
            PlatformAuthConstants.MATS_TELEMETRY;

        if (
            request.authenticationScheme === Constants.AuthenticationScheme.POP
        ) {
            // add POP request type
            const shrParameters: SignedHttpRequestParameters = {
                resourceRequestUri: request.resourceRequestUri,
                resourceRequestMethod: request.resourceRequestMethod,
                shrClaims: request.shrClaims,
                shrNonce: request.shrNonce,
                correlationId: this.correlationId,
            };

            const popTokenGenerator = new PopTokenGenerator(
                this.browserCrypto,
                this.performanceClient
            );

            // generate reqCnf if not provided in the request
            let reqCnfData;
            if (!validatedRequest.keyId) {
                const generatedReqCnfData = await invokeAsync(
                    popTokenGenerator.generateCnf.bind(popTokenGenerator),
                    PerformanceEvents.PopTokenGenerateCnf,
                    this.logger,
                    this.performanceClient,
                    this.correlationId
                )(shrParameters, this.logger);
                reqCnfData = generatedReqCnfData.reqCnfString;
                validatedRequest.keyId = generatedReqCnfData.kid;
                validatedRequest.signPopToken = true;
            } else {
                reqCnfData = this.browserCrypto.base64UrlEncode(
                    JSON.stringify({ kid: validatedRequest.keyId })
                );
                validatedRequest.signPopToken = false;
            }

            // SPAs require whole string to be passed to broker
            validatedRequest.reqCnf = reqCnfData;
        }
        this.addRequestSKUs(validatedRequest);

        return validatedRequest;
    }

    private async getCanonicalAuthority(
        request: PopupRequest | SsoSilentRequest
    ): Promise<UrlString> {
        const requestAuthority =
            request.authority || this.config.auth.authority;

        const { azureCloudOptions, account } = request;

        if (account) {
            // validate authority
            await getDiscoveredAuthority(
                this.config,
                this.correlationId,
                this.performanceClient,
                this.browserStorage,
                this.logger,
                requestAuthority,
                azureCloudOptions,
                undefined, // requestExtraQueryParameters
                account
            );
        }

        const canonicalAuthority = new UrlString(requestAuthority);
        canonicalAuthority.validateAsUri();
        return canonicalAuthority;
    }

    private getPrompt(prompt?: string): string | undefined {
        // If request is silent, prompt is always none
        switch (this.apiId) {
            case ApiId.ssoSilent:
            case ApiId.acquireTokenSilent_silentFlow:
                this.logger.trace(
                    "initializeNativeRequest: silent request sets prompt to none",
                    this.correlationId
                );
                return Constants.PromptValue.NONE;
            default:
                break;
        }

        // Prompt not provided, request may proceed and native broker decides if it needs to prompt
        if (!prompt) {
            this.logger.trace(
                "initializeNativeRequest: prompt was not provided",
                this.correlationId
            );
            return undefined;
        }

        // If request is interactive, check if prompt provided is allowed to go directly to native broker
        switch (prompt) {
            case Constants.PromptValue.NONE:
            case Constants.PromptValue.CONSENT:
            case Constants.PromptValue.LOGIN:
                this.logger.trace(
                    "initializeNativeRequest: prompt is compatible with native flow",
                    this.correlationId
                );
                return prompt;
            default:
                this.logger.trace(
                    `initializeNativeRequest: prompt = '${prompt}' is not compatible with native flow`,
                    this.correlationId
                );
                throw createBrowserAuthError(
                    BrowserAuthErrorCodes.nativePromptNotSupported
                );
        }
    }

    /**
     * Handles extra broker request parameters
     * @param request {PlatformAuthRequest}
     * @private
     */
    private handleExtraBrokerParams(request: PlatformAuthRequest): void {
        const hasExtraBrokerParams =
            request.extraParameters &&
            request.extraParameters.hasOwnProperty(
                AADServerParamKeys.BROKER_CLIENT_ID
            ) &&
            request.extraParameters.hasOwnProperty(
                AADServerParamKeys.BROKER_REDIRECT_URI
            ) &&
            request.extraParameters.hasOwnProperty(
                AADServerParamKeys.CLIENT_ID
            );

        if (!request.embeddedClientId && !hasExtraBrokerParams) {
            return;
        }

        let child_client_id: string = "";
        const child_redirect_uri = request.redirectUri;

        if (request.embeddedClientId) {
            request.redirectUri = this.config.auth.redirectUri;
            child_client_id = request.embeddedClientId;
        } else if (request.extraParameters) {
            request.redirectUri =
                request.extraParameters[AADServerParamKeys.BROKER_REDIRECT_URI];
            child_client_id =
                request.extraParameters[AADServerParamKeys.CLIENT_ID];
        }

        request.extraParameters = {
            child_client_id,
            child_redirect_uri,
        };

        this.performanceClient?.addFields(
            {
                embeddedClientId: child_client_id,
                embeddedRedirectUri: child_redirect_uri,
            },
            request.correlationId
        );
    }
}
