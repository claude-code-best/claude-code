/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as Constants from "../../utils/Constants.js";
import { Authority } from "../../authority/Authority.js";
import { ICrypto } from "../../crypto/ICrypto.js";
import { ClientInfo, buildClientInfo } from "../../account/ClientInfo.js";
import {
    AccountInfo,
    TenantProfile,
    buildTenantProfile,
    DataBoundary,
} from "../../account/AccountInfo.js";
import {
    createClientAuthError,
    ClientAuthErrorCodes,
} from "../../error/ClientAuthError.js";
import { AuthorityType } from "../../authority/AuthorityType.js";
import { Logger } from "../../logger/Logger.js";
import {
    TokenClaims,
    getTenantIdFromIdTokenClaims,
} from "../../account/TokenClaims.js";
import { ProtocolMode } from "../../authority/ProtocolMode.js";
import { AccountEntity } from "../entities/AccountEntity.js";

/**
 * Generate Account Id key component as per the schema: <home_account_id>-<environment>
 */
export function generateAccountId(accountEntity: AccountEntity): string {
    const accountId: Array<string> = [
        accountEntity.homeAccountId,
        accountEntity.environment,
    ];
    return accountId.join(Constants.CACHE_KEY_SEPARATOR).toLowerCase();
}

/**
 * Returns the AccountInfo interface for this account.
 */
export function getAccountInfo(accountEntity: AccountEntity): AccountInfo {
    const tenantProfiles = accountEntity.tenantProfiles || [];
    // Ensure at least the home tenant profile exists
    if (
        tenantProfiles.length === 0 &&
        accountEntity.realm &&
        accountEntity.localAccountId
    ) {
        tenantProfiles.push(
            buildTenantProfile(
                accountEntity.homeAccountId,
                accountEntity.localAccountId,
                accountEntity.realm
            )
        );
    }
    return {
        homeAccountId: accountEntity.homeAccountId,
        environment: accountEntity.environment,
        tenantId: accountEntity.realm,
        username: accountEntity.username,
        localAccountId: accountEntity.localAccountId,
        loginHint: accountEntity.loginHint,
        name: accountEntity.name,
        nativeAccountId: accountEntity.nativeAccountId,
        authorityType: accountEntity.authorityType,
        // Deserialize tenant profiles array into a Map
        tenantProfiles: new Map(
            tenantProfiles.map((tenantProfile) => {
                return [tenantProfile.tenantId, tenantProfile];
            })
        ),
        dataBoundary: accountEntity.dataBoundary,
    };
}

/**
 * Returns true if the account entity is in single tenant format (outdated), false otherwise
 */
export function isSingleTenant(accountEntity: AccountEntity): boolean {
    return !accountEntity.tenantProfiles;
}

/**
 * Build Account cache from IdToken, clientInfo and authority/policy. Associated with AAD.
 * @param accountDetails
 */
export function createAccountEntity(
    accountDetails: {
        homeAccountId: string;
        idTokenClaims?: TokenClaims;
        clientInfo?: string;
        cloudGraphHostName?: string;
        msGraphHost?: string;
        environment?: string;
        nativeAccountId?: string;
        tenantProfiles?: Array<TenantProfile>;
    },
    authority: Authority,
    base64Decode?: (input: string) => string
): AccountEntity {
    let authorityType;
    if (authority.authorityType === AuthorityType.Adfs) {
        authorityType = Constants.CACHE_ACCOUNT_TYPE_ADFS;
    } else if (authority.protocolMode === ProtocolMode.OIDC) {
        authorityType = Constants.CACHE_ACCOUNT_TYPE_GENERIC;
    } else {
        authorityType = Constants.CACHE_ACCOUNT_TYPE_MSSTS;
    }

    let clientInfo: ClientInfo | undefined;
    let dataBoundary: DataBoundary | undefined;

    if (accountDetails.clientInfo && base64Decode) {
        clientInfo = buildClientInfo(accountDetails.clientInfo, base64Decode);
        if (clientInfo.xms_tdbr) {
            dataBoundary = clientInfo.xms_tdbr === "EU" ? "EU" : "None";
        }
    }

    const env =
        accountDetails.environment ||
        (authority && authority.getPreferredCache());

    if (!env) {
        throw createClientAuthError(
            ClientAuthErrorCodes.invalidCacheEnvironment
        );
    }

    /*
     * In B2C scenarios the emails claim is used instead of preferred_username and it is an array.
     * In most cases it will contain a single email. This field should not be relied upon if a custom
     * policy is configured to return more than 1 email.
     */
    const preferredUsername =
        accountDetails.idTokenClaims?.preferred_username ||
        accountDetails.idTokenClaims?.upn;
    const email = accountDetails.idTokenClaims?.emails
        ? accountDetails.idTokenClaims.emails[0]
        : null;

    const username = preferredUsername || email || "";

    const loginHint = accountDetails.idTokenClaims?.login_hint;

    const realm =
        clientInfo?.utid ||
        getTenantIdFromIdTokenClaims(accountDetails.idTokenClaims) ||
        ""; // non-AAD scenarios can have empty realm
    // How do you account for MSA CID here?
    const localAccountId =
        clientInfo?.uid ||
        accountDetails.idTokenClaims?.oid ||
        accountDetails.idTokenClaims?.sub ||
        "";
    let tenantProfiles;
    if (accountDetails.tenantProfiles) {
        tenantProfiles = accountDetails.tenantProfiles;
    } else {
        const tenantProfile = buildTenantProfile(
            accountDetails.homeAccountId,
            localAccountId,
            realm,
            accountDetails.idTokenClaims
        );
        tenantProfiles = [tenantProfile];
    }

    return {
        homeAccountId: accountDetails.homeAccountId,
        environment: env,
        realm: realm,
        localAccountId: localAccountId,
        username: username,
        authorityType: authorityType,
        loginHint: loginHint,
        clientInfo: accountDetails.clientInfo,
        name: accountDetails.idTokenClaims?.name || "",
        lastModificationTime: undefined,
        lastModificationApp: undefined,
        cloudGraphHostName: accountDetails.cloudGraphHostName,
        msGraphHost: accountDetails.msGraphHost,
        nativeAccountId: accountDetails.nativeAccountId,
        tenantProfiles: tenantProfiles,
        dataBoundary,
    } as AccountEntity;
}

