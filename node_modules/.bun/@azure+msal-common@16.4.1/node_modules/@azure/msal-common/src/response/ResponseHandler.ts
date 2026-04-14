/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    AccountInfo,
    buildTenantProfile,
    updateAccountTenantProfileData,
} from "../account/AccountInfo.js";
import {
    checkMaxAge,
    extractTokenClaims,
    isKmsi,
} from "../account/AuthToken.js";
import {
    TokenClaims,
    getTenantIdFromIdTokenClaims,
} from "../account/TokenClaims.js";
import { Authority } from "../authority/Authority.js";
import { CacheManager } from "../cache/CacheManager.js";
import { AccessTokenEntity } from "../cache/entities/AccessTokenEntity.js";
import { AccountEntity } from "../cache/entities/AccountEntity.js";
import { AppMetadataEntity } from "../cache/entities/AppMetadataEntity.js";
import { CacheRecord } from "../cache/entities/CacheRecord.js";
import { IdTokenEntity } from "../cache/entities/IdTokenEntity.js";
import { RefreshTokenEntity } from "../cache/entities/RefreshTokenEntity.js";
import { ICachePlugin } from "../cache/interface/ICachePlugin.js";
import { ISerializableTokenCache } from "../cache/interface/ISerializableTokenCache.js";
import { TokenCacheContext } from "../cache/persistence/TokenCacheContext.js";
import * as AccountEntityUtils from "../cache/utils/AccountEntityUtils.js";
import * as CacheHelpers from "../cache/utils/CacheHelpers.js";
import { ICrypto } from "../crypto/ICrypto.js";
import { PopTokenGenerator } from "../crypto/PopTokenGenerator.js";
import {
    ClientAuthErrorCodes,
    createClientAuthError,
} from "../error/ClientAuthError.js";
import {
    InteractionRequiredAuthError,
    isInteractionRequiredError,
} from "../error/InteractionRequiredAuthError.js";
import { ServerError } from "../error/ServerError.js";
import { Logger } from "../logger/Logger.js";
import { BaseAuthRequest } from "../request/BaseAuthRequest.js";
import { ScopeSet } from "../request/ScopeSet.js";
import { IPerformanceClient } from "../telemetry/performance/IPerformanceClient.js";
import * as Constants from "../utils/Constants.js";
import * as ProtocolUtils from "../utils/ProtocolUtils.js";
import { RequestStateObject } from "../utils/StateTypes.js";
import * as TimeUtils from "../utils/TimeUtils.js";
import { AuthenticationResult } from "./AuthenticationResult.js";
import { AuthorizationCodePayload } from "./AuthorizationCodePayload.js";
import { ServerAuthorizationTokenResponse } from "./ServerAuthorizationTokenResponse.js";

/**
 * Class that handles response parsing.
 * @internal
 */
export class ResponseHandler {
    private clientId: string;
    private cacheStorage: CacheManager;
    private cryptoObj: ICrypto;
    private logger: Logger;
    private homeAccountIdentifier: string;
    private performanceClient: IPerformanceClient;
    private serializableCache: ISerializableTokenCache | null;
    private persistencePlugin: ICachePlugin | null;

    constructor(
        clientId: string,
        cacheStorage: CacheManager,
        cryptoObj: ICrypto,
        logger: Logger,
        performanceClient: IPerformanceClient,
        serializableCache: ISerializableTokenCache | null,
        persistencePlugin: ICachePlugin | null
    ) {
        this.clientId = clientId;
        this.cacheStorage = cacheStorage;
        this.cryptoObj = cryptoObj;
        this.logger = logger;
        this.performanceClient = performanceClient;
        this.serializableCache = serializableCache;
        this.persistencePlugin = persistencePlugin;
    }

