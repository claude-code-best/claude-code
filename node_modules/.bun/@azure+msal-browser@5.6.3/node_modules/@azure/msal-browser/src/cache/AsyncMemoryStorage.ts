/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Logger } from "@azure/msal-common/browser";
import {
    BrowserAuthError,
    BrowserAuthErrorCodes,
} from "../error/BrowserAuthError.js";
import { DatabaseStorage } from "./DatabaseStorage.js";
import { IAsyncStorage } from "./IAsyncStorage.js";
import { MemoryStorage } from "./MemoryStorage.js";

/**
 * This class allows MSAL to store artifacts asynchronously using the DatabaseStorage IndexedDB wrapper,
 * backed up with the more volatile MemoryStorage object for cases in which IndexedDB may be unavailable.
 */
export class AsyncMemoryStorage<T> implements IAsyncStorage<T> {
    private inMemoryCache: MemoryStorage<T>;
    private indexedDBCache: DatabaseStorage<T>;
    private logger: Logger;

    constructor(logger: Logger) {
        this.inMemoryCache = new MemoryStorage<T>();
        this.indexedDBCache = new DatabaseStorage<T>();
        this.logger = logger;
    }

    private handleDatabaseAccessError(
        error: unknown,
        correlationId: string
    ): void {
        if (
            error instanceof BrowserAuthError &&
            error.errorCode === BrowserAuthErrorCodes.databaseUnavailable
        ) {
            this.logger.error(
                "Could not access persistent storage. This may be caused by browser privacy features which block persistent storage in third-party contexts.",
                correlationId
            );
        } else {
            throw error;
        }
    }
    /**
     * Get the item matching the given key. Tries in-memory cache first, then in the asynchronous
     * storage object if item isn't found in-memory.
     * @param key
     * @param correlationId
     */
    async getItem(key: string, correlationId: string): Promise<T | null> {
        const item = this.inMemoryCache.getItem(key);
        if (!item) {
            try {
                this.logger.verbose(
                    "Queried item not found in in-memory cache, now querying persistent storage.",
                    correlationId
                );
                return await this.indexedDBCache.getItem(key);
            } catch (e) {
                this.handleDatabaseAccessError(e, correlationId);
            }
        }
        return item;
    }

    /**
     * Sets the item in the in-memory cache and then tries to set it in the asynchronous
     * storage object with the given key.
     * @param key
     * @param value
     * @param correlationId
     */
    async setItem(key: string, value: T, correlationId: string): Promise<void> {
        this.inMemoryCache.setItem(key, value);
        try {
            await this.indexedDBCache.setItem(key, value);
        } catch (e) {
            this.handleDatabaseAccessError(e, correlationId);
        }
    }

    /**
     * Removes the item matching the key from the in-memory cache, then tries to remove it from the asynchronous storage object.
     * @param key
     * @param correlationId
     */
    async removeItem(key: string, correlationId: string): Promise<void> {
        this.inMemoryCache.removeItem(key);
        try {
            await this.indexedDBCache.removeItem(key);
        } catch (e) {
            this.handleDatabaseAccessError(e, correlationId);
        }
    }

    /**
     * Get all the keys from the in-memory cache as an iterable array of strings. If no keys are found, query the keys in the
     * asynchronous storage object.
     * @param correlationId
     */
    async getKeys(correlationId: string): Promise<string[]> {
        const cacheKeys = this.inMemoryCache.getKeys();
        if (cacheKeys.length === 0) {
            try {
                this.logger.verbose(
                    "In-memory cache is empty, now querying persistent storage.",
                    correlationId
                );
                return await this.indexedDBCache.getKeys();
            } catch (e) {
                this.handleDatabaseAccessError(e, correlationId);
            }
        }
        return cacheKeys;
    }

    /**
     * Returns true or false if the given key is present in the cache.
     * @param key
     * @param correlationId
     */
    async containsKey(key: string, correlationId: string): Promise<boolean> {
        const containsKey = this.inMemoryCache.containsKey(key);
        if (!containsKey) {
            try {
                this.logger.verbose(
                    "Key not found in in-memory cache, now querying persistent storage.",
                    correlationId
                );
                return await this.indexedDBCache.containsKey(key);
            } catch (e) {
                this.handleDatabaseAccessError(e, correlationId);
            }
        }
        return containsKey;
    }

    /**
     * Clears in-memory Map
     * @param correlationId
     */
    clearInMemory(correlationId: string): void {
        // InMemory cache is a Map instance, clear is straightforward
        this.logger.verbose(`Deleting in-memory keystore`, correlationId);
        this.inMemoryCache.clear();
        this.logger.verbose(`In-memory keystore deleted`, correlationId);
    }

    /**
     * Tries to delete the IndexedDB database
     * @param correlationId
     * @returns
     */
    async clearPersistent(correlationId: string): Promise<boolean> {
        try {
            this.logger.verbose("Deleting persistent keystore", correlationId);
            const dbDeleted = await this.indexedDBCache.deleteDatabase();
            if (dbDeleted) {
                this.logger.verbose(
                    "Persistent keystore deleted",
                    correlationId
                );
            }

            return dbDeleted;
        } catch (e) {
            this.handleDatabaseAccessError(e, correlationId);
            return false;
        }
    }
}