/**
 * Creates an AccountEntity object from AccountInfo
 * @param accountInfo
 * @param cloudGraphHostName
 * @param msGraphHost
 * @returns
 */
export function createAccountEntityFromAccountInfo(
    accountInfo: AccountInfo,
    cloudGraphHostName?: string,
    msGraphHost?: string
): AccountEntity {
    // Serialize tenant profiles map into an array
    const tenantProfiles = Array.from(
        accountInfo.tenantProfiles?.values() || []
    );
    // Ensure at least the home tenant profile exists
    if (
        tenantProfiles.length === 0 &&
        accountInfo.tenantId &&
        accountInfo.localAccountId
    ) {
        tenantProfiles.push(
            buildTenantProfile(
                accountInfo.homeAccountId,
                accountInfo.localAccountId,
                accountInfo.tenantId,
                accountInfo.idTokenClaims
            )
        );
    }
    return {
        authorityType:
            accountInfo.authorityType || Constants.CACHE_ACCOUNT_TYPE_GENERIC,
        homeAccountId: accountInfo.homeAccountId,
        localAccountId: accountInfo.localAccountId,
        nativeAccountId: accountInfo.nativeAccountId,
        realm: accountInfo.tenantId,
        environment: accountInfo.environment,
        username: accountInfo.username,
        loginHint: accountInfo.loginHint,
        name: accountInfo.name,
        cloudGraphHostName: cloudGraphHostName,
        msGraphHost: msGraphHost,
        tenantProfiles: tenantProfiles,
        dataBoundary: accountInfo.dataBoundary,
    } as AccountEntity;
}

/**
 * Generate HomeAccountId from server response
 * @param serverClientInfo
 * @param authType
 */
export function generateHomeAccountId(
    serverClientInfo: string,
    authType: AuthorityType,
    logger: Logger,
    cryptoObj: ICrypto,
    correlationId: string,
    idTokenClaims?: TokenClaims
): string {
    // since ADFS/DSTS do not have tid and does not set client_info
    if (!(authType === AuthorityType.Adfs || authType === AuthorityType.Dsts)) {
        // for cases where there is clientInfo
        if (serverClientInfo) {
            try {
                const clientInfo = buildClientInfo(
                    serverClientInfo,
                    cryptoObj.base64Decode
                );
                if (clientInfo.uid && clientInfo.utid) {
                    return `${clientInfo.uid}.${clientInfo.utid}`;
                }
            } catch (e) {}
        }
        logger.warning("No client info in response", correlationId);
    }

    // default to "sub" claim
    return idTokenClaims?.sub || "";
}

/**
 * Validates an entity: checks for all expected params
 * @param entity
 */
export function isAccountEntity(entity: object): entity is AccountEntity {
    if (!entity) {
        return false;
    }

    return (
        entity.hasOwnProperty("homeAccountId") &&
        entity.hasOwnProperty("environment") &&
        entity.hasOwnProperty("realm") &&
        entity.hasOwnProperty("localAccountId") &&
        entity.hasOwnProperty("username") &&
        entity.hasOwnProperty("authorityType")
    );
}