    /**
     * Function which validates server authorization token response.
     * @param serverResponse
     * @param correlationId
     * @param refreshAccessToken
     */
    validateTokenResponse(
        serverResponse: ServerAuthorizationTokenResponse,
        correlationId: string,
        refreshAccessToken?: boolean
    ): void {
        // Check for error
        if (
            serverResponse.error ||
            serverResponse.error_description ||
            serverResponse.suberror
        ) {
            const errString = `Error(s): ${
                serverResponse.error_codes || Constants.NOT_AVAILABLE
            } - Timestamp: ${
                serverResponse.timestamp || Constants.NOT_AVAILABLE
            } - Description: ${
                serverResponse.error_description || Constants.NOT_AVAILABLE
            } - Correlation ID: ${
                serverResponse.correlation_id || Constants.NOT_AVAILABLE
            } - Trace ID: ${
                serverResponse.trace_id || Constants.NOT_AVAILABLE
            }`;
            const serverErrorNo = serverResponse.error_codes?.length
                ? serverResponse.error_codes[0]
                : undefined;
            const serverError = new ServerError(
                serverResponse.error,
                errString,
                serverResponse.suberror,
                serverErrorNo,
                serverResponse.status
            );

            // check if 500 error
            if (
                refreshAccessToken &&
                serverResponse.status &&
                serverResponse.status >=
                    Constants.HTTP_SERVER_ERROR_RANGE_START &&
                serverResponse.status <= Constants.HTTP_SERVER_ERROR_RANGE_END
            ) {
                this.logger.warning(
                    `executeTokenRequest:validateTokenResponse - AAD is currently unavailable and the access token is unable to be refreshed.\n${serverError}`,
                    correlationId
                );

                // don't throw an exception, but alert the user via a log that the token was unable to be refreshed
                return;
                // check if 400 error
            } else if (
                refreshAccessToken &&
                serverResponse.status &&
                serverResponse.status >=
                    Constants.HTTP_CLIENT_ERROR_RANGE_START &&
                serverResponse.status <= Constants.HTTP_CLIENT_ERROR_RANGE_END
            ) {
                this.logger.warning(
                    `executeTokenRequest:validateTokenResponse - AAD is currently available but is unable to refresh the access token.\n${serverError}`,
                    correlationId
                );

                // don't throw an exception, but alert the user via a log that the token was unable to be refreshed
                return;
            }

            if (
                isInteractionRequiredError(
                    serverResponse.error,
                    serverResponse.error_description,
                    serverResponse.suberror
                )
            ) {
                throw new InteractionRequiredAuthError(
                    serverResponse.error,
                    serverResponse.error_description,
                    serverResponse.suberror,
                    serverResponse.timestamp || "",
                    serverResponse.trace_id || "",
                    serverResponse.correlation_id || "",
                    serverResponse.claims || "",
                    serverErrorNo
                );
            }

            throw serverError;
        }
    }

