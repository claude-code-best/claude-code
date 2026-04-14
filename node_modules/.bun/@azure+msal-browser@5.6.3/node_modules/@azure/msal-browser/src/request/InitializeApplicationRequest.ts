/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * InitializeApplicationRequest: Request object passed by user to initialize application
 */
export type InitializeApplicationRequest = {
    /**
     * Unique GUID set per request to trace a request end-to-end for telemetry purposes.
     */
    correlationId?: string;
};
