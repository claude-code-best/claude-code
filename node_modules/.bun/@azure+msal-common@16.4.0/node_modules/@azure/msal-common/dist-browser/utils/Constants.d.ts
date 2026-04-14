export declare const SKU = "msal.js.common";
export declare const DEFAULT_AUTHORITY = "https://login.microsoftonline.com/common/";
export declare const DEFAULT_AUTHORITY_HOST = "login.microsoftonline.com";
export declare const DEFAULT_COMMON_TENANT = "common";
export declare const ADFS = "adfs";
export declare const DSTS = "dstsv2";
export declare const AAD_INSTANCE_DISCOVERY_ENDPT: string;
export declare const CIAM_AUTH_URL = ".ciamlogin.com";
export declare const AAD_TENANT_DOMAIN_SUFFIX = ".onmicrosoft.com";
export declare const RESOURCE_DELIM = "|";
export declare const CONSUMER_UTID = "9188040d-6c67-4c5b-b112-36a304b66dad";
export declare const OPENID_SCOPE = "openid";
export declare const PROFILE_SCOPE = "profile";
export declare const OFFLINE_ACCESS_SCOPE = "offline_access";
export declare const EMAIL_SCOPE = "email";
export declare const CODE_GRANT_TYPE = "authorization_code";
export declare const S256_CODE_CHALLENGE_METHOD = "S256";
export declare const URL_FORM_CONTENT_TYPE = "application/x-www-form-urlencoded;charset=utf-8";
export declare const AUTHORIZATION_PENDING = "authorization_pending";
export declare const NOT_APPLICABLE = "N/A";
export declare const NOT_AVAILABLE = "Not Available";
export declare const FORWARD_SLASH = "/";
export declare const IMDS_ENDPOINT = "http://169.254.169.254/metadata/instance/compute/location";
export declare const IMDS_VERSION = "2020-06-01";
export declare const IMDS_TIMEOUT = 2000;
export declare const AZURE_REGION_AUTO_DISCOVER_FLAG = "TryAutoDetect";
export declare const REGIONAL_AUTH_PUBLIC_CLOUD_SUFFIX = "login.microsoft.com";
export declare const KNOWN_PUBLIC_CLOUDS: string[];
export declare const SHR_NONCE_VALIDITY = 240;
export declare const INVALID_INSTANCE = "invalid_instance";
export declare const HTTP_SUCCESS: number;
export declare const HTTP_SUCCESS_RANGE_START: number;
export declare const HTTP_SUCCESS_RANGE_END: number;
export declare const HTTP_REDIRECT: number;
export declare const HTTP_CLIENT_ERROR: number;
export declare const HTTP_CLIENT_ERROR_RANGE_START: number;
export declare const HTTP_BAD_REQUEST: number;
export declare const HTTP_UNAUTHORIZED: number;
export declare const HTTP_NOT_FOUND: number;
export declare const HTTP_REQUEST_TIMEOUT: number;
export declare const HTTP_GONE: number;
export declare const HTTP_TOO_MANY_REQUESTS: number;
export declare const HTTP_CLIENT_ERROR_RANGE_END: number;
export declare const HTTP_SERVER_ERROR: number;
export declare const HTTP_SERVER_ERROR_RANGE_START: number;
export declare const HTTP_SERVICE_UNAVAILABLE: number;
export declare const HTTP_GATEWAY_TIMEOUT: number;
export declare const HTTP_SERVER_ERROR_RANGE_END: number;
export declare const HTTP_MULTI_SIDED_ERROR: number;
export declare const HttpMethod: {
    readonly GET: "GET";
    readonly POST: "POST";
};
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];
export declare const OIDC_DEFAULT_SCOPES: string[];
export declare const OIDC_SCOPES: string[];
/**
 * Request header names
 */
export declare const HeaderNames: {
    readonly CONTENT_TYPE: "Content-Type";
    readonly CONTENT_LENGTH: "Content-Length";
    readonly RETRY_AFTER: "Retry-After";
    readonly CCS_HEADER: "X-AnchorMailbox";
    readonly WWWAuthenticate: "WWW-Authenticate";
    readonly AuthenticationInfo: "Authentication-Info";
    readonly X_MS_REQUEST_ID: "x-ms-request-id";
    readonly X_MS_HTTP_VERSION: "x-ms-httpver";
};
export type HeaderNames = (typeof HeaderNames)[keyof typeof HeaderNames];
/**
 * Persistent cache keys MSAL which stay while user is logged in.
 */