    /**
     * Returns a constructed token response based on given string. Also manages the cache updates and cleanups.
     * @param serverTokenResponse
     * @param authority
     */
    async handleServerTokenResponse(
        serverTokenResponse: ServerAuthorizationTokenResponse,
        authority: Authority,
        reqTimestamp: number,
        request: BaseAuthRequest,
        apiId: number,
        authCodePayload?: AuthorizationCodePayload,
        userAssertionHash?: string,
        handlingRefreshTokenResponse?: boolean,
        forceCacheRefreshTokenResponse?: boolean,
        serverRequestId?: string
    ): Promise<AuthenticationResult> {
        // create an idToken object (not entity)
        let idTokenClaims: TokenClaims | undefined;
        if (serverTokenResponse.id_token) {
            idTokenClaims = extractTokenClaims(
                serverTokenResponse.id_token || "",
                this.cryptoObj.base64Decode
            );

            // token nonce check (TODO: Add a warning if no nonce is given?)
            if (authCodePayload && authCodePayload.nonce) {
                if (idTokenClaims.nonce !== authCodePayload.nonce) {
                    throw createClientAuthError(
                        ClientAuthErrorCodes.nonceMismatch
                    );
                }
            }

            // token max_age check
            if (request.maxAge || request.maxAge === 0) {
                const authTime = idTokenClaims.auth_time;
                if (!authTime) {
                    throw createClientAuthError(
                        ClientAuthErrorCodes.authTimeNotFound
                    );
                }

                checkMaxAge(authTime, request.maxAge);
            }
        }

        // generate homeAccountId
        this.homeAccountIdentifier = AccountEntityUtils.generateHomeAccountId(
            serverTokenResponse.client_info || "",
            authority.authorityType,
            this.logger,
            this.cryptoObj,
            request.correlationId,
            idTokenClaims
        );

        // save the response tokens
        let requestStateObj: RequestStateObject | undefined;
        if (!!authCodePayload && !!authCodePayload.state) {
            requestStateObj = ProtocolUtils.parseRequestState(
                this.cryptoObj.base64Decode,
                authCodePayload.state
            );
        }

        // Add keyId from request to serverTokenResponse if defined
        serverTokenResponse.key_id =
            serverTokenResponse.key_id || request.sshKid || undefined;

        const cacheRecord = this.generateCacheRecord(
            serverTokenResponse,
            authority,
            reqTimestamp,
            request,
            idTokenClaims,
            userAssertionHash,
            authCodePayload
        );
        let cacheContext;
        try {
            if (this.persistencePlugin && this.serializableCache) {
                this.logger.verbose(
                    "Persistence enabled, calling beforeCacheAccess",
                    request.correlationId
                );
                cacheContext = new TokenCacheContext(
                    this.serializableCache,
                    true
                );
                await this.persistencePlugin.beforeCacheAccess(cacheContext);
            }
            /*
             * When saving a refreshed tokens to the cache, it is expected that the account that was used is present in the cache.
             * If not present, we should return null, as it's the case that another application called removeAccount in between
             * the calls to getAllAccounts and acquireTokenSilent. We should not overwrite that removal, unless explicitly flagged by
             * the developer, as in the case of refresh token flow used in ADAL Node to MSAL Node migration.
             */
            if (
                handlingRefreshTokenResponse &&
                !forceCacheRefreshTokenResponse &&
                cacheRecord.account
            ) {
                const cachedAccounts = this.cacheStorage.getAllAccounts(
                    {
                        homeAccountId: cacheRecord.account.homeAccountId,
                        environment: cacheRecord.account.environment,
                    },
                    request.correlationId
                );

                if (cachedAccounts.length < 1) {
                    this.logger.warning(
                        "Account used to refresh tokens not in persistence, refreshed tokens will not be stored in the cache",
                        request.correlationId
                    );
                    this.performanceClient?.addFields(
                        {
                            acntLoggedOut: true,
                        },
                        request.correlationId
                    );
                    return await ResponseHandler.generateAuthenticationResult(
                        this.cryptoObj,
                        authority,
                        cacheRecord,
                        false,
                        request,
                        this.performanceClient,
                        idTokenClaims,
                        requestStateObj,
                        undefined,
                        serverRequestId
                    );
                }
            }
            await this.cacheStorage.saveCacheRecord(
                cacheRecord,
                request.correlationId,
                isKmsi(idTokenClaims || {}),
                apiId,
                request.storeInCache
            );
        } finally {
            if (
                this.persistencePlugin &&
                this.serializableCache &&
                cacheContext
            ) {
                this.logger.verbose(
                    "Persistence enabled, calling afterCacheAccess",
                    request.correlationId
                );
                await this.persistencePlugin.afterCacheAccess(cacheContext);
            }
        }

        return ResponseHandler.generateAuthenticationResult(
            this.cryptoObj,
            authority,
            cacheRecord,
            false,
            request,
            this.performanceClient,
            idTokenClaims,
            requestStateObj,
            serverTokenResponse,
            serverRequestId
        );
    }

