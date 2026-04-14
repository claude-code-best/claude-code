"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoizeIdentityProvider = exports.doesIdentityRequireRefresh = exports.isIdentityExpired = exports.EXPIRATION_MS = exports.createIsIdentityExpiredFunction = void 0;
const createIsIdentityExpiredFunction = (expirationMs) => function isIdentityExpired(identity) {
    return (0, exports.doesIdentityRequireRefresh)(identity) && identity.expiration.getTime() - Date.now() < expirationMs;
};
exports.createIsIdentityExpiredFunction = createIsIdentityExpiredFunction;
exports.EXPIRATION_MS = 300_000;
exports.isIdentityExpired = (0, exports.createIsIdentityExpiredFunction)(exports.EXPIRATION_MS);
const doesIdentityRequireRefresh = (identity) => identity.expiration !== undefined;
exports.doesIdentityRequireRefresh = doesIdentityRequireRefresh;
const memoizeIdentityProvider = (provider, isExpired, requiresRefresh) => {
    if (provider === undefined) {
        return undefined;
    }
    const normalizedProvider = typeof provider !== "function" ? async () => Promise.resolve(provider) : provider;
    let resolved;
    let pending;
    let hasResult;
    let isConstant = false;
    const coalesceProvider = async (options) => {
        if (!pending) {
            pending = normalizedProvider(options);
        }
        try {
            resolved = await pending;
            hasResult = true;
            isConstant = false;
        }
        finally {
            pending = undefined;
        }
        return resolved;
    };
    if (isExpired === undefined) {
        return async (options) => {
            if (!hasResult || options?.forceRefresh) {
                resolved = await coalesceProvider(options);
            }
            return resolved;
        };
    }
    return async (options) => {
        if (!hasResult || options?.forceRefresh) {
            resolved = await coalesceProvider(options);
        }
        if (isConstant) {
            return resolved;
        }
        if (!requiresRefresh(resolved)) {
            isConstant = true;
            return resolved;
        }
        if (isExpired(resolved)) {
            await coalesceProvider(options);
            return resolved;
        }
        return resolved;
    };
};
exports.memoizeIdentityProvider = memoizeIdentityProvider;
