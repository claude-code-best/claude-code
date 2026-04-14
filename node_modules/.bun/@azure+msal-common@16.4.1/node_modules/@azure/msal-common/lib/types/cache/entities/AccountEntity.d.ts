import { TenantProfile, DataBoundary } from "../../account/AccountInfo.js";
/**
 * Type that defines required and optional parameters for an Account field (based on universal cache schema implemented by all MSALs).
 *
 * Key : Value Schema
 *
 * Key: <home_account_id>-<environment>-<realm*>
 *
 * Value Schema:
 * {
 *      homeAccountId: home account identifier for the auth scheme,
 *      environment: entity that issued the token, represented as a full host
 *      realm: Full tenant or organizational identifier that the account belongs to
 *      localAccountId: Original tenant-specific accountID, usually used for legacy cases
 *      username: primary username that represents the user, usually corresponds to preferred_username in the v2 endpt
 *      authorityType: Accounts authority type as a string
 *      name: Full name for the account, including given name and family name,
 *      lastModificationTime: last time this entity was modified in the cache
 *      lastModificationApp:
 *      nativeAccountId: Account identifier on the native device
 *      tenantProfiles: Array of tenant profile objects for each tenant that the account has authenticated with in the browser
 * }
 * @internal
 */
export type AccountEntity = {
    homeAccountId: string;
    environment: string;
    realm: string;
    localAccountId: string;
    username: string;
    authorityType: string;
    loginHint?: string;
    clientInfo?: string;
    name?: string;
    lastModificationTime?: string;
    lastModificationApp?: string;
    cloudGraphHostName?: string;
    msGraphHost?: string;
    nativeAccountId?: string;
    tenantProfiles?: Array<TenantProfile>;
    /** Timestamp when the entry was last updated */
    lastUpdatedAt: string;
    dataBoundary?: DataBoundary;
    /** API identifier for telemetry to indicate which API cached this account */
    cachedByApiId?: number;
};
//# sourceMappingURL=AccountEntity.d.ts.map