    /**
     * Generates CacheRecord
     * @param serverTokenResponse
     * @param idTokenObj
     * @param authority
     */
    private generateCacheRecord(
        serverTokenResponse: ServerAuthorizationTokenResponse,
        authority: Authority,
        reqTimestamp: number,
        request: BaseAuthRequest,
        idTokenClaims?: TokenClaims,
        userAssertionHash?: string,
        authCodePayload?: AuthorizationCodePayload
    ): CacheRecord {
        const env = authority.getPreferredCache();
        if (!env) {
            throw createClientAuthError(
                ClientAuthErrorCodes.invalidCacheEnvironment
            );
        }

        const claimsTenantId = getTenantIdFromIdTokenClaims(idTokenClaims);

        // IdToken: non AAD scenarios can have empty realm
        let cachedIdToken: IdTokenEntity | undefined;
        let cachedAccount: AccountEntity | undefined;
        if (serverTokenResponse.id_token && !!idTokenClaims) {
            cachedIdToken = CacheHelpers.createIdTokenEntity(
                this.homeAccountIdentifier,
                env,
                serverTokenResponse.id_token,
                this.clientId,
                claimsTenantId || ""
            );

            cachedAccount = buildAccountToCache(
                this.cacheStorage,
                authority,
                this.homeAccountIdentifier,
                this.cryptoObj.base64Decode,
                request.correlationId,
                idTokenClaims,
                serverTokenResponse.client_info,
                env,
                claimsTenantId,
                authCodePayload,
                undefined, // nativeAccountId
                this.logger,
                this.performanceClient
            );
        }

        // AccessToken
        let cachedAccessToken: AccessTokenEntity | null = null;
        if (serverTokenResponse.access_token) {
            // If scopes not returned in server response, use request scopes
            const responseScopes = serverTokenResponse.scope
                ? ScopeSet.fromString(serverTokenResponse.scope)
                : new ScopeSet(request.scopes || []);

            /*
             * Use timestamp calculated before request
             * Server may return timestamps as strings, parse to numbers if so.
             */
            const expiresIn: number =
                (typeof serverTokenResponse.expires_in === "string"
                    ? parseInt(serverTokenResponse.expires_in, 10)
                    : serverTokenResponse.expires_in) || 0;
            const extExpiresIn: number =
                (typeof serverTokenResponse.ext_expires_in === "string"
                    ? parseInt(serverTokenResponse.ext_expires_in, 10)
                    : serverTokenResponse.ext_expires_in) || 0;
            const refreshIn: number | undefined =
                (typeof serverTokenResponse.refresh_in === "string"
                    ? parseInt(serverTokenResponse.refresh_in, 10)
                    : serverTokenResponse.refresh_in) || undefined;
            const tokenExpirationSeconds = reqTimestamp + expiresIn;
            const extendedTokenExpirationSeconds =
                tokenExpirationSeconds + extExpiresIn;
            const refreshOnSeconds =
                refreshIn && refreshIn > 0
                    ? reqTimestamp + refreshIn
                    : undefined;

            // non AAD scenarios can have empty realm
            cachedAccessToken = CacheHelpers.createAccessTokenEntity(
                this.homeAccountIdentifier,
                env,
                serverTokenResponse.access_token,
                this.clientId,
                claimsTenantId || authority.tenant || "",
                responseScopes.printScopes(),
                tokenExpirationSeconds,
                extendedTokenExpirationSeconds,
                this.cryptoObj.base64Decode,
                refreshOnSeconds,
                serverTokenResponse.token_type,
                userAssertionHash,
                serverTokenResponse.key_id
            );
            // Set resource (to be used for MCP scenarios)
            const resource = request.resource || null;
            if (resource) {
                cachedAccessToken.resource = resource;
            }
        }

        // refreshToken
        let cachedRefreshToken: RefreshTokenEntity | null = null;
        if (serverTokenResponse.refresh_token) {
            let rtExpiresOn: number | undefined;
            if (serverTokenResponse.refresh_token_expires_in) {
                const rtExpiresIn: number =
                    typeof serverTokenResponse.refresh_token_expires_in ===
                    "string"
                        ? parseInt(
                              serverTokenResponse.refresh_token_expires_in,
                              10
                          )
                        : serverTokenResponse.refresh_token_expires_in;
                rtExpiresOn = reqTimestamp + rtExpiresIn;

                this.performanceClient?.addFields(
                    { ntwkRtExpiresOnSeconds: rtExpiresOn },
                    request.correlationId
                );
            }
            cachedRefreshToken = CacheHelpers.createRefreshTokenEntity(
                this.homeAccountIdentifier,
                env,
                serverTokenResponse.refresh_token,
                this.clientId,
                serverTokenResponse.foci,
                userAssertionHash,
                rtExpiresOn
            );
        }

        // appMetadata
        let cachedAppMetadata: AppMetadataEntity | null = null;
        if (serverTokenResponse.foci) {
            cachedAppMetadata = {
                clientId: this.clientId,
                environment: env,
                familyId: serverTokenResponse.foci,
            };
        }

        return {
            account: cachedAccount,
            idToken: cachedIdToken,
            accessToken: cachedAccessToken,
            refreshToken: cachedRefreshToken,
            appMetadata: cachedAppMetadata,
        };
    }

