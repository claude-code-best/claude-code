/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    AccountInfo,
    Constants,
    BaseAuthRequest,
    ClientConfigurationErrorCodes,
    CommonSilentFlowRequest,
    IPerformanceClient,
    Logger,
    ProtocolMode,
    createClientConfigurationError,
    invokeAsync,
} from "@azure/msal-common/browser";
import * as BrowserPerformanceEvents from "../telemetry/BrowserPerformanceEvents.js";
import { BrowserConfiguration } from "../config/Configuration.js";
import { SilentRequest } from "./SilentRequest.js";
import { PopupRequest } from "./PopupRequest.js";
import { RedirectRequest } from "./RedirectRequest.js";

/**
 * Initializer function for all request APIs
 * @param request
 * @param config
 * @param performanceClient
 * @param logger
 * @param correlationId
 */
export async function initializeBaseRequest(
    request: Partial<BaseAuthRequest> & { correlationId: string },
    config: BrowserConfiguration,
    performanceClient: IPerformanceClient,
    logger: Logger,
    correlationId: string
): Promise<BaseAuthRequest> {
    const authority = request.authority || config.auth.authority;

    const scopes = [...((request && request.scopes) || [])];

    const validatedRequest: BaseAuthRequest = {
        ...request,
        correlationId: request.correlationId,
        authority,
        scopes,
    };

    // Set authenticationScheme to BEARER if not explicitly set in the request
    if (!validatedRequest.authenticationScheme) {
        validatedRequest.authenticationScheme =
            Constants.AuthenticationScheme.BEARER;
        logger.verbose(
            'Authentication Scheme was not explicitly set in request, defaulting to "Bearer" request',
            correlationId
        );
    } else {
        if (
            validatedRequest.authenticationScheme ===
            Constants.AuthenticationScheme.SSH
        ) {
            if (!request.sshJwk) {
                throw createClientConfigurationError(
                    ClientConfigurationErrorCodes.missingSshJwk
                );
            }
            if (!request.sshKid) {
                throw createClientConfigurationError(
                    ClientConfigurationErrorCodes.missingSshKid
                );
            }
        }
        logger.verbose(
            `Authentication Scheme set to "'${validatedRequest.authenticationScheme}'" as configured in Auth request`,
            correlationId
        );
    }

    return validatedRequest;
}

export async function initializeSilentRequest(
    request: SilentRequest & { correlationId: string },
    account: AccountInfo,
    config: BrowserConfiguration,
    performanceClient: IPerformanceClient,
    logger: Logger
): Promise<CommonSilentFlowRequest> {
    const baseRequest = await invokeAsync(
        initializeBaseRequest,
        BrowserPerformanceEvents.InitializeBaseRequest,
        logger,
        performanceClient,
        request.correlationId
    )(request, config, performanceClient, logger, request.correlationId);
    return {
        ...request,
        ...baseRequest,
        account: account,
        forceRefresh: request.forceRefresh || false,
    };
}

/**
 * Validates that the combination of request method, protocol mode and authorize body parameters is correct.
 * Returns the validated or defaulted HTTP method or throws if the configured combination is invalid.
 * @param interactionRequest
 * @param protocolMode
 * @returns
 */
export function validateRequestMethod(
    interactionRequest: BaseAuthRequest | PopupRequest | RedirectRequest,
    protocolMode: ProtocolMode
): Constants.HttpMethod {
    let httpMethod: Constants.HttpMethod | undefined;
    const requestMethod = interactionRequest.httpMethod;

    if (protocolMode === ProtocolMode.EAR) {
        // Validate that method can only be POST when protocol mode is EAR
        if (requestMethod && requestMethod !== Constants.HttpMethod.POST) {
            throw createClientConfigurationError(
                ClientConfigurationErrorCodes.invalidRequestMethodForEAR
            );
        } else {
            httpMethod = Constants.HttpMethod.POST;
        }
    } else {
        // For non-EAR protocol modes, default to GET if httpMethod is not set
        httpMethod = requestMethod || Constants.HttpMethod.GET;
    }

    return httpMethod;
}
