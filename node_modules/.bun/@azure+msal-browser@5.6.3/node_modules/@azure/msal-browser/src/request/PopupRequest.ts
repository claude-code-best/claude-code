/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonAuthorizationUrlRequest } from "@azure/msal-common/browser";
import { PopupWindowAttributes } from "./PopupWindowAttributes.js";

/**
 * PopupRequest: Request object passed by user to retrieve a Code from the
 * server (first leg of authorization code grant flow) with a popup window.
 */

export type PopupRequest = Partial<
    Omit<
        CommonAuthorizationUrlRequest,
        | "responseMode"
        | "scopes"
        | "earJwk"
        | "codeChallenge"
        | "codeChallengeMethod"
        | "platformBroker"
    >
> & {
    /**
     * Array of scopes the application is requesting access to.
     */
    scopes: Array<string>;
    /**
     * Optional popup window attributes. popupSize with height and width, and popupPosition with top and left can be set.
     */
    popupWindowAttributes?: PopupWindowAttributes;
    /**
     * Optional window object to use as the parent when opening popup windows. Uses global `window` if not given.
     */
    popupWindowParent?: Window;
    /**
     * Optional flag to allow overriding an existing interaction_in_progress state for popup flows. **WARNING**: Use with caution! For usage details and examples, see the [login-user.md](../../../docs/login-user.md#handling-interaction_in_progress-errors) documentation.
     */
    overrideInteractionInProgress?: boolean;
};
