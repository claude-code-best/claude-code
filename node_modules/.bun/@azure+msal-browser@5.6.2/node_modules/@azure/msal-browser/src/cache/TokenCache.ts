/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    AccessTokenEntity,
    ICrypto,
    IdTokenEntity,
    Logger,
    ScopeSet,
    Authority,
    AuthorityFactory,
    AuthorityOptions,
    ExternalTokenResponse,
    AccountEntity,
    AuthToken,
    RefreshTokenEntity,
    CacheRecord,
    TokenClaims,
    CacheHelpers,
    buildAccountToCache,
    TimeUtils,
    AccountEntityUtils,
    buildStaticAuthorityOptions,
    invokeAsync,
    IPerformanceClient,
    StubPerformanceClient,
} from "@azure/msal-common/browser";
import { buildConfiguration, Configuration } from "../config/Configuration.js";
import type { SilentRequest } from "../request/SilentRequest.js";
import { BrowserCacheManager } from "./BrowserCacheManager.js";
import {
    createBrowserAuthError,
    BrowserAuthErrorCodes,
} from "../error/BrowserAuthError.js";
import type { AuthenticationResult } from "../response/AuthenticationResult.js";
import { base64Decode } from "../encode/Base64Decode.js";
import * as BrowserCrypto from "../crypto/BrowserCrypto.js";
import { CryptoOps } from "../crypto/CryptoOps.js";
import { EventHandler } from "../event/EventHandler.js";
import * as BrowserUtils from "../utils/BrowserUtils.js";
import * as BrowserRootPerformanceEvents from "../telemetry/BrowserRootPerformanceEvents.js";
import * as BrowserPerformanceEvents from "../telemetry/BrowserPerformanceEvents.js";
import { ApiId } from "../utils/BrowserConstants.js";

export type LoadTokenOptions = {
    clientInfo?: string;
    expiresOn?: number;
    extendedExpiresOn?: number;
};

/**
 * API to load tokens to msal-browser cache.
 * @param config - Object to configure the MSAL app.
 * @param request - Silent request containing authority, scopes, and account.
 * @param response - External token response to load into the cache.
 * @param options - Options controlling how tokens are loaded into the cache.
 * @param performanceClient - Optional performance client used for telemetry measurements.
 * @returns `AuthenticationResult` for the response that was loaded.
 */
export async function loadExternalTokens(
    config: Configuration,
    request: SilentRequest,
    response: ExternalTokenResponse,
    options: LoadTokenOptions,
    performanceClient: IPerformanceClient = new StubPerformanceClient()
): Promise<AuthenticationResult> {
    BrowserUtils.blockNonBrowserEnvironment();

    const browserConfig = buildConfiguration(config, true);

    const correlationId =
        request.correlationId || BrowserCrypto.createNewGuid();

    const rootMeasurement = performanceClient.startMeasurement(
        BrowserRootPerformanceEvents.LoadExternalTokens,
        correlationId
    );

    try {
        const idTokenClaims = response.id_token
            ? AuthToken.extractTokenClaims(response.id_token, base64Decode)
            : undefined;
        const kmsi = AuthToken.isKmsi(idTokenClaims || {});

        const authorityOptions: AuthorityOptions = {
            protocolMode: browserConfig.system.protocolMode,
            knownAuthorities: browserConfig.auth.knownAuthorities,
            cloudDiscoveryMetadata: browserConfig.auth.cloudDiscoveryMetadata,
            authorityMetadata: browserConfig.auth.authorityMetadata,
        };

        const logger = new Logger(browserConfig.system.loggerOptions || {});
        const cryptoOps = new CryptoOps(logger, browserConfig.telemetry.client);
        const storage = new BrowserCacheManager(
            browserConfig.auth.clientId,
            browserConfig.cache,
            cryptoOps,
            logger,
            browserConfig.telemetry.client,
            new EventHandler(logger),
            buildStaticAuthorityOptions(browserConfig.auth)
        );

        const authorityString =
            request.authority || browserConfig.auth.authority;
        const authority = await AuthorityFactory.createDiscoveredInstance(
            Authority.generateAuthority(
                authorityString,
                request.azureCloudOptions
            ),
            browserConfig.system.networkClient,
            storage,
            authorityOptions,
            logger,
            correlationId,
            performanceClient
        );

        const cacheRecordAccount: AccountEntity = await invokeAsync(
            loadAccount,
            BrowserPerformanceEvents.LoadAccount,
            logger,
            performanceClient,
            correlationId
        )(
            request,
            options.clientInfo || response.client_info || "",
            correlationId,
            storage,
            logger,
            cryptoOps,
            authority,
            idTokenClaims
        );

        const idToken = await invokeAsync(
            loadIdToken,
            BrowserPerformanceEvents.LoadIdToken,
            logger,
            performanceClient,
            correlationId
        )(
            response,
            cacheRecordAccount.homeAccountId,
            cacheRecordAccount.environment,
            cacheRecordAccount.realm,
            kmsi,
            correlationId,
            storage,
            logger,
            config.auth.clientId
        );

        const accessToken = await invokeAsync(
            loadAccessToken,
            BrowserPerformanceEvents.LoadAccessToken,
            logger,
            performanceClient,
            correlationId
        )(
            request,
            response,
            cacheRecordAccount.homeAccountId,
            cacheRecordAccount.environment,
            cacheRecordAccount.realm,
            kmsi,
            options,
            correlationId,
            storage,
            logger,
            config.auth.clientId
        );

        const refreshToken = await invokeAsync(
            loadRefreshToken,
            BrowserPerformanceEvents.LoadRefreshToken,
            logger,
            performanceClient,
            correlationId
        )(
            response,
            cacheRecordAccount.homeAccountId,
            cacheRecordAccount.environment,
            kmsi,
            correlationId,
            storage,
            logger,
            config.auth.clientId,
            performanceClient
        );

        rootMeasurement.end(
            { success: true },
            undefined,
            AccountEntityUtils.getAccountInfo(cacheRecordAccount)
        );

        return generateAuthenticationResult(
            request,
            {
                account: cacheRecordAccount,
                idToken,
                accessToken,
                refreshToken,
            },
            authority,
            idTokenClaims
        );
    } catch (error) {
        rootMeasurement.end({ success: false }, error);
        throw error;
    }
}