    /**
     * Creates an @AuthenticationResult from @CacheRecord , @IdToken , and a boolean that states whether or not the result is from cache.
     *
     * Optionally takes a state string that is set as-is in the response.
     *
     * @param cacheRecord
     * @param idTokenObj
     * @param fromTokenCache
     * @param stateString
     */
    static async generateAuthenticationResult(
        cryptoObj: ICrypto,
        authority: Authority,
        cacheRecord: CacheRecord,
        fromTokenCache: boolean,
        request: BaseAuthRequest,
        performanceClient: IPerformanceClient,
        idTokenClaims?: TokenClaims,
        requestState?: RequestStateObject,
        serverTokenResponse?: ServerAuthorizationTokenResponse,
        requestId?: string
    ): Promise<AuthenticationResult> {
        let accessToken: string = "";
        let responseScopes: Array<string> = [];
        let expiresOn: Date | null = null;
        let extExpiresOn: Date | undefined;
        let refreshOn: Date | undefined;
        let familyId: string = "";

        if (cacheRecord.accessToken) {
            /*
             * if the request object has `popKid` property, `signPopToken` will be set to false and
             * the token will be returned unsigned
             */
            if (
                cacheRecord.accessToken.tokenType ===
                    Constants.AuthenticationScheme.POP &&
                !request.popKid
            ) {
                const popTokenGenerator: PopTokenGenerator =
                    new PopTokenGenerator(cryptoObj, performanceClient);
                const { secret, keyId } = cacheRecord.accessToken;

                if (!keyId) {
                    throw createClientAuthError(
                        ClientAuthErrorCodes.keyIdMissing
                    );
                }

                accessToken = await popTokenGenerator.signPopToken(
                    secret,
                    keyId,
                    request
                );
            } else {
                accessToken = cacheRecord.accessToken.secret;
            }
            responseScopes = ScopeSet.fromString(
                cacheRecord.accessToken.target
            ).asArray();
            // Access token expiresOn cached in seconds, converting to Date for AuthenticationResult
            expiresOn = TimeUtils.toDateFromSeconds(
                cacheRecord.accessToken.expiresOn
            );
            extExpiresOn = TimeUtils.toDateFromSeconds(
                cacheRecord.accessToken.extendedExpiresOn
            );
            if (cacheRecord.accessToken.refreshOn) {
                refreshOn = TimeUtils.toDateFromSeconds(
                    cacheRecord.accessToken.refreshOn
                );
            }
        }

        if (cacheRecord.appMetadata) {
            familyId =
                cacheRecord.appMetadata.familyId === Constants.THE_FAMILY_ID
                    ? Constants.THE_FAMILY_ID
                    : "";
        }
        const uid = idTokenClaims?.oid || idTokenClaims?.sub || "";
        const tid = idTokenClaims?.tid || "";

        // for hybrid + native bridge enablement, send back the native account Id
        if (serverTokenResponse?.spa_accountid && !!cacheRecord.account) {
            cacheRecord.account.nativeAccountId =
                serverTokenResponse?.spa_accountid;
        }

        const accountInfo: AccountInfo | null = cacheRecord.account
            ? updateAccountTenantProfileData(
                  AccountEntityUtils.getAccountInfo(cacheRecord.account),
                  undefined, // tenantProfile optional
                  idTokenClaims,
                  cacheRecord.idToken?.secret
              )
            : null;

        return {
            authority: authority.canonicalAuthority,
            uniqueId: uid,
            tenantId: tid,
            scopes: responseScopes,
            account: accountInfo,
            idToken: cacheRecord?.idToken?.secret || "",
            idTokenClaims: idTokenClaims || {},
            accessToken: accessToken,
            fromCache: fromTokenCache,
            expiresOn: expiresOn,
            extExpiresOn: extExpiresOn,
            refreshOn: refreshOn,
            correlationId: request.correlationId,
            requestId: requestId || "",
            familyId: familyId,
            tokenType: cacheRecord.accessToken?.tokenType || "",
            state: requestState ? requestState.userRequestState : "",
            cloudGraphHostName: cacheRecord.account?.cloudGraphHostName || "",
            msGraphHost: cacheRecord.account?.msGraphHost || "",
            code: serverTokenResponse?.spa_code,
            fromPlatformBroker: false,
        };
    }
}

