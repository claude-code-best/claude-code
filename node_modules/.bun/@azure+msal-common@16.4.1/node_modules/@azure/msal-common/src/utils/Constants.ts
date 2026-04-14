/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export const SKU = "msal.js.common";
// default authority
export const DEFAULT_AUTHORITY = "https://login.microsoftonline.com/common/";
export const DEFAULT_AUTHORITY_HOST = "login.microsoftonline.com";
export const DEFAULT_COMMON_TENANT = "common";
// ADFS String
export const ADFS = "adfs";
export const DSTS = "dstsv2";
// Default AAD Instance Discovery Endpoint
export const AAD_INSTANCE_DISCOVERY_ENDPT = `${DEFAULT_AUTHORITY}discovery/instance?api-version=1.1&authorization_endpoint=`;
// CIAM URL
export const CIAM_AUTH_URL = ".ciamlogin.com";
export const AAD_TENANT_DOMAIN_SUFFIX = ".onmicrosoft.com";
// Resource delimiter - used for certain cache entries
export const RESOURCE_DELIM = "|";
// Consumer UTID
export const CONSUMER_UTID = "9188040d-6c67-4c5b-b112-36a304b66dad";
// Default scopes
export const OPENID_SCOPE = "openid";
export const PROFILE_SCOPE = "profile";
export const OFFLINE_ACCESS_SCOPE = "offline_access";
export const EMAIL_SCOPE = "email";
export const CODE_GRANT_TYPE = "authorization_code";
export const S256_CODE_CHALLENGE_METHOD = "S256";
export const URL_FORM_CONTENT_TYPE =
    "application/x-www-form-urlencoded;charset=utf-8";
export const AUTHORIZATION_PENDING = "authorization_pending";
export const NOT_APPLICABLE = "N/A";
export const NOT_AVAILABLE = "Not Available";
export const FORWARD_SLASH = "/";
export const IMDS_ENDPOINT =
    "http://169.254.169.254/metadata/instance/compute/location";
export const IMDS_VERSION = "2020-06-01";
export const IMDS_TIMEOUT = 2000;
export const AZURE_REGION_AUTO_DISCOVER_FLAG = "TryAutoDetect";
export const REGIONAL_AUTH_PUBLIC_CLOUD_SUFFIX = "login.microsoft.com";
export const KNOWN_PUBLIC_CLOUDS = [
    "login.microsoftonline.com",
    "login.windows.net",
    "login.microsoft.com",
    "sts.windows.net",
];
export const SHR_NONCE_VALIDITY = 240;
export const INVALID_INSTANCE = "invalid_instance";

export const HTTP_SUCCESS: number = 200;
export const HTTP_SUCCESS_RANGE_START: number = 200;
export const HTTP_SUCCESS_RANGE_END: number = 299;
export const HTTP_REDIRECT: number = 302;
export const HTTP_CLIENT_ERROR: number = 400;
export const HTTP_CLIENT_ERROR_RANGE_START: number = 400;
export const HTTP_BAD_REQUEST: number = 400;
export const HTTP_UNAUTHORIZED: number = 401;
export const HTTP_NOT_FOUND: number = 404;
export const HTTP_REQUEST_TIMEOUT: number = 408;
export const HTTP_GONE: number = 410;
export const HTTP_TOO_MANY_REQUESTS: number = 429;
export const HTTP_CLIENT_ERROR_RANGE_END: number = 499;
export const HTTP_SERVER_ERROR: number = 500;
export const HTTP_SERVER_ERROR_RANGE_START: number = 500;
export const HTTP_SERVICE_UNAVAILABLE: number = 503;
export const HTTP_GATEWAY_TIMEOUT: number = 504;
export const HTTP_SERVER_ERROR_RANGE_END: number = 599;
export const HTTP_MULTI_SIDED_ERROR: number = 600;

export const HttpMethod = {
    GET: "GET",
    POST: "POST",
} as const;
export type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

export const OIDC_DEFAULT_SCOPES = [
    OPENID_SCOPE,
    PROFILE_SCOPE,
    OFFLINE_ACCESS_SCOPE,
];

export const OIDC_SCOPES = [...OIDC_DEFAULT_SCOPES, EMAIL_SCOPE];

/**
 * Request header names
 */
export const HeaderNames = {
    CONTENT_TYPE: "Content-Type",
    CONTENT_LENGTH: "Content-Length",
    RETRY_AFTER: "Retry-After",
    CCS_HEADER: "X-AnchorMailbox",
    WWWAuthenticate: "WWW-Authenticate",
    AuthenticationInfo: "Authentication-Info",
    X_MS_REQUEST_ID: "x-ms-request-id",
    X_MS_HTTP_VERSION: "x-ms-httpver",
} as const;
export type HeaderNames = (typeof HeaderNames)[keyof typeof HeaderNames];

/**
 * Persistent cache keys MSAL which stay while user is logged in.
 */