/**
 * Helper function to load account to msal-browser cache
 * @param idToken
 * @param environment
 * @param clientInfo
 * @param authorityType
 * @param requestHomeAccountId
 * @returns `AccountEntity`
 */
async function loadAccount(
    request: SilentRequest,
    clientInfo: string,
    correlationId: string,
    storage: BrowserCacheManager,
    logger: Logger,
    cryptoObj: ICrypto,
    authority: Authority,
    idTokenClaims?: TokenClaims
): Promise<AccountEntity> {
    logger.verbose("TokenCache - loading account", correlationId);

    if (request.account) {
        const accountEntity =
            AccountEntityUtils.createAccountEntityFromAccountInfo(
                request.account
            );
        await storage.setAccount(
            accountEntity,
            correlationId,
            AuthToken.isKmsi(idTokenClaims || {}),
            ApiId.loadExternalTokens
        );
        return accountEntity;
    } else if (!clientInfo && !idTokenClaims) {
        logger.error(
            "TokenCache - if an account is not provided on the request, clientInfo or idToken must be provided instead.",
            correlationId
        );
        throw createBrowserAuthError(BrowserAuthErrorCodes.unableToLoadToken);
    }

    const homeAccountId = AccountEntityUtils.generateHomeAccountId(
        clientInfo,
        authority.authorityType,
        logger,
        cryptoObj,
        correlationId,
        idTokenClaims
    );

    const claimsTenantId = idTokenClaims?.tid;

    const cachedAccount = buildAccountToCache(
        storage,
        authority,
        homeAccountId,
        base64Decode,
        correlationId,
        idTokenClaims,
        clientInfo,
        authority.getPreferredCache(),
        claimsTenantId,
        undefined, // authCodePayload
        undefined, // nativeAccountId
        logger
    );

    await storage.setAccount(
        cachedAccount,
        correlationId,
        AuthToken.isKmsi(idTokenClaims || {}),
        ApiId.loadExternalTokens
    );
    return cachedAccount;
}

/**
 * Helper function to load id tokens to msal-browser cache
 * @param idToken
 * @param homeAccountId
 * @param environment
 * @param tenantId
 * @returns `IdTokenEntity`
 */
async function loadIdToken(
    response: ExternalTokenResponse,
    homeAccountId: string,
    environment: string,
    tenantId: string,
    kmsi: boolean,
    correlationId: string,
    storage: BrowserCacheManager,
    logger: Logger,
    clientId: string
): Promise<IdTokenEntity | null> {
    if (!response.id_token) {
        logger.verbose(
            "TokenCache - no id token found in response",
            correlationId
        );
        return null;
    }

    logger.verbose("TokenCache - loading id token", correlationId);
    const idTokenEntity = CacheHelpers.createIdTokenEntity(
        homeAccountId,
        environment,
        response.id_token,
        clientId,
        tenantId
    );

    await storage.setIdTokenCredential(idTokenEntity, correlationId, kmsi);
    return idTokenEntity;
}

/**
 * Helper function to load access tokens to msal-browser cache
 * @param request
 * @param response
 * @param homeAccountId
 * @param environment
 * @param tenantId
 * @returns `AccessTokenEntity`
 */
