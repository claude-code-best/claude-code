/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * acquireTokenFromCache (msal-browser).
 * Internal API for acquiring token from cache
 */
export const AcquireTokenFromCache = "acquireTokenFromCache";

/**
 * acquireTokenByRefreshToken API (msal-browser and msal-node).
 * Used to renew an access token using a refresh token against the token endpoint.
 */
export const AcquireTokenByRefreshToken = "acquireTokenByRefreshToken";

/**
 * acquireTokenSilentAsync (msal-browser).
 * Internal API for acquireTokenSilent.
 */
export const AcquireTokenSilentAsync = "acquireTokenSilentAsync";

/**
 * getPublicKeyThumbprint API in CryptoOpts class (msal-browser).
 * Used to generate a public/private keypair and generate a public key thumbprint for pop requests.
 */
export const CryptoOptsGetPublicKeyThumbprint =
    "cryptoOptsGetPublicKeyThumbprint";

/**
 * signJwt API in CryptoOpts class (msal-browser).
 * Used to signed a pop token.
 */
export const CryptoOptsSignJwt = "cryptoOptsSignJwt";

/**
 * acquireToken API in the SilentCacheClient class (msal-browser).
 * Used to read access tokens from the cache.
 */
export const SilentCacheClientAcquireToken = "silentCacheClientAcquireToken";

/**
 * acquireToken API in the SilentIframeClient class (msal-browser).
 * Used to acquire a new set of tokens from the authorize endpoint in a hidden iframe.
 */
export const SilentIframeClientAcquireToken = "silentIframeClientAcquireToken";

export const AwaitConcurrentIframe = "awaitConcurrentIframe"; // Time spent waiting for a concurrent iframe to complete

/**
 * acquireToken API in SilentRereshClient (msal-browser).
 * Used to acquire a new set of tokens from the token endpoint using a refresh token.
 */
export const SilentRefreshClientAcquireToken =
    "silentRefreshClientAcquireToken";

/**
 * getDiscoveredAuthority API in StandardInteractionClient class (msal-browser).
 * Used to load authority metadata for a request.
 */
export const StandardInteractionClientGetDiscoveredAuthority =
    "standardInteractionClientGetDiscoveredAuthority";

/**
 * acquireToken APIs in msal-browser.
 * Used to make an /authorize endpoint call with native brokering enabled.
 */
export const FetchAccountIdWithNativeBroker = "fetchAccountIdWithNativeBroker";

/**
 * acquireToken API in NativeInteractionClient class (msal-browser).
 * Used to acquire a token from Native component when native brokering is enabled.
 */
export const NativeInteractionClientAcquireToken =
    "nativeInteractionClientAcquireToken";

/**
 * Time spent creating default headers for requests to token endpoint
 */
export const BaseClientCreateTokenRequestHeaders =
    "baseClientCreateTokenRequestHeaders";

/**
 * acquireTokenByRefreshToken API in RefreshTokenClient (msal-common).
 */
export const RefreshTokenClientAcquireTokenByRefreshToken =
    "refreshTokenClientAcquireTokenByRefreshToken";

/**
 * acquireTokenBySilentIframe (msal-browser).
 * Internal API for acquiring token by silent Iframe
 */
export const AcquireTokenBySilentIframe = "acquireTokenBySilentIframe";

/**
 * Internal API for initializing base request in BaseInteractionClient (msal-browser)
 */
export const InitializeBaseRequest = "initializeBaseRequest";

/**
 * Internal API for initializing silent request in SilentCacheClient (msal-browser)
 */
export const InitializeSilentRequest = "initializeSilentRequest";

export const InitializeCache = "initializeCache";

/**
 * Helper function in SilentIframeClient class (msal-browser).
 */
export const SilentIframeClientTokenHelper = "silentIframeClientTokenHelper";

/**
 * SilentHandler
 */
export const SilentHandlerInitiateAuthRequest =
    "silentHandlerInitiateAuthRequest";
export const SilentHandlerMonitorIframeForHash =
    "silentHandlerMonitorIframeForHash";
export const SilentHandlerLoadFrame = "silentHandlerLoadFrame";
export const SilentHandlerLoadFrameSync = "silentHandlerLoadFrameSync";

/**
 * Helper functions in StandardInteractionClient class (msal-browser)
 */
export const StandardInteractionClientCreateAuthCodeClient =
    "standardInteractionClientCreateAuthCodeClient";
export const StandardInteractionClientGetClientConfiguration =
    "standardInteractionClientGetClientConfiguration";
export const StandardInteractionClientInitializeAuthorizationRequest =
    "standardInteractionClientInitializeAuthorizationRequest";

export const SilentFlowClientAcquireCachedToken =
    "silentFlowClientAcquireCachedToken";

export const GetStandardParams = "getStandardParams";

export const HandleCodeResponse = "handleCodeResponse";
export const HandleResponseEar = "handleResponseEar";
export const HandleResponsePlatformBroker = "handleResponsePlatformBroker";
export const HandleResponseCode = "handleResponseCode";

export const AuthClientAcquireToken = "authClientAcquireToken";

export const DeserializeResponse = "deserializeResponse";

export const AuthorityFactoryCreateDiscoveredInstance =
    "authorityFactoryCreateDiscoveredInstance";
export const AuthorityResolveEndpointsFromLocalSources =
    "authorityResolveEndpointsFromLocalSources";

export const AcquireTokenByCodeAsync = "acquireTokenByCodeAsync";

export const HandleRedirectPromiseMeasurement = "handleRedirectPromise";
export const HandleNativeRedirectPromiseMeasurement =
    "handleNativeRedirectPromise";

export const NativeMessageHandlerHandshake = "nativeMessageHandlerHandshake";
export const NativeGenerateAuthResult = "nativeGenerateAuthResult";
export const RemoveHiddenIframe = "removeHiddenIframe";

export const ImportExistingCache = "importExistingCache";
export const SetUserData = "setUserData";

/**
 * Crypto Operations
 */
export const GeneratePkceCodes = "generatePkceCodes";
export const GenerateCodeVerifier = "generateCodeVerifier";
export const GenerateCodeChallengeFromVerifier =
    "generateCodeChallengeFromVerifier";
export const Sha256Digest = "sha256Digest";
export const GetRandomValues = "getRandomValues";
export const GenerateHKDF = "generateHKDF";
export const GenerateBaseKey = "generateBaseKey";
export const Base64Decode = "base64Decode";
export const UrlEncodeArr = "urlEncodeArr";
export const Encrypt = "encrypt";
export const Decrypt = "decrypt";
export const GenerateEarKey = "generateEarKey";
export const DecryptEarResponse = "decryptEarResponse";

export const LoadAccount = "loadAccount";
export const LoadIdToken = "loadIdToken";
export const LoadAccessToken = "loadAccessToken";
export const LoadRefreshToken = "loadRefreshToken";
