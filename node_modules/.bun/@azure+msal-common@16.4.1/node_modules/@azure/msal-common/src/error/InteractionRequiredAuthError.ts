/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthError } from "./AuthError.js";
import * as InteractionRequiredAuthErrorCodes from "./InteractionRequiredAuthErrorCodes.js";
export { InteractionRequiredAuthErrorCodes };

/**
 * InteractionRequiredServerErrorMessage contains string constants used by error codes and messages returned by the server indicating interaction is required
 */
export const InteractionRequiredServerErrorMessage = [
    InteractionRequiredAuthErrorCodes.interactionRequired,
    InteractionRequiredAuthErrorCodes.consentRequired,
    InteractionRequiredAuthErrorCodes.loginRequired,
    InteractionRequiredAuthErrorCodes.badToken,
    InteractionRequiredAuthErrorCodes.uxNotAllowed,
    InteractionRequiredAuthErrorCodes.interruptedUser,
];

export const InteractionRequiredAuthSubErrorMessage = [
    "message_only",
    "additional_action",
    "basic_action",
    "user_password_expired",
    "consent_required",
    "bad_token",
    "ux_not_allowed",
    "interrupted_user",
];

/**
 * Error thrown when user interaction is required.
 */
export class InteractionRequiredAuthError extends AuthError {
    /**
     * The time the error occured at
     */
    timestamp: string;

    /**
     * TraceId associated with the error
     */
    traceId: string;

    /**
     * https://github.com/AzureAD/microsoft-authentication-library-for-js/blob/dev/lib/msal-common/docs/claims-challenge.md
     *
     * A string with extra claims needed for the token request to succeed
     * web site: redirect the user to the authorization page and set the extra claims
     * web api: include the claims in the WWW-Authenticate header that are sent back to the client so that it knows to request a token with the extra claims
     * desktop application or browser context: include the claims when acquiring the token interactively
     * app to app context (client_credentials): include the claims in the AcquireTokenByClientCredential request
     */
    claims: string;

    /**
     * Server error number;
     */
    readonly errorNo?: string;

    constructor(
        errorCode?: string,
        errorMessage?: string,
        subError?: string,
        timestamp?: string,
        traceId?: string,
        correlationId?: string,
        claims?: string,
        errorNo?: string
    ) {
        super(errorCode, errorMessage, subError);
        Object.setPrototypeOf(this, InteractionRequiredAuthError.prototype);

        this.timestamp = timestamp || "";
        this.traceId = traceId || "";
        this.correlationId = correlationId || "";
        this.claims = claims || "";
        this.name = "InteractionRequiredAuthError";
        this.errorNo = errorNo;
    }
}

/**
 * Helper function used to determine if an error thrown by the server requires interaction to resolve
 * @param errorCode
 * @param errorString
 * @param subError
 */
export function isInteractionRequiredError(
    errorCode?: string,
    errorString?: string,
    subError?: string
): boolean {
    const isInteractionRequiredErrorCode =
        !!errorCode &&
        InteractionRequiredServerErrorMessage.indexOf(errorCode) > -1;
    const isInteractionRequiredSubError =
        !!subError &&
        InteractionRequiredAuthSubErrorMessage.indexOf(subError) > -1;
    const isInteractionRequiredErrorDesc =
        !!errorString &&
        InteractionRequiredServerErrorMessage.some((irErrorCode) => {
            return errorString.indexOf(irErrorCode) > -1;
        });

    return (
        isInteractionRequiredErrorCode ||
        isInteractionRequiredErrorDesc ||
        isInteractionRequiredSubError
    );
}

/**
 * Creates an InteractionRequiredAuthError
 */
export function createInteractionRequiredAuthError(
    errorCode: string,
    errorMessage?: string
): InteractionRequiredAuthError {
    return new InteractionRequiredAuthError(errorCode, errorMessage);
}
