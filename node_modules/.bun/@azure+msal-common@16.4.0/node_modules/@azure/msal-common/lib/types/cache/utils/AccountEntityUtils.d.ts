import { Authority } from "../../authority/Authority.js";
import { ICrypto } from "../../crypto/ICrypto.js";
import { AccountInfo, TenantProfile } from "../../account/AccountInfo.js";
import { AuthorityType } from "../../authority/AuthorityType.js";
import { Logger } from "../../logger/Logger.js";
import { TokenClaims } from "../../account/TokenClaims.js";
import { AccountEntity } from "../entities/AccountEntity.js";
/**
 * Generate Account Id key component as per the schema: <home_account_id>-<environment>
 */
export declare function generateAccountId(accountEntity: AccountEntity): string;
/**
 * Returns the AccountInfo interface for this account.
 */
export declare function getAccountInfo(accountEntity: AccountEntity): AccountInfo;
/**
 * Returns true if the account entity is in single tenant format (outdated), false otherwise
 */
export declare function isSingleTenant(accountEntity: AccountEntity): boolean;
/**
 * Build Account cache from IdToken, clientInfo and authority/policy. Associated with AAD.
 * @param accountDetails
 */
export declare function createAccountEntity(accountDetails: {
    homeAccountId: string;
    idTokenClaims?: TokenClaims;
    clientInfo?: string;
    cloudGraphHostName?: string;
    msGraphHost?: string;
    environment?: string;
    nativeAccountId?: string;
    tenantProfiles?: Array<TenantProfile>;
}, authority: Authority, base64Decode?: (input: string) => string): AccountEntity;
/**
 * Creates an AccountEntity object from AccountInfo
 * @param accountInfo
 * @param cloudGraphHostName
 * @param msGraphHost
 * @returns
 */
export declare function createAccountEntityFromAccountInfo(accountInfo: AccountInfo, cloudGraphHostName?: string, msGraphHost?: string): AccountEntity;
/**
 * Generate HomeAccountId from server response
 * @param serverClientInfo
 * @param authType
 */
export declare function generateHomeAccountId(serverClientInfo: string, authType: AuthorityType, logger: Logger, cryptoObj: ICrypto, correlationId: string, idTokenClaims?: TokenClaims): string;
/**
 * Validates an entity: checks for all expected params
 * @param entity
 */
export declare function isAccountEntity(entity: object): entity is AccountEntity;
//# sourceMappingURL=AccountEntityUtils.d.ts.map