export function buildAccountToCache(
    cacheStorage: CacheManager,
    authority: Authority,
    homeAccountId: string,
    base64Decode: (input: string) => string,
    correlationId: string,
    idTokenClaims?: TokenClaims,
    clientInfo?: string,
    environment?: string,
    claimsTenantId?: string | null,
    authCodePayload?: AuthorizationCodePayload,
    nativeAccountId?: string,
    logger?: Logger,
    performanceClient?: IPerformanceClient
): AccountEntity {
    logger?.verbose("setCachedAccount called", correlationId);

    /*
     * Check if base account is already cached. Filter by homeAccountId (identifies
     * the user's home identity) and environment (identifies the cloud) — the two
     * tenant-agnostic properties that uniquely locate a base AccountEntity.
     */
    const accountEnvironment = environment || authority.getPreferredCache();
    const matchedAccounts = cacheStorage.getAccountsFilteredBy(
        { homeAccountId, environment: accountEnvironment },
        correlationId
    );
    performanceClient?.addFields(
        { cacheMatchedAccounts: matchedAccounts.length },
        correlationId
    );

    if (matchedAccounts.length > 1) {
        /*
         * Base accounts are expected to be unique for a given homeAccountId in normal cache usage.
         * If multiple matches exist, ignore the cache hit rather than arbitrarily choosing one.
         */
        logger?.warning(
            "Multiple base accounts matched homeAccountId. Ignoring cached account and creating a new base account.",
            correlationId
        );
    }

    const cachedAccount =
        matchedAccounts.length === 1 ? matchedAccounts[0] : null;

    const baseAccount =
        cachedAccount ||
        AccountEntityUtils.createAccountEntity(
            {
                homeAccountId,
                idTokenClaims,
                clientInfo,
                environment,
                cloudGraphHostName: authCodePayload?.cloud_graph_host_name,
                msGraphHost: authCodePayload?.msgraph_host,
                nativeAccountId: nativeAccountId,
            },
            authority,
            base64Decode
        );

    const tenantProfiles = baseAccount.tenantProfiles || [];
    const tenantId = claimsTenantId || baseAccount.realm;
    if (
        tenantId &&
        !tenantProfiles.find((tenantProfile) => {
            return tenantProfile.tenantId === tenantId;
        })
    ) {
        const newTenantProfile = buildTenantProfile(
            homeAccountId,
            baseAccount.localAccountId,
            tenantId,
            idTokenClaims
        );
        tenantProfiles.push(newTenantProfile);
    }
    baseAccount.tenantProfiles = tenantProfiles;

    return baseAccount;
}
