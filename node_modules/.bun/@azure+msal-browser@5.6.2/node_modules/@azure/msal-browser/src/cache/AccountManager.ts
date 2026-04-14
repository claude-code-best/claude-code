/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AccountInfo, AccountFilter, Logger } from "@azure/msal-common/browser";
import { BrowserCacheManager } from "./BrowserCacheManager.js";

/**
 * Returns all the accounts in the cache that match the optional filter. If no filter is provided, all accounts are returned.
 * @param accountFilter - (Optional) filter to narrow down the accounts returned
 * @returns Array of AccountInfo objects in cache
 */
export function getAllAccounts(
    logger: Logger,
    browserStorage: BrowserCacheManager,
    isInBrowser: boolean,
    correlationId: string,
    accountFilter?: AccountFilter
): AccountInfo[] {
    logger.verbose("getAllAccounts called", correlationId);
    return isInBrowser
        ? browserStorage.getAllAccounts(accountFilter, correlationId)
        : [];
}

/**
 * Returns the first account found in the cache that matches the account filter passed in.
 * @param accountFilter
 * @returns The first account found in the cache matching the provided filter or null if no account could be found.
 */
export function getAccount(
    accountFilter: AccountFilter,
    logger: Logger,
    browserStorage: BrowserCacheManager,
    correlationId: string
): AccountInfo | null {
    logger.trace("getAccount called", correlationId);
    const account: AccountInfo | null = browserStorage.getAccountInfoFilteredBy(
        accountFilter,
        correlationId
    );

    if (account) {
        logger.verbose(
            "getAccount: Account matching provided filter found, returning",
            correlationId
        );
        return account;
    } else {
        logger.verbose(
            "getAccount: No matching account found, returning null",
            correlationId
        );
        return null;
    }
}

/**
 * Sets the account to use as the active account. If no account is passed to the acquireToken APIs, then MSAL will use this active account.
 * @param account
 */
export function setActiveAccount(
    account: AccountInfo | null,
    browserStorage: BrowserCacheManager,
    correlationId: string
): void {
    browserStorage.setActiveAccount(account, correlationId);
}

/**
 * Gets the currently active account
 */
export function getActiveAccount(
    browserStorage: BrowserCacheManager,
    correlationId: string
): AccountInfo | null {
    return browserStorage.getActiveAccount(correlationId);
}
