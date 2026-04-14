/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as ClientAssertionUtils from "./utils/ClientAssertionUtils.js";

export { ClientAssertionUtils };

export {
    IAppTokenProvider,
    AppTokenProviderParameters,
    AppTokenProviderResult,
} from "./config/AppTokenProvider.js";
export { INativeBrokerPlugin } from "./broker/nativeBroker/INativeBrokerPlugin.js";
export { ICachePlugin } from "./cache/interface/ICachePlugin.js";
export { TokenCacheContext } from "./cache/persistence/TokenCacheContext.js";
export { ISerializableTokenCache } from "./cache/interface/ISerializableTokenCache.js";
export { NativeRequest } from "./request/NativeRequest.js";
export { NativeSignOutRequest } from "./request/NativeSignOutRequest.js";
export {
    ClientAssertion,
    ClientAssertionConfig,
    ClientAssertionCallback,
} from "./account/ClientCredentials.js";
export {
    DeviceCodeResponse,
    ServerDeviceCodeResponse,
} from "./response/DeviceCodeResponse.js";
export { getClientAssertion } from "./utils/ClientAssertionUtils.js";
export { IGuidGenerator } from "./crypto/IGuidGenerator.js";
export { StubPerformanceClient } from "./telemetry/performance/StubPerformanceClient.js";
export {
    buildClientConfiguration,
    CommonClientConfiguration,
} from "./config/ClientConfiguration.js";