async function loadAccessToken(
    request: SilentRequest,
    response: ExternalTokenResponse,
    homeAccountId: string,
    environment: string,
    tenantId: string,
    kmsi: boolean,
    options: LoadTokenOptions,
    correlationId: string,
    storage: BrowserCacheManager,
    logger: Logger,
    clientId: string
): Promise<AccessTokenEntity | null> {
    if (!response.access_token) {
        logger.verbose(
            "TokenCache - no access token found in response",
            correlationId
        );
        return null;
    } else if (!response.expires_in) {
        logger.error(
            "TokenCache - no expiration set on the access token. Cannot add it to the cache.",
            correlationId
        );
        return null;
    } else if (!response.scope && (!request.scopes || !request.scopes.length)) {
        logger.error(
            "TokenCache - scopes not specified in the request or response. Cannot add token to the cache.",
            correlationId
        );
        return null;
    }

    logger.verbose("TokenCache - loading access token", correlationId);

    const scopes = response.scope
        ? ScopeSet.fromString(response.scope)
        : new ScopeSet(request.scopes);
    const expiresOn =
        options.expiresOn || response.expires_in + TimeUtils.nowSeconds();

    const extendedExpiresOn =
        options.extendedExpiresOn ||
        (response.ext_expires_in || response.expires_in) +
            TimeUtils.nowSeconds();

    const accessTokenEntity = CacheHelpers.createAccessTokenEntity(
        homeAccountId,
        environment,
        response.access_token,
        clientId,
        tenantId,
        scopes.printScopes(),
        expiresOn,
        extendedExpiresOn,
        base64Decode
    );

    await storage.setAccessTokenCredential(
        accessTokenEntity,
        correlationId,
        kmsi
    );
    return accessTokenEntity;
}

/**
 * Helper function to load refresh tokens to msal-browser cache
 * @param request
 * @param response
 * @param homeAccountId
 * @param environment
 * @returns `RefreshTokenEntity`
 */
async function loadRefreshToken(
    response: ExternalTokenResponse,
    homeAccountId: string,
    environment: string,
    kmsi: boolean,
    correlationId: string,
    storage: BrowserCacheManager,
    logger: Logger,
    clientId: string,
    performanceClient: IPerformanceClient
): Promise<RefreshTokenEntity | null> {
    if (!response.refresh_token) {
        logger.verbose(
            "TokenCache - no refresh token found in response",
            correlationId
        );
        return null;
    }

    const expiresOn = response.refresh_token_expires_in
        ? response.refresh_token_expires_in + TimeUtils.nowSeconds()
        : undefined;
    performanceClient.addFields(
        {
            extRtExpiresOnSeconds: expiresOn,
        },
        correlationId
    );

    logger.verbose("TokenCache - loading refresh token", correlationId);
    const refreshTokenEntity = CacheHelpers.createRefreshTokenEntity(
        homeAccountId,
        environment,
        response.refresh_token,
        clientId,
        response.foci,
        undefined, // userAssertionHash
        expiresOn
    );

    await storage.setRefreshTokenCredential(
        refreshTokenEntity,
        correlationId,
        kmsi
    );
    return refreshTokenEntity;
}

/**
 * Helper function to generate an `AuthenticationResult` for the result.
 * @param request
 * @param idTokenObj
 * @param cacheRecord
 * @param authority
 * @returns `AuthenticationResult`
 */
function generateAuthenticationResult(
    request: SilentRequest,
    cacheRecord: CacheRecord & { account: AccountEntity },
    authority: Authority,
    idTokenClaims?: TokenClaims
): AuthenticationResult {
    let accessToken: string = "";
    let responseScopes: Array<string> = [];
    let expiresOn: Date | null = null;
    let extExpiresOn: Date | undefined;

    if (cacheRecord?.accessToken) {
        accessToken = cacheRecord.accessToken.secret;
        responseScopes = ScopeSet.fromString(
            cacheRecord.accessToken.target
        ).asArray();
        // Access token expiresOn stored in seconds, converting to Date for AuthenticationResult
        expiresOn = TimeUtils.toDateFromSeconds(
            cacheRecord.accessToken.expiresOn
        );
        extExpiresOn = TimeUtils.toDateFromSeconds(
            cacheRecord.accessToken.extendedExpiresOn
        );
    }

    const accountEntity = cacheRecord.account;

    return {
        authority: authority.canonicalAuthority,
        uniqueId: cacheRecord.account.localAccountId,
        tenantId: cacheRecord.account.realm,
        scopes: responseScopes,
        account: AccountEntityUtils.getAccountInfo(accountEntity),
        idToken: cacheRecord.idToken?.secret || "",
        idTokenClaims: idTokenClaims || {},
        accessToken: accessToken,
        fromCache: true,
        expiresOn: expiresOn,
        correlationId: request.correlationId || "",
        requestId: "",
        extExpiresOn: extExpiresOn,
        familyId: cacheRecord.refreshToken?.familyId || "",
        tokenType: cacheRecord?.accessToken?.tokenType || "",
        state: request.state || "",
        cloudGraphHostName: accountEntity.cloudGraphHostName || "",
        msGraphHost: accountEntity.msGraphHost || "",
        fromPlatformBroker: false,
    };
}
