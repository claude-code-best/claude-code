/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    Logger,
    IPerformanceClient,
    invoke,
    Authority,
    CommonAuthorizationUrlRequest,
} from "@azure/msal-common/browser";
import * as BrowserPerformanceEvents from "../telemetry/BrowserPerformanceEvents.js";
import {
    createBrowserAuthError,
    BrowserAuthErrorCodes,
} from "../error/BrowserAuthError.js";
import { BrowserConfiguration } from "../config/Configuration.js";
import { getCodeForm, getEARForm } from "../protocol/Authorize.js";

/**
 * Creates a hidden iframe to given URL using user-requested scopes as an id.
 * @param urlNavigate
 * @param userRequestScopes
 */
export async function initiateCodeRequest(
    requestUrl: string,
    performanceClient: IPerformanceClient,
    logger: Logger,
    correlationId: string
): Promise<HTMLIFrameElement> {
    if (!requestUrl) {
        // Throw error if request URL is empty.
        logger.info("Navigate url is empty", correlationId);
        throw createBrowserAuthError(BrowserAuthErrorCodes.emptyNavigateUri);
    }

    return invoke(
        loadFrameSync,
        BrowserPerformanceEvents.SilentHandlerLoadFrameSync,
        logger,
        performanceClient,
        correlationId
    )(requestUrl);
}

export async function initiateCodeFlowWithPost(
    config: BrowserConfiguration,
    authority: Authority,
    request: CommonAuthorizationUrlRequest,
    logger: Logger,
    performanceClient: IPerformanceClient
): Promise<HTMLIFrameElement> {
    const frame = createHiddenIframe();
    if (!frame.contentDocument) {
        throw "No document associated with iframe!";
    }
    const form = await getCodeForm(
        frame.contentDocument,
        config,
        authority,
        request,
        logger,
        performanceClient
    );
    form.submit();
    return frame;
}

export async function initiateEarRequest(
    config: BrowserConfiguration,
    authority: Authority,
    request: CommonAuthorizationUrlRequest,
    logger: Logger,
    performanceClient: IPerformanceClient
): Promise<HTMLIFrameElement> {
    const frame = createHiddenIframe();
    if (!frame.contentDocument) {
        throw "No document associated with iframe!";
    }
    const form = await getEARForm(
        frame.contentDocument,
        config,
        authority,
        request,
        logger,
        performanceClient
    );
    form.submit();
    return frame;
}

/**
 * @hidden
 * Loads the iframe synchronously when the navigateTimeFrame is set to `0`
 * @param urlNavigate
 * @param frameName
 * @param logger
 */
function loadFrameSync(urlNavigate: string): HTMLIFrameElement {
    const frameHandle = createHiddenIframe();

    frameHandle.src = urlNavigate;

    return frameHandle;
}

/**
 * @hidden
 * Creates a new hidden iframe or gets an existing one for silent token renewal.
 * @ignore
 */
function createHiddenIframe(): HTMLIFrameElement {
    const authFrame = document.createElement("iframe");

    authFrame.className = "msalSilentIframe";
    authFrame.style.visibility = "hidden";
    authFrame.style.position = "absolute";
    authFrame.style.width = authFrame.style.height = "0";
    authFrame.style.border = "0";
    authFrame.setAttribute(
        "sandbox",
        "allow-scripts allow-same-origin allow-forms"
    );
    authFrame.setAttribute("allow", "local-network-access *");
    document.body.appendChild(authFrame);

    return authFrame;
}

/**
 * @hidden
 * Removes a hidden iframe from `document.body` if it is a direct child.
 * @param iframe - The iframe element to remove.
 */
export function removeHiddenIframe(iframe: HTMLIFrameElement): void {
    if (document.body === iframe.parentNode) {
        document.body.removeChild(iframe);
    }
}