export declare const PersistentCacheKeys: {
    readonly ACTIVE_ACCOUNT_FILTERS: "active-account-filters";
};
export type PersistentCacheKeys = (typeof PersistentCacheKeys)[keyof typeof PersistentCacheKeys];
/**
 * String constants related to AAD Authority
 */
export declare const AADAuthority: {
    readonly COMMON: "common";
    readonly ORGANIZATIONS: "organizations";
    readonly CONSUMERS: "consumers";
};
export type AADAuthority = (typeof AADAuthority)[keyof typeof AADAuthority];
/**
 * Claims request keys
 */
export declare const ClaimsRequestKeys: {
    readonly ACCESS_TOKEN: "access_token";
    readonly XMS_CC: "xms_cc";
};
export type ClaimsRequestKeys = (typeof ClaimsRequestKeys)[keyof typeof ClaimsRequestKeys];
/**
 * we considered making this "enum" in the request instead of string, however it looks like the allowed list of
 * prompt values kept changing over past couple of years. There are some undocumented prompt values for some
 * internal partners too, hence the choice of generic "string" type instead of the "enum"
 */
export declare const PromptValue: {
    LOGIN: string;
    SELECT_ACCOUNT: string;
    CONSENT: string;
    NONE: string;
    CREATE: string;
    NO_SESSION: string;
};
/**
 * allowed values for codeVerifier
 */
export declare const CodeChallengeMethodValues: {
    PLAIN: string;
    S256: string;
};
/**
 * Allowed values for response_type
 */
export declare const OAuthResponseType: {
    readonly CODE: "code";
    readonly IDTOKEN_TOKEN: "id_token token";
    readonly IDTOKEN_TOKEN_REFRESHTOKEN: "id_token token refresh_token";
};
export type OAuthResponseType = (typeof OAuthResponseType)[keyof typeof OAuthResponseType];
/**
 * allowed values for response_mode
 */
export declare const ResponseMode: {
    readonly QUERY: "query";
    readonly FRAGMENT: "fragment";
    readonly FORM_POST: "form_post";
};
export type ResponseMode = (typeof ResponseMode)[keyof typeof ResponseMode];
/**
 * allowed grant_type
 */
export declare const GrantType: {
    readonly IMPLICIT_GRANT: "implicit";
    readonly AUTHORIZATION_CODE_GRANT: "authorization_code";
    readonly CLIENT_CREDENTIALS_GRANT: "client_credentials";
    readonly RESOURCE_OWNER_PASSWORD_GRANT: "password";
    readonly REFRESH_TOKEN_GRANT: "refresh_token";
    readonly DEVICE_CODE_GRANT: "device_code";
    readonly JWT_BEARER: "urn:ietf:params:oauth:grant-type:jwt-bearer";
};
export type GrantType = (typeof GrantType)[keyof typeof GrantType];
/**
 * Account types in Cache
 */
export declare const CACHE_ACCOUNT_TYPE_MSSTS: string;
export declare const CACHE_ACCOUNT_TYPE_ADFS: string;
export declare const CACHE_ACCOUNT_TYPE_MSAV1: string;
export declare const CACHE_ACCOUNT_TYPE_GENERIC: string;
/**
 * Separators used in cache
 */
export declare const CACHE_KEY_SEPARATOR: string;
export declare const CLIENT_INFO_SEPARATOR: string;
/**
 * Credential Type stored in the cache
 */
export declare const CredentialType: {
    readonly ID_TOKEN: "IdToken";
    readonly ACCESS_TOKEN: "AccessToken";
    readonly ACCESS_TOKEN_WITH_AUTH_SCHEME: "AccessToken_With_AuthScheme";
    readonly REFRESH_TOKEN: "RefreshToken";
};
export type CredentialType = (typeof CredentialType)[keyof typeof CredentialType];
/**
 * Combine all cache types
 */
export declare const CacheType: {
    readonly ADFS: 1001;
    readonly MSA: 1002;
    readonly MSSTS: 1003;
    readonly GENERIC: 1004;
    readonly ACCESS_TOKEN: 2001;
    readonly REFRESH_TOKEN: 2002;
    readonly ID_TOKEN: 2003;
    readonly APP_METADATA: 3001;
    readonly UNDEFINED: 9999;
};
export type CacheType = (typeof CacheType)[keyof typeof CacheType];
/**
 * More Cache related constants
 */
