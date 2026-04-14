export interface IAsyncStorage<T> {
    /**
     * Get the item from the asynchronous storage object matching the given key.
     * @param key
     * @param correlationId
     */
    getItem(key: string, correlationId: string): Promise<T | null>;
    /**
     * Sets the item in the asynchronous storage object with the given key.
     * @param key
     * @param value
     * @param correlationId
     */
    setItem(key: string, value: T, correlationId: string): Promise<void>;
    /**
     * Removes the item in the asynchronous storage object matching the given key.
     * @param key
     * @param correlationId
     */
    removeItem(key: string, correlationId: string): Promise<void>;
    /**
     * Get all the keys from the asynchronous storage object as an iterable array of strings.
     * @param correlationId
     */
    getKeys(correlationId: string): Promise<string[]>;
    /**
     * Returns true or false if the given key is present in the cache.
     * @param key
     * @param correlationId
     */
    containsKey(key: string, correlationId: string): Promise<boolean>;
}
//# sourceMappingURL=IAsyncStorage.d.ts.map