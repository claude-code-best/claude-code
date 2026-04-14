/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type which defines library state
 */
export type LibraryStateObject = {
    id: string;
    meta?: Record<string, string>;
};

/**
 * Type which defines the stringified and encoded state object sent to the service in the authorize request.
 */
export type RequestStateObject = {
    userRequestState: string;
    libraryState: LibraryStateObject;
};