export declare const APP_METADATA: string;
export declare const CLIENT_INFO: string;
export declare const THE_FAMILY_ID: string;
export declare const AUTHORITY_METADATA_CACHE_KEY: string;
export declare const AUTHORITY_METADATA_REFRESH_TIME_SECONDS: number;
export declare const AuthorityMetadataSource: {
    readonly CONFIG: "config";
    readonly CACHE: "cache";
    readonly NETWORK: "network";
    readonly HARDCODED_VALUES: "hardcoded_values";
};
export type AuthorityMetadataSource = (typeof AuthorityMetadataSource)[keyof typeof AuthorityMetadataSource];
export declare const SERVER_TELEM_SCHEMA_VERSION: number;
export declare const SERVER_TELEM_MAX_CUR_HEADER_BYTES: number;
export declare const SERVER_TELEM_MAX_LAST_HEADER_BYTES: number;
export declare const SERVER_TELEM_MAX_CACHED_ERRORS: number;
export declare const SERVER_TELEM_CACHE_KEY: string;
export declare const SERVER_TELEM_CATEGORY_SEPARATOR: string;
export declare const SERVER_TELEM_VALUE_SEPARATOR: string;
export declare const SERVER_TELEM_OVERFLOW_TRUE: string;
export declare const SERVER_TELEM_OVERFLOW_FALSE: string;
export declare const SERVER_TELEM_UNKNOWN_ERROR: string;
/**
 * Type of the authentication request
 */
export declare const AuthenticationScheme: {
    readonly BEARER: "Bearer";
    readonly POP: "pop";
    readonly SSH: "ssh-cert";
};
export type AuthenticationScheme = (typeof AuthenticationScheme)[keyof typeof AuthenticationScheme];
/**
 * Constants related to throttling
 */
export declare const DEFAULT_THROTTLE_TIME_SECONDS: number;
export declare const DEFAULT_MAX_THROTTLE_TIME_SECONDS: number;
export declare const THROTTLING_PREFIX: string;
export declare const X_MS_LIB_CAPABILITY_VALUE: string;
/**
 * Errors
 */
export declare const INVALID_GRANT_ERROR: string;
export declare const CLIENT_MISMATCH_ERROR: string;
/**
 * Password grant parameters
 */
export declare const PasswordGrantConstants: {
    readonly username: "username";
    readonly password: "password";
};
export type PasswordGrantConstants = (typeof PasswordGrantConstants)[keyof typeof PasswordGrantConstants];
/**
 * Region Discovery Sources
 */
export declare const RegionDiscoverySources: {
    readonly FAILED_AUTO_DETECTION: "1";
    readonly INTERNAL_CACHE: "2";
    readonly ENVIRONMENT_VARIABLE: "3";
    readonly IMDS: "4";
};
export type RegionDiscoverySources = (typeof RegionDiscoverySources)[keyof typeof RegionDiscoverySources];
/**
 * Region Discovery Outcomes
 */
export declare const RegionDiscoveryOutcomes: {
    readonly CONFIGURED_MATCHES_DETECTED: "1";
    readonly CONFIGURED_NO_AUTO_DETECTION: "2";
    readonly CONFIGURED_NOT_DETECTED: "3";
    readonly AUTO_DETECTION_REQUESTED_SUCCESSFUL: "4";
    readonly AUTO_DETECTION_REQUESTED_FAILED: "5";
};
export type RegionDiscoveryOutcomes = (typeof RegionDiscoveryOutcomes)[keyof typeof RegionDiscoveryOutcomes];
/**
 * Specifies the reason for fetching the access token from the identity provider
 */
export declare const CacheOutcome: {
    readonly NOT_APPLICABLE: "0";
    readonly FORCE_REFRESH_OR_CLAIMS: "1";
    readonly NO_CACHED_ACCESS_TOKEN: "2";
    readonly CACHED_ACCESS_TOKEN_EXPIRED: "3";
    readonly PROACTIVELY_REFRESHED: "4";
};
export type CacheOutcome = (typeof CacheOutcome)[keyof typeof CacheOutcome];
export declare const JsonWebTokenTypes: {
    readonly Jwt: "JWT";
    readonly Jwk: "JWK";
    readonly Pop: "pop";
};
export type JsonWebTokenTypes = (typeof JsonWebTokenTypes)[keyof typeof JsonWebTokenTypes];
export declare const ONE_DAY_IN_MS = 86400000;
export declare const DEFAULT_TOKEN_RENEWAL_OFFSET_SEC = 300;
export declare const EncodingTypes: {
    readonly BASE64: "base64";
    readonly HEX: "hex";
    readonly UTF8: "utf-8";
};
export type EncodingTypes = (typeof EncodingTypes)[keyof typeof EncodingTypes];
//# sourceMappingURL=Constants.d.ts.map