export const PersistentCacheKeys = {
    ACTIVE_ACCOUNT_FILTERS: "active-account-filters", // new cache entry for active_account for a more robust version for browser
} as const;
export type PersistentCacheKeys =
    (typeof PersistentCacheKeys)[keyof typeof PersistentCacheKeys];

/**
 * String constants related to AAD Authority
 */
export const AADAuthority = {
    COMMON: "common",
    ORGANIZATIONS: "organizations",
    CONSUMERS: "consumers",
} as const;
export type AADAuthority = (typeof AADAuthority)[keyof typeof AADAuthority];

/**
 * Claims request keys
 */
export const ClaimsRequestKeys = {
    ACCESS_TOKEN: "access_token",
    XMS_CC: "xms_cc",
} as const;
export type ClaimsRequestKeys =
    (typeof ClaimsRequestKeys)[keyof typeof ClaimsRequestKeys];

/**
 * we considered making this "enum" in the request instead of string, however it looks like the allowed list of
 * prompt values kept changing over past couple of years. There are some undocumented prompt values for some
 * internal partners too, hence the choice of generic "string" type instead of the "enum"
 */
export const PromptValue = {
    LOGIN: "login",
    SELECT_ACCOUNT: "select_account",
    CONSENT: "consent",
    NONE: "none",
    CREATE: "create",
    NO_SESSION: "no_session",
};

/**
 * allowed values for codeVerifier
 */
export const CodeChallengeMethodValues = {
    PLAIN: "plain",
    S256: "S256",
};

/**
 * Allowed values for response_type
 */
export const OAuthResponseType = {
    CODE: "code",
    IDTOKEN_TOKEN: "id_token token",
    IDTOKEN_TOKEN_REFRESHTOKEN: "id_token token refresh_token",
} as const;
export type OAuthResponseType =
    (typeof OAuthResponseType)[keyof typeof OAuthResponseType];

/**
 * allowed values for response_mode
 */
export const ResponseMode = {
    QUERY: "query",
    FRAGMENT: "fragment",
    FORM_POST: "form_post",
} as const;
export type ResponseMode = (typeof ResponseMode)[keyof typeof ResponseMode];

/**
 * allowed grant_type
 */
export const GrantType = {
    IMPLICIT_GRANT: "implicit",
    AUTHORIZATION_CODE_GRANT: "authorization_code",
    CLIENT_CREDENTIALS_GRANT: "client_credentials",
    RESOURCE_OWNER_PASSWORD_GRANT: "password",
    REFRESH_TOKEN_GRANT: "refresh_token",
    DEVICE_CODE_GRANT: "device_code",
    JWT_BEARER: "urn:ietf:params:oauth:grant-type:jwt-bearer",
} as const;
export type GrantType = (typeof GrantType)[keyof typeof GrantType];

/**
 * Account types in Cache
 */
export const CACHE_ACCOUNT_TYPE_MSSTS: string = "MSSTS";
export const CACHE_ACCOUNT_TYPE_ADFS: string = "ADFS";
export const CACHE_ACCOUNT_TYPE_MSAV1: string = "MSA";
export const CACHE_ACCOUNT_TYPE_GENERIC: string = "Generic";

/**
 * Separators used in cache
 */
export const CACHE_KEY_SEPARATOR: string = "-";
export const CLIENT_INFO_SEPARATOR: string = ".";

/**
 * Credential Type stored in the cache
 */
export const CredentialType = {
    ID_TOKEN: "IdToken",
    ACCESS_TOKEN: "AccessToken",
    ACCESS_TOKEN_WITH_AUTH_SCHEME: "AccessToken_With_AuthScheme",
    REFRESH_TOKEN: "RefreshToken",
} as const;
export type CredentialType =
    (typeof CredentialType)[keyof typeof CredentialType];

/**
 * Combine all cache types
 */
export const CacheType = {
    ADFS: 1001,
    MSA: 1002,
    MSSTS: 1003,
    GENERIC: 1004,
    ACCESS_TOKEN: 2001,
    REFRESH_TOKEN: 2002,
    ID_TOKEN: 2003,
    APP_METADATA: 3001,
    UNDEFINED: 9999,
} as const;
export type CacheType = (typeof CacheType)[keyof typeof CacheType];

/**
 * More Cache related constants
 */
export const APP_METADATA: string = "appmetadata";
export const CLIENT_INFO: string = "client_info";
export const THE_FAMILY_ID: string = "1";

export const AUTHORITY_METADATA_CACHE_KEY: string = "authority-metadata";
export const AUTHORITY_METADATA_REFRESH_TIME_SECONDS: number = 3600 * 24; // 24 Hours

export const AuthorityMetadataSource = {
    CONFIG: "config",
    CACHE: "cache",
    NETWORK: "network",
    HARDCODED_VALUES: "hardcoded_values",
} as const;
export type AuthorityMetadataSource =
    (typeof AuthorityMetadataSource)[keyof typeof AuthorityMetadataSource];

