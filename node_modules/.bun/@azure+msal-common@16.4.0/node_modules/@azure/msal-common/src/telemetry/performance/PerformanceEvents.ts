/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Time spent sending/waiting for the response of a request to the token endpoint
 */
export const NetworkClientSendPostRequestAsync =
    "networkClientSendPostRequestAsync";
export const RefreshTokenClientExecutePostToTokenEndpoint =
    "refreshTokenClientExecutePostToTokenEndpoint";
export const AuthorizationCodeClientExecutePostToTokenEndpoint =
    "authorizationCodeClientExecutePostToTokenEndpoint";

/**
 * Time spent on the network for refresh token acquisition
 */
export const RefreshTokenClientExecuteTokenRequest =
    "refreshTokenClientExecuteTokenRequest";

/**
 * Time taken for acquiring refresh token , records RT size
 */
export const RefreshTokenClientAcquireToken = "refreshTokenClientAcquireToken";

/**
 * Time taken for acquiring cached refresh token
 */
export const RefreshTokenClientAcquireTokenWithCachedRefreshToken =
    "refreshTokenClientAcquireTokenWithCachedRefreshToken";

/**
 * Helper function to create token request body in RefreshTokenClient (msal-common).
 */
export const RefreshTokenClientCreateTokenRequestBody =
    "refreshTokenClientCreateTokenRequestBody";

export const SilentFlowClientGenerateResultFromCacheRecord =
    "silentFlowClientGenerateResultFromCacheRecord";

/**
 * getAuthCodeUrl API (msal-browser and msal-node).
 */
export const GetAuthCodeUrl = "getAuthCodeUrl";

/**
 * Functions from InteractionHandler (msal-browser)
 */
export const HandleCodeResponseFromServer = "handleCodeResponseFromServer";

/**
 * APIs in Authorization Code Client (msal-common)
 */
export const AuthClientExecuteTokenRequest = "authClientExecuteTokenRequest";
export const AuthClientCreateTokenRequestBody =
    "authClientCreateTokenRequestBody";
export const UpdateTokenEndpointAuthority = "updateTokenEndpointAuthority";

/**
 * Generate functions in PopTokenGenerator (msal-common)
 */
export const PopTokenGenerateCnf = "popTokenGenerateCnf";

/**
 * handleServerTokenResponse API in ResponseHandler (msal-common)
 */
export const HandleServerTokenResponse = "handleServerTokenResponse";

/**
 * Authority functions
 */
export const AuthorityResolveEndpointsAsync = "authorityResolveEndpointsAsync";
export const AuthorityGetCloudDiscoveryMetadataFromNetwork =
    "authorityGetCloudDiscoveryMetadataFromNetwork";
export const AuthorityUpdateCloudDiscoveryMetadata =
    "authorityUpdateCloudDiscoveryMetadata";
export const AuthorityGetEndpointMetadataFromNetwork =
    "authorityGetEndpointMetadataFromNetwork";
export const AuthorityUpdateEndpointMetadata =
    "authorityUpdateEndpointMetadata";
export const AuthorityUpdateMetadataWithRegionalInformation =
    "authorityUpdateMetadataWithRegionalInformation";

/**
 * Region Discovery functions
 */
export const RegionDiscoveryDetectRegion = "regionDiscoveryDetectRegion";
export const RegionDiscoveryGetRegionFromIMDS =
    "regionDiscoveryGetRegionFromIMDS";
export const RegionDiscoveryGetCurrentVersion =
    "regionDiscoveryGetCurrentVersion";

/**
 * Cache operations
 */
export const CacheManagerGetRefreshToken = "cacheManagerGetRefreshToken";
export const SetUserData = "setUserData";
