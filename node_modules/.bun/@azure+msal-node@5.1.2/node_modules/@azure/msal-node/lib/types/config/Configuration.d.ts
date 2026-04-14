import { LoggerOptions, INetworkModule, ProtocolMode, ICachePlugin, AzureCloudOptions, ApplicationTelemetry, INativeBrokerPlugin, ClientAssertionCallback } from "@azure/msal-common/node";
import { ManagedIdentityId } from "./ManagedIdentityId.js";
/**
 * - clientId               - Client id of the application.
 * - authority              - Url of the authority. If no value is set, defaults to https://login.microsoftonline.com/common.
 * - knownAuthorities       - Needed for Azure B2C and ADFS. All authorities that will be used in the client application. Only the host of the authority should be passed in.
 * - clientSecret           - Secret string that the application uses when requesting a token. Only used in confidential client applications. Can be created in the Azure app registration portal.
 * - clientAssertion        - A ClientAssertion object containing an assertion string or a callback function that returns an assertion string that the application uses when requesting a token, as well as the assertion's type (urn:ietf:params:oauth:client-assertion-type:jwt-bearer). Only used in confidential client applications.
 * - clientCertificate      - Certificate that the application uses when requesting a token. Only used in confidential client applications. Requires hex encoded X.509 SHA-1 or SHA-256 thumbprint of the certificate, and the PEM encoded private key (string should contain -----BEGIN PRIVATE KEY----- ... -----END PRIVATE KEY----- )
 * @public
 */
export type NodeAuthOptions = {
    clientId: string;
    authority?: string;
    clientSecret?: string;
    clientAssertion?: string | ClientAssertionCallback;
    clientCertificate?: {
        /**
         * @deprecated Use thumbprintSha2 property instead. Thumbprint needs to be computed with SHA-256 algorithm.
         * SHA-1 is only needed for backwards compatibility with older versions of ADFS.
         */
        thumbprint?: string;
        thumbprintSha256?: string;
        privateKey: string;
        x5c?: string;
    };
    knownAuthorities?: Array<string>;
    cloudDiscoveryMetadata?: string;
    authorityMetadata?: string;
    clientCapabilities?: Array<string>;
    azureCloudOptions?: AzureCloudOptions;
    /**
     * Flag on whether a resource parameter is required for token requests. Used for MCP flows.
     */
    isMcp?: boolean;
};
/**
 * Use this to configure the below cache configuration options:
 *
 * - cachePlugin   - Plugin for reading and writing token cache to disk.
 * @public
 */
export type CacheOptions = {
    cachePlugin?: ICachePlugin;
};
/**
 * Use this to configure the below broker options:
 * - nativeBrokerPlugin - Native broker implementation (should be imported from msal-node-extensions)
 *
 * Note: These options are only available for PublicClientApplications using the Authorization Code Flow
 * @public
 */
export type BrokerOptions = {
    nativeBrokerPlugin?: INativeBrokerPlugin;
};
/**
 * Type for configuring logger and http client options
 *
 * - logger                       - Used to initialize the Logger object; TODO: Expand on logger details or link to the documentation on logger
 * - networkClient                - Http client used for all http get and post calls. Defaults to using MSAL's default http client.
 * - protocolMode           - Enum that represents the protocol that msal follows. Used for configuring proper endpoints.
 * @public
 */
export type NodeSystemOptions = {
    loggerOptions?: LoggerOptions;
    networkClient?: INetworkModule;
    disableInternalRetries?: boolean;
    protocolMode?: ProtocolMode;
};
/** @public */
export type NodeTelemetryOptions = {
    application?: ApplicationTelemetry;
};
/**
 * Use the configuration object to configure MSAL and initialize the client application object
 *
 * - auth: this is where you configure auth elements like clientID, authority used for authenticating against the Microsoft Identity Platform
 * - broker: this is where you configure broker options
 * - cache: this is where you configure cache location
 * - system: this is where you can configure the network client, logger
 * - telemetry: this is where you can configure telemetry options
 * @public
 */
export type Configuration = {
    auth: NodeAuthOptions;
    broker?: BrokerOptions;
    cache?: CacheOptions;
    system?: NodeSystemOptions;
    telemetry?: NodeTelemetryOptions;
};
/** @public */
export type ManagedIdentityIdParams = {
    userAssignedClientId?: string;
    userAssignedResourceId?: string;
    userAssignedObjectId?: string;
};
/** @public */
export type ManagedIdentityConfiguration = {
    clientCapabilities?: Array<string>;
    managedIdentityIdParams?: ManagedIdentityIdParams;
    system?: NodeSystemOptions;
};
/** @internal */
export type NodeConfiguration = {
    auth: Required<NodeAuthOptions>;
    broker: BrokerOptions;
    cache: CacheOptions;
    system: Required<NodeSystemOptions>;
    telemetry: Required<NodeTelemetryOptions>;
};
/**
 * Sets the default options when not explicitly configured from app developer
 *
 * @param auth - Authentication options
 * @param cache - Cache options
 * @param system - System options
 * @param telemetry - Telemetry options
 *
 * @returns Configuration
 * @internal
 */
export declare function buildAppConfiguration({ auth, broker, cache, system, telemetry, }: Configuration): NodeConfiguration;
/** @internal */
export type ManagedIdentityNodeConfiguration = {
    clientCapabilities?: Array<string>;
    disableInternalRetries: boolean;
    managedIdentityId: ManagedIdentityId;
    system: Required<Pick<NodeSystemOptions, "loggerOptions" | "networkClient">>;
};
export declare function buildManagedIdentityConfiguration({ clientCapabilities, managedIdentityIdParams, system, }: ManagedIdentityConfiguration): ManagedIdentityNodeConfiguration;
//# sourceMappingURL=Configuration.d.ts.map