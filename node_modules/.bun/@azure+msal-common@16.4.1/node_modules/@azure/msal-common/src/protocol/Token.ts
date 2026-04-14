/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CcsCredential, CcsCredentialType } from "../account/CcsCredential.js";
import { buildClientInfoFromHomeAccountId } from "../account/ClientInfo.js";
import { Logger } from "../logger/Logger.js";
import { BaseAuthRequest } from "../request/BaseAuthRequest.js";
import { HeaderNames, URL_FORM_CONTENT_TYPE } from "../utils/Constants.js";
import * as RequestParameterBuilder from "../request/RequestParameterBuilder.js";
import * as UrlUtils from "../utils/UrlUtils.js";
import { IPerformanceClient } from "../exports-browser-only.js";
import { ServerAuthorizationTokenResponse } from "../response/ServerAuthorizationTokenResponse.js";
import { RequestThumbprint } from "../network/RequestThumbprint.js";
import {
    INetworkModule,
    NetworkRequestOptions,
} from "../network/INetworkModule.js";
import { NetworkResponse } from "../network/NetworkResponse.js";
import { ThrottlingUtils } from "../network/ThrottlingUtils.js";
import { NetworkError } from "../error/NetworkError.js";
import { AuthError } from "../error/AuthError.js";
import {
    ClientAuthErrorCodes,
    createClientAuthError,
} from "../error/ClientAuthError.js";
import { invokeAsync } from "../utils/FunctionWrappers.js";
import * as PerformanceEvents from "../telemetry/performance/PerformanceEvents.js";
import { CacheManager } from "../cache/CacheManager.js";
import { ServerTelemetryManager } from "../telemetry/server/ServerTelemetryManager.js";

/**
 * Creates default headers for requests to token endpoint
 */
export function createTokenRequestHeaders(
    logger: Logger,
    preventCorsPreflight: boolean,
    ccsCred?: CcsCredential
): Record<string, string> {
    const headers: Record<string, string> = {};
    headers[HeaderNames.CONTENT_TYPE] = URL_FORM_CONTENT_TYPE;
    if (!preventCorsPreflight && ccsCred) {
        switch (ccsCred.type) {
            case CcsCredentialType.HOME_ACCOUNT_ID:
                try {
                    const clientInfo = buildClientInfoFromHomeAccountId(
                        ccsCred.credential
                    );
                    headers[
                        HeaderNames.CCS_HEADER
                    ] = `Oid:${clientInfo.uid}@${clientInfo.utid}`;
                } catch (e) {
                    logger.verbose(
                        `Could not parse home account ID for CCS Header: '${e}'`,
                        ""
                    );
                }
                break;
            case CcsCredentialType.UPN:
                headers[HeaderNames.CCS_HEADER] = `UPN: ${ccsCred.credential}`;
                break;
        }
    }
    return headers;
}

/**
 * Creates query string for the /token request
 * @param request
 */
export function createTokenQueryParameters(
    request: BaseAuthRequest,
    clientId: string,
    redirectUri: string,
    performanceClient: IPerformanceClient
): string {
    const parameters = new Map<string, string>();

    if (request.embeddedClientId) {
        RequestParameterBuilder.addBrokerParameters(
            parameters,
            clientId,
            redirectUri
        );
    }

    if (request.extraQueryParameters) {
        RequestParameterBuilder.addExtraParameters(
            parameters,
            request.extraQueryParameters
        );
    }

    RequestParameterBuilder.addCorrelationId(parameters, request.correlationId);

    RequestParameterBuilder.instrumentBrokerParams(
        parameters,
        request.correlationId,
        performanceClient
    );
    return UrlUtils.mapToQueryString(parameters);
}

/**
 * Http post to token endpoint
 * @param tokenEndpoint
 * @param queryString
 * @param headers
 * @param thumbprint
 */
export async function executePostToTokenEndpoint(
    tokenEndpoint: string,
    queryString: string,
    headers: Record<string, string>,
    thumbprint: RequestThumbprint,
    correlationId: string,
    cacheManager: CacheManager,
    networkClient: INetworkModule,
    logger: Logger,
    performanceClient: IPerformanceClient,
    serverTelemetryManager: ServerTelemetryManager | null
): Promise<NetworkResponse<ServerAuthorizationTokenResponse>> {
    const response = await sendPostRequest<ServerAuthorizationTokenResponse>(
        thumbprint,
        tokenEndpoint,
        { body: queryString, headers: headers },
        correlationId,
        cacheManager,
        networkClient,
        logger,
        performanceClient
    );

    if (
        serverTelemetryManager &&
        response.status < 500 &&
        response.status !== 429
    ) {
        // Telemetry data successfully logged by server, clear Telemetry cache
        serverTelemetryManager.clearTelemetryCache();
    }

    return response;
}

/**
 * Wraps sendPostRequestAsync with necessary preflight and postflight logic
 * @param thumbprint - Request thumbprint for throttling
 * @param tokenEndpoint - Endpoint to make the POST to
 * @param options - Body and Headers to include on the POST request
 * @param correlationId - CorrelationId for telemetry
 * @param cacheManager - Cache manager instance
 * @param networkClient - Network module instance
 * @param logger - Logger instance
 * @param performanceClient - Performance client instance
 */
export async function sendPostRequest<
    T extends ServerAuthorizationTokenResponse
>(
    thumbprint: RequestThumbprint,
    tokenEndpoint: string,
    options: NetworkRequestOptions,
    correlationId: string,
    cacheManager: CacheManager,
    networkClient: INetworkModule,
    logger: Logger,
    performanceClient: IPerformanceClient
): Promise<NetworkResponse<T>> {
    ThrottlingUtils.preProcess(cacheManager, thumbprint, correlationId);

    let response;
    try {
        response = await invokeAsync(
            networkClient.sendPostRequestAsync.bind(networkClient)<T>,
            PerformanceEvents.NetworkClientSendPostRequestAsync,
            logger,
            performanceClient,
            correlationId
        )(tokenEndpoint, options);
        const responseHeaders = response.headers || {};
        performanceClient?.addFields(
            {
                refreshTokenSize: response.body.refresh_token?.length || 0,
                httpVerToken:
                    responseHeaders[HeaderNames.X_MS_HTTP_VERSION] || "",
                requestId: responseHeaders[HeaderNames.X_MS_REQUEST_ID] || "",
            },
            correlationId
        );
    } catch (e) {
        if (e instanceof NetworkError) {
            const responseHeaders = e.responseHeaders;
            if (responseHeaders) {
                performanceClient?.addFields(
                    {
                        httpVerToken:
                            responseHeaders[HeaderNames.X_MS_HTTP_VERSION] ||
                            "",
                        requestId:
                            responseHeaders[HeaderNames.X_MS_REQUEST_ID] || "",
                        contentTypeHeader:
                            responseHeaders[HeaderNames.CONTENT_TYPE] ||
                            undefined,
                        contentLengthHeader:
                            responseHeaders[HeaderNames.CONTENT_LENGTH] ||
                            undefined,
                        httpStatus: e.httpStatus,
                    },
                    correlationId
                );
            }
            throw e.error;
        }
        if (e instanceof AuthError) {
            throw e;
        } else {
            throw createClientAuthError(ClientAuthErrorCodes.networkError);
        }
    }

    ThrottlingUtils.postProcess(
        cacheManager,
        thumbprint,
        response,
        correlationId
    );

    return response;
}
