/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ResponseMode } from "../utils/Constants.js";

/**
 * Options for the OIDC protocol mode.
 */
export type OIDCOptions = {
    responseMode?: ResponseMode;
    defaultScopes?: Array<string>;
};
