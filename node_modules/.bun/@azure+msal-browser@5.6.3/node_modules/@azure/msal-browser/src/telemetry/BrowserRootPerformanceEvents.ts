/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * acquireTokenSilent API (msal-browser and msal-node).
 * Used to silently acquire a new access token (from the cache or the network).
 */
export const AcquireTokenSilent = "acquireTokenSilent";
/**
 * acquireTokenByCode API (msal-browser and msal-node).
 * Used to acquire tokens by trading an authorization code against the token endpoint.
 */
export const AcquireTokenByCode = "acquireTokenByCode";
/**
 * acquireTokenPopup (msal-browser).
 * Used to acquire a new access token interactively through pop ups
 */
export const AcquireTokenPopup = "acquireTokenPopup";
/**
 * acquireTokenPreRedirect (msal-browser).
 * First part of the redirect flow.
 * Used to acquire a new access token interactively through redirects.
 */
export const AcquireTokenPreRedirect = "acquireTokenPreRedirect";
/**
 * acquireTokenRedirect (msal-browser).
 * Second part of the redirect flow.
 * Used to acquire a new access token interactively through redirects.
 */
export const AcquireTokenRedirect = "acquireTokenRedirect";
/**
 * ssoSilent API (msal-browser).
 * Used to silently acquire an authorization code and set of tokens using a hidden iframe.
 */
export const SsoSilent = "ssoSilent";
// Initialize client application
export const InitializeClientApplication = "initializeClientApplication";
// Update cache storage
export const LocalStorageUpdated = "localStorageUpdated";
// Load external tokens
export const LoadExternalTokens = "loadExternalTokens";
