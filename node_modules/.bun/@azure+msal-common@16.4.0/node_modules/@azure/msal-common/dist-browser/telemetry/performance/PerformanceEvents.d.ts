/**
 * Time spent sending/waiting for the response of a request to the token endpoint
 */
export declare const NetworkClientSendPostRequestAsync = "networkClientSendPostRequestAsync";
export declare const RefreshTokenClientExecutePostToTokenEndpoint = "refreshTokenClientExecutePostToTokenEndpoint";
export declare const AuthorizationCodeClientExecutePostToTokenEndpoint = "authorizationCodeClientExecutePostToTokenEndpoint";
/**
 * Time spent on the network for refresh token acquisition
 */
export declare const RefreshTokenClientExecuteTokenRequest = "refreshTokenClientExecuteTokenRequest";
/**
 * Time taken for acquiring refresh token , records RT size
 */
export declare const RefreshTokenClientAcquireToken = "refreshTokenClientAcquireToken";
/**
 * Time taken for acquiring cached refresh token
 */
export declare const RefreshTokenClientAcquireTokenWithCachedRefreshToken = "refreshTokenClientAcquireTokenWithCachedRefreshToken";
/**
 * Helper function to create token request body in RefreshTokenClient (msal-common).
 */
export declare const RefreshTokenClientCreateTokenRequestBody = "refreshTokenClientCreateTokenRequestBody";
export declare const SilentFlowClientGenerateResultFromCacheRecord = "silentFlowClientGenerateResultFromCacheRecord";
/**
 * getAuthCodeUrl API (msal-browser and msal-node).
 */
export declare const GetAuthCodeUrl = "getAuthCodeUrl";
/**
 * Functions from InteractionHandler (msal-browser)
 */
export declare const HandleCodeResponseFromServer = "handleCodeResponseFromServer";
/**
 * APIs in Authorization Code Client (msal-common)
 */
export declare const AuthClientExecuteTokenRequest = "authClientExecuteTokenRequest";
export declare const AuthClientCreateTokenRequestBody = "authClientCreateTokenRequestBody";
export declare const UpdateTokenEndpointAuthority = "updateTokenEndpointAuthority";
/**
 * Generate functions in PopTokenGenerator (msal-common)
 */
export declare const PopTokenGenerateCnf = "popTokenGenerateCnf";
/**
 * handleServerTokenResponse API in ResponseHandler (msal-common)
 */
export declare const HandleServerTokenResponse = "handleServerTokenResponse";
/**
 * Authority functions
 */
export declare const AuthorityResolveEndpointsAsync = "authorityResolveEndpointsAsync";
export declare const AuthorityGetCloudDiscoveryMetadataFromNetwork = "authorityGetCloudDiscoveryMetadataFromNetwork";
export declare const AuthorityUpdateCloudDiscoveryMetadata = "authorityUpdateCloudDiscoveryMetadata";
export declare const AuthorityGetEndpointMetadataFromNetwork = "authorityGetEndpointMetadataFromNetwork";
export declare const AuthorityUpdateEndpointMetadata = "authorityUpdateEndpointMetadata";
export declare const AuthorityUpdateMetadataWithRegionalInformation = "authorityUpdateMetadataWithRegionalInformation";
/**
 * Region Discovery functions
 */
export declare const RegionDiscoveryDetectRegion = "regionDiscoveryDetectRegion";
export declare const RegionDiscoveryGetRegionFromIMDS = "regionDiscoveryGetRegionFromIMDS";
export declare const RegionDiscoveryGetCurrentVersion = "regionDiscoveryGetCurrentVersion";
/**
 * Cache operations
 */
export declare const CacheManagerGetRefreshToken = "cacheManagerGetRefreshToken";
export declare const SetUserData = "setUserData";
//# sourceMappingURL=PerformanceEvents.d.ts.map