export const SERVER_TELEM_SCHEMA_VERSION: number = 5;
export const SERVER_TELEM_MAX_CUR_HEADER_BYTES: number = 80; // ESTS limit is 100B, set to 80 to provide a 20B buffer
export const SERVER_TELEM_MAX_LAST_HEADER_BYTES: number = 330; // ESTS limit is 350B, set to 330 to provide a 20B buffer,
export const SERVER_TELEM_MAX_CACHED_ERRORS: number = 50; // Limit the number of errors that can be stored to prevent uncontrolled size gains
export const SERVER_TELEM_CACHE_KEY: string = "server-telemetry";
export const SERVER_TELEM_CATEGORY_SEPARATOR: string = "|";
export const SERVER_TELEM_VALUE_SEPARATOR: string = ",";
export const SERVER_TELEM_OVERFLOW_TRUE: string = "1";
export const SERVER_TELEM_OVERFLOW_FALSE: string = "0";
export const SERVER_TELEM_UNKNOWN_ERROR: string = "unknown_error";

/**
 * Type of the authentication request
 */
export const AuthenticationScheme = {
    BEARER: "Bearer",
    POP: "pop",
    SSH: "ssh-cert",
} as const;
export type AuthenticationScheme =
    (typeof AuthenticationScheme)[keyof typeof AuthenticationScheme];

/**
 * Constants related to throttling
 */
export const DEFAULT_THROTTLE_TIME_SECONDS: number = 60;
// Default maximum time to throttle in seconds, overrides what the server sends back
export const DEFAULT_MAX_THROTTLE_TIME_SECONDS: number = 3600;
// Prefix for storing throttling entries
export const THROTTLING_PREFIX: string = "throttling";
// Value assigned to the x-ms-lib-capability header to indicate to the server the library supports throttling
export const X_MS_LIB_CAPABILITY_VALUE: string = "retry-after, h429";

/**
 * Errors
 */
export const INVALID_GRANT_ERROR: string = "invalid_grant";
export const CLIENT_MISMATCH_ERROR: string = "client_mismatch";

/**
 * Password grant parameters
 */
export const PasswordGrantConstants = {
    username: "username",
    password: "password",
} as const;
export type PasswordGrantConstants =
    (typeof PasswordGrantConstants)[keyof typeof PasswordGrantConstants];

/**
 * Region Discovery Sources
 */
export const RegionDiscoverySources = {
    FAILED_AUTO_DETECTION: "1",
    INTERNAL_CACHE: "2",
    ENVIRONMENT_VARIABLE: "3",
    IMDS: "4",
} as const;
export type RegionDiscoverySources =
    (typeof RegionDiscoverySources)[keyof typeof RegionDiscoverySources];

/**
 * Region Discovery Outcomes
 */
export const RegionDiscoveryOutcomes = {
    CONFIGURED_MATCHES_DETECTED: "1",
    CONFIGURED_NO_AUTO_DETECTION: "2",
    CONFIGURED_NOT_DETECTED: "3",
    AUTO_DETECTION_REQUESTED_SUCCESSFUL: "4",
    AUTO_DETECTION_REQUESTED_FAILED: "5",
} as const;
export type RegionDiscoveryOutcomes =
    (typeof RegionDiscoveryOutcomes)[keyof typeof RegionDiscoveryOutcomes];

/**
 * Specifies the reason for fetching the access token from the identity provider
 */
export const CacheOutcome = {
    // When a token is found in the cache or the cache is not supposed to be hit when making the request
    NOT_APPLICABLE: "0",
    // When the token request goes to the identity provider because force_refresh was set to true. Also occurs if claims were requested
    FORCE_REFRESH_OR_CLAIMS: "1",
    // When the token request goes to the identity provider because no cached access token exists
    NO_CACHED_ACCESS_TOKEN: "2",
    // When the token request goes to the identity provider because cached access token expired
    CACHED_ACCESS_TOKEN_EXPIRED: "3",
    // When the token request goes to the identity provider because refresh_in was used and the existing token needs to be refreshed
    PROACTIVELY_REFRESHED: "4",
} as const;
export type CacheOutcome = (typeof CacheOutcome)[keyof typeof CacheOutcome];

export const JsonWebTokenTypes = {
    Jwt: "JWT",
    Jwk: "JWK",
    Pop: "pop",
} as const;
export type JsonWebTokenTypes =
    (typeof JsonWebTokenTypes)[keyof typeof JsonWebTokenTypes];

export const ONE_DAY_IN_MS = 86400000;

// Token renewal offset default in seconds
export const DEFAULT_TOKEN_RENEWAL_OFFSET_SEC = 300;

export const EncodingTypes = {
    BASE64: "base64",
    HEX: "hex",
    UTF8: "utf-8",
} as const;
export type EncodingTypes = (typeof EncodingTypes)[keyof typeof EncodingTypes];
