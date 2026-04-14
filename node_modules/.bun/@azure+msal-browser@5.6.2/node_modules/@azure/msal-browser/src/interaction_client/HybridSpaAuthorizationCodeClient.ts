/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    AuthorizationCodeClient,
    ClientConfiguration,
    IPerformanceClient,
} from "@azure/msal-common/browser";

export class HybridSpaAuthorizationCodeClient extends AuthorizationCodeClient {
    constructor(
        config: ClientConfiguration,
        performanceClient: IPerformanceClient
    ) {
        super(config, performanceClient);
        this.includeRedirectUri = false;
    }
}
