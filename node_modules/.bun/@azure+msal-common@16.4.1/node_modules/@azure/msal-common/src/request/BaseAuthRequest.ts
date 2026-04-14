/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthenticationScheme, HttpMethod } from "../utils/Constants.js";
import type { AzureCloudOptions } from "../config/ClientConfiguration.js";
import { StringDict } from "../utils/MsalTypes.js";
import { StoreInCache } from "./StoreInCache.js";
import { ShrOptions } from "../crypto/SignedHttpRequest.js";
import { createClientAuthError } from "../error/ClientAuthError.js";
import * as ClientAuthErrorCodes from "../error/ClientAuthErrorCodes.js";

/**
 * BaseAuthRequest
 */
export type BaseAuthRequest = {
    /**
     * URL of the authority, the security token service (STS) from which MSAL will acquire tokens. Defaults to https://login.microsoftonline.com/common. If using the same authority for all request, authority should set on client application object and not request, to avoid resolving authority endpoints multiple times.
     */
    authority: string;
    /**
     * Unique GUID set per request to trace a request end-to-end for telemetry purposes.
     */
    correlationId: string;
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes: Array<string>;
    /**
     * The type of token retrieved. Defaults to "Bearer". Can also be type "pop" or "SSH".
     */
    authenticationScheme?: AuthenticationScheme;
    /**
     * A stringified claims request which will be added to all /authorize and /token calls
     */
    claims?: string;
    /**
     * A stringified claims object which will be added to a Signed HTTP Request
     */
    shrClaims?: string;
    /**
     * A server-generated timestamp that has been encrypted and base64URL encoded, which will be added to a Signed HTTP Request.
     */
    shrNonce?: string;
    /**
     * An object containing options for the Signed HTTP Request
     */
    shrOptions?: ShrOptions;
    /**
     * HTTP Request type used to request data from the resource (i.e. "GET", "POST", etc.).  Used for proof-of-possession flows.
     */
    resourceRequestMethod?: string;
    /**
     * URI that token will be used for. Used for proof-of-possession flows.
     */
    resourceRequestUri?: string;
    /**
     * A stringified JSON Web Key representing a public key that can be signed by an SSH certificate.
     */
    sshJwk?: string;
    /**
     * Key ID that uniquely identifies the SSH public key mentioned above.
     */
    sshKid?: string;
    /**
     * Convenience string enums for users to provide public/sovereign cloud ids
     */
    azureCloudOptions?: AzureCloudOptions;
    /**
     * Maximum allowed age, in milliseconds, of the user's authentication before a new sign-in is required.
     */
    maxAge?: number;
    /**
     * Object containing boolean values indicating whether to store tokens in the cache or not (default is true)
     */
    storeInCache?: StoreInCache;
    /**
     * Scenario id to track custom user prompts
     */
    scenarioId?: string;
    /**
     * Key ID to identify the public key for PoP token request
     */
    popKid?: string;
    /**
     * Embedded client id. When specified, broker client id (brk_client_id) and redirect uri (brk_redirect_uri) params are set with values from the config, overriding the corresponding extra parameters, if present.
     */
    embeddedClientId?: string;
    /**
     * HTTP method to use for the /authorize request. Defaults to GET, but can be set to POST if the request requires body parameters.
     */
    httpMethod?: HttpMethod;
    /**
     * Resource parameter to be sent with the request. Used for MCP flows.
     */
    resource?: string;
    /**
     * String to string map of custom query parameters added to outgoing token service requests. Unless the parameter is only supported on query strings use extraParameters instead
     */
    extraQueryParameters?: StringDict;
    /**
     * String to string map of custom parameters added to outgoing token service requests.
     */
    extraParameters?: StringDict;
};

/**
 * Helper to enforce resource parameter presence in token requests when isMcp is set in the configuration.
 * If resource parameter is set in both the request and in extraQueryParameters or extraParameters, an error will be thrown.
 * This is used for MCP flows.
 * @param isMcp - Flag indicating if application is an MCP app, from configuration
 * @param request - Auth request
 */
export function enforceResourceParameter(
    isMcp: boolean,
    request: Partial<BaseAuthRequest>
): void {
    if (!isMcp) {
        return;
    }

    if (
        request.resource &&
        (containsResourceParam(request.extraParameters) ||
            containsResourceParam(request.extraQueryParameters))
    ) {
        throw createClientAuthError(
            ClientAuthErrorCodes.misplacedResourceParam
        );
    }

    if (!request.resource) {
        throw createClientAuthError(
            ClientAuthErrorCodes.resourceParameterRequired
        );
    }
}

function containsResourceParam(params?: StringDict): boolean {
    if (!params) {
        return false;
    }

    return Object.prototype.hasOwnProperty.call(params, "resource");
}
