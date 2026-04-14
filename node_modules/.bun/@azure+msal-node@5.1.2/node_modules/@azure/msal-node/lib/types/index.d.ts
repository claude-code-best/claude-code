/**
 * @packageDocumentation
 * @module @azure/msal-node
 */
/**
 * Warning: This set of exports is purely intended to be used by other MSAL libraries, and should be considered potentially unstable. We strongly discourage using them directly, you do so at your own risk.
 * Breaking changes to these APIs will be shipped under a minor version, instead of a major version.
 */
import * as internals from "./internals.js";
export { internals };
export { IPublicClientApplication } from "./client/IPublicClientApplication.js";
export { IConfidentialClientApplication } from "./client/IConfidentialClientApplication.js";
export { ITokenCache } from "./cache/ITokenCache.js";
export { ICacheClient } from "./cache/distributed/ICacheClient.js";
export { IPartitionManager } from "./cache/distributed/IPartitionManager.js";
export { ILoopbackClient } from "./network/ILoopbackClient.js";
export { PublicClientApplication } from "./client/PublicClientApplication.js";
export { ConfidentialClientApplication } from "./client/ConfidentialClientApplication.js";
export { ManagedIdentityApplication } from "./client/ManagedIdentityApplication.js";
export { Configuration, ManagedIdentityConfiguration, ManagedIdentityIdParams, NodeAuthOptions, NodeSystemOptions, BrokerOptions, NodeTelemetryOptions, CacheOptions, } from "./config/Configuration.js";
export { ClientAssertion } from "./client/ClientAssertion.js";
export { TokenCache } from "./cache/TokenCache.js";
export { CacheKVStore, JsonCache, InMemoryCache, SerializedAccountEntity, SerializedIdTokenEntity, SerializedAccessTokenEntity, SerializedAppMetadataEntity, SerializedRefreshTokenEntity, } from "./cache/serializer/SerializerTypes.js";
export { DistributedCachePlugin } from "./cache/distributed/DistributedCachePlugin.js";
export { ManagedIdentitySourceNames } from "./utils/Constants.js";
export type { AuthorizationCodeRequest } from "./request/AuthorizationCodeRequest.js";
export type { AuthorizationUrlRequest } from "./request/AuthorizationUrlRequest.js";
export type { ClientCredentialRequest } from "./request/ClientCredentialRequest.js";
export type { DeviceCodeRequest } from "./request/DeviceCodeRequest.js";
export type { OnBehalfOfRequest } from "./request/OnBehalfOfRequest.js";
export type { UsernamePasswordRequest } from "./request/UsernamePasswordRequest.js";
export type { RefreshTokenRequest } from "./request/RefreshTokenRequest.js";
export type { SilentFlowRequest } from "./request/SilentFlowRequest.js";
export type { InteractiveRequest } from "./request/InteractiveRequest.js";
export type { SignOutRequest } from "./request/SignOutRequest.js";
export type { ManagedIdentityRequestParams } from "./request/ManagedIdentityRequestParams.js";
declare const PromptValue: {
    LOGIN: string;
    SELECT_ACCOUNT: string;
    CONSENT: string;
    NONE: string;
    CREATE: string;
    NO_SESSION: string;
};
declare const ResponseMode: {
    readonly QUERY: "query";
    readonly FRAGMENT: "fragment";
    readonly FORM_POST: "form_post";
};
export { PromptValue, ResponseMode };
export { CryptoProvider } from "./crypto/CryptoProvider.js";
export { AuthorizationCodePayload, AuthenticationResult, AuthorizeResponse, IdTokenClaims, AccountInfo, ValidCacheType, AuthError, AuthErrorCodes, ClientAuthError, ClientAuthErrorCodes, ClientConfigurationError, ClientConfigurationErrorCodes, InteractionRequiredAuthError, InteractionRequiredAuthErrorCodes, ServerError, INetworkModule, NetworkRequestOptions, NetworkResponse, Logger, LogLevel, ProtocolMode, ICachePlugin, TokenCacheContext, ISerializableTokenCache, AzureCloudInstance, AzureCloudOptions, IAppTokenProvider, AppTokenProviderParameters, AppTokenProviderResult, INativeBrokerPlugin, ClientAssertionCallback, } from "@azure/msal-common/node";
export { version } from "./packageMetadata.js";
//# sourceMappingURL=index.d.ts.map