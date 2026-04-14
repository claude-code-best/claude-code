/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CommonEndSessionRequest } from "@azure/msal-common/browser";
import { PopupWindowAttributes } from "./PopupWindowAttributes.js";

/**
 * EndSessionPopupRequest
 */
export type EndSessionPopupRequest = Partial<CommonEndSessionRequest> & {
    /**
     * Authority to send logout request to.
     */
    authority?: string;
    /**
     * URI to navigate the main window to after logout is complete
     */
    mainWindowRedirectUri?: string;
    /**
     * Optional popup window attributes. popupSize with height and width, and popupPosition with top and left can be set.
     */
    popupWindowAttributes?: PopupWindowAttributes;
    /**
     * Optional window object to use as the parent when opening popup windows. Uses global `window` if not given.
     */
    popupWindowParent?: Window;
};
