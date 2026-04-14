/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AccountFilter } from "../utils/CacheTypes.js";
import { CacheRecord } from "../entities/CacheRecord.js";
import { AccountEntity } from "../entities/AccountEntity.js";
import { AccountInfo } from "../../account/AccountInfo.js";
import { AppMetadataEntity } from "../entities/AppMetadataEntity.js";
import { ServerTelemetryEntity } from "../entities/ServerTelemetryEntity.js";
import { ThrottlingEntity } from "../entities/ThrottlingEntity.js";
import { IdTokenEntity } from "../entities/IdTokenEntity.js";
import { AccessTokenEntity } from "../entities/AccessTokenEntity.js";
import { RefreshTokenEntity } from "../entities/RefreshTokenEntity.js";
import { AuthorityMetadataEntity } from "../entities/AuthorityMetadataEntity.js";
import { StoreInCache } from "../../request/StoreInCache.js";

export interface ICacheManager {
    /**
     * fetch the account entity from the platform cache
     * @param accountKey
     * @param correlationId
     */
    getAccount(accountKey: string, correlationId: string): AccountEntity | null;

    /**
     * set account entity in the platform cache
     * @param account
     * @param correlationId
     */
    setAccount(
        account: AccountEntity,
        correlationId: string,
        kmsi: boolean,
        apiId: number
    ): Promise<void>;

    /**
     * fetch the idToken entity from the platform cache
     * @param idTokenKey
     * @param correlationId
     */
    getIdTokenCredential(
        idTokenKey: string,
        correlationId: string
    ): IdTokenEntity | null;

    /**
     * set idToken entity to the platform cache
     * @param idToken
     * @param correlationId
     */
    setIdTokenCredential(
        idToken: IdTokenEntity,
        correlationId: string,
        kmsi: boolean
    ): Promise<void>;

    /**
     * fetch the idToken entity from the platform cache
     * @param accessTokenKey
     * @param correlationId
     */
    getAccessTokenCredential(
        accessTokenKey: string,
        correlationId: string
    ): AccessTokenEntity | null;

    /**
     * set idToken entity to the platform cache
     * @param accessToken
     * @param correlationId
     */
    setAccessTokenCredential(
        accessToken: AccessTokenEntity,
        correlationId: string,
        kmsi: boolean
    ): Promise<void>;

    /**
     * fetch the idToken entity from the platform cache
     * @param refreshTokenKey
     * @param correlationId
     */
    getRefreshTokenCredential(
        refreshTokenKey: string,
        correlationId: string
    ): RefreshTokenEntity | null;

    /**
     * set idToken entity to the platform cache
     * @param refreshToken
     * @param correlationId
     */
    setRefreshTokenCredential(
        refreshToken: RefreshTokenEntity,
        correlationId: string,
        kmsi: boolean
    ): Promise<void>;

    /**
     * fetch appMetadata entity from the platform cache
     * @param appMetadataKey
     * @param correlationId
     */
    getAppMetadata(
        appMetadataKey: string,
        correlationId: string
    ): AppMetadataEntity | null;

    /**
     * set appMetadata entity to the platform cache
     * @param appMetadata
     * @param correlationId
     */
    setAppMetadata(appMetadata: AppMetadataEntity, correlationId: string): void;

    /**
     * fetch server telemetry entity from the platform cache
     * @param serverTelemetryKey
     * @param correlationId
     */
    getServerTelemetry(
        serverTelemetryKey: string,
        correlationId: string
    ): ServerTelemetryEntity | null;

    /**
     * set server telemetry entity to the platform cache
     * @param serverTelemetryKey
     * @param serverTelemetry
     * @param correlationId
     */
    setServerTelemetry(
        serverTelemetryKey: string,
        serverTelemetry: ServerTelemetryEntity,
        correlationId: string
    ): void;

    /**
     * fetch cloud discovery metadata entity from the platform cache
     * @param key
     * @param correlationId
     */
    getAuthorityMetadata(
        key: string,
        correlationId: string
    ): AuthorityMetadataEntity | null;

    /**
     * Get cache keys for authority metadata
     * @param correlationId
     */
    getAuthorityMetadataKeys(correlationId: string): Array<string>;

    /**
     * set cloud discovery metadata entity to the platform cache
     * @param key
     * @param value
     * @param correlationId
     */
    setAuthorityMetadata(
        key: string,
        value: AuthorityMetadataEntity,
        correlationId: string
    ): void;

    /**
     * Provide an alias to find a matching AuthorityMetadataEntity in cache
     * @param host
     * @param correlationId
     */
    getAuthorityMetadataByAlias(
        host: string,
        correlationId: string
    ): AuthorityMetadataEntity | null;

    /**
     * given an authority generates the cache key for authorityMetadata
     * @param authority
     * @param correlationId
     */
    generateAuthorityMetadataCacheKey(
        authority: string,
        correlationId: string
    ): string;

    /**
     * fetch throttling entity from the platform cache
     * @param throttlingCacheKey
     * @param correlationId
     */
    getThrottlingCache(
        throttlingCacheKey: string,
        correlationId: string
    ): ThrottlingEntity | null;

    /**
     * set throttling entity to the platform cache
     * @param throttlingCacheKey
     * @param throttlingCache
     * @param correlationId
     */
    setThrottlingCache(
        throttlingCacheKey: string,
        throttlingCache: ThrottlingEntity,
        correlationId: string
    ): void;

    /**
     * Returns all accounts in cache
     * @param filter
     * @param correlationId
     */
    getAllAccounts(filter: AccountFilter, correlationId: string): AccountInfo[];

    /**
     * saves a cache record
     * @param cacheRecord
     * @param correlationId
     * @param storeInCache
     */
    saveCacheRecord(
        cacheRecord: CacheRecord,
        correlationId: string,
        kmsi: boolean,
        apiId: number,
        storeInCache?: StoreInCache
    ): Promise<void>;

    /**
     * retrieve accounts matching all provided filters; if no filter is set, get all accounts
     * @param filter
     * @param correlationId
     */
    getAccountsFilteredBy(
        filter: AccountFilter,
        correlationId: string
    ): AccountEntity[];

    /**
     * Get AccountInfo object based on provided filters
     * @param filter
     * @param correlationId
     */
    getAccountInfoFilteredBy(
        filter: AccountFilter,
        correlationId: string
    ): AccountInfo | null;

    /**
     * Removes all accounts and related tokens from cache.
     * @param correlationId
     */
    removeAllAccounts(correlationId: string): void;

    /**
     * returns a boolean if the given account is removed
     * @param account
     * @param correlationId
     */
    removeAccount(account: AccountInfo, correlationId: string): void;

    /**
     * returns a boolean if the given account is removed
     * @param account
     * @param correlationId
     */
    removeAccountContext(account: AccountInfo, correlationId: string): void;

    /**
     * @param key
     * @param correlationId
     */
    removeIdToken(key: string, correlationId: string): void;

    /**
     * @param key
     * @param correlationId
     */
    removeAccessToken(key: string, correlationId: string): void;

    /**
     * @param key
     * @param correlationId
     */
    removeRefreshToken(key: string, correlationId: string): void;
}
