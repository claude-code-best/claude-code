/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { INetworkModule } from "../network/INetworkModule.js";
import { DEFAULT_CRYPTO_IMPLEMENTATION, ICrypto } from "../crypto/ICrypto.js";
import { ILoggerCallback, Logger, LogLevel } from "../logger/Logger.js";
import {
    DEFAULT_COMMON_TENANT,
    DEFAULT_TOKEN_RENEWAL_OFFSET_SEC,
    SKU,
} from "../utils/Constants.js";
import { version } from "../packageMetadata.js";
import type { Authority } from "../authority/Authority.js";
import { AzureCloudInstance } from "../authority/AuthorityOptions.js";
import { CacheManager, DefaultStorageClass } from "../cache/CacheManager.js";
import { ServerTelemetryManager } from "../telemetry/server/ServerTelemetryManager.js";
import { ICachePlugin } from "../cache/interface/ICachePlugin.js";
import { ISerializableTokenCache } from "../cache/interface/ISerializableTokenCache.js";
import { ClientCredentials } from "../account/ClientCredentials.js";
import { ProtocolMode } from "../authority/ProtocolMode.js";
import {
    ClientAuthErrorCodes,
    createClientAuthError,
} from "../error/ClientAuthError.js";
import { StubPerformanceClient } from "../telemetry/performance/StubPerformanceClient.js";

/**
 * Use the configuration object to configure MSAL Modules and initialize the base interfaces for MSAL.
 *
 * This object allows you to configure important elements of MSAL functionality:
 * - authOptions                - Authentication for application
 * - cryptoInterface            - Implementation of crypto functions
 * - libraryInfo                - Library metadata
 * - telemetry                  - Telemetry options and data
 * - loggerOptions              - Logging for application
 * - networkInterface           - Network implementation
 * - storageInterface           - Storage implementation
 * - systemOptions              - Additional library options
 * - clientCredentials          - Credentials options for confidential clients
 * @internal
 */
export type ClientConfiguration = {
    authOptions: AuthOptions;
    systemOptions?: SystemOptions;
    loggerOptions?: LoggerOptions;
    storageInterface?: CacheManager;
    networkInterface?: INetworkModule;
    cryptoInterface?: ICrypto;
    clientCredentials?: ClientCredentials;
    libraryInfo?: LibraryInfo;
    telemetry?: TelemetryOptions;
    serverTelemetryManager?: ServerTelemetryManager | null;
    persistencePlugin?: ICachePlugin | null;
    serializableCache?: ISerializableTokenCache | null;
};

export type CommonClientConfiguration = {
    authOptions: Required<AuthOptions>;
    systemOptions: Required<SystemOptions>;
    loggerOptions: Required<LoggerOptions>;
    storageInterface: CacheManager;
    networkInterface: INetworkModule;
    cryptoInterface: Required<ICrypto>;
    libraryInfo: LibraryInfo;
    telemetry: Required<TelemetryOptions>;
    serverTelemetryManager: ServerTelemetryManager | null;
    clientCredentials: ClientCredentials;
    persistencePlugin: ICachePlugin | null;
    serializableCache: ISerializableTokenCache | null;
};

/**
 * Use this to configure the auth options in the ClientConfiguration object
 *
 * - clientId                    - Client ID of your app registered with our Application registration portal : https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredAppsPreview in Microsoft Identity Platform
 * - authority                   - You can configure a specific authority, defaults to " " or "https://login.microsoftonline.com/common"
 * - knownAuthorities            - An array of URIs that are known to be valid. Used in B2C scenarios.
 * - cloudDiscoveryMetadata      - A string containing the cloud discovery response. Used in AAD scenarios.
 * - clientCapabilities          - Array of capabilities which will be added to the claims.access_token.xms_cc request property on every network request.
 * - instanceAware               - A flag of whether the STS will send back additional parameters to specify where the tokens should be retrieved from.
 * - redirectUri                 - The redirect URI where authentication responses can be received by your application. It must exactly match one of the redirect URIs registered in the Azure portal.
 * - isMcp                       - A flag of whether the application is an MCP application, which requires a resource parameter to be sent in token requests.
 * @internal
 */
export type AuthOptions = {
    clientId: string;
    authority: Authority;
    redirectUri: string;
    clientCapabilities?: Array<string>;
    azureCloudOptions?: AzureCloudOptions;
    instanceAware?: boolean;
    isMcp?: boolean;
};

/**
 * Use this to configure token renewal info in the Configuration object
 *
 * - tokenRenewalOffsetSeconds    - Sets the window of offset needed to renew the token before expiry
 * - protocolMode                - Enum that represents the protocol that msal follows. Used for configuring proper endpoints.
 */
export type SystemOptions = {
    tokenRenewalOffsetSeconds?: number;
    preventCorsPreflight?: boolean;
};

/**
 *  Use this to configure the logging that MSAL does, by configuring logger options in the Configuration object
 *
 * - loggerCallback                - Callback for logger
 * - piiLoggingEnabled             - Sets whether pii logging is enabled
 * - logLevel                      - Sets the level at which logging happens
 * - correlationId                 - Sets the correlationId printed by the logger
 */
export type LoggerOptions = {
    loggerCallback?: ILoggerCallback;
    piiLoggingEnabled?: boolean;
    logLevel?: LogLevel;
    correlationId?: string;
};

/**
 * Library-specific options
 */
export type LibraryInfo = {
    sku: string;
    version: string;
    cpu: string;
    os: string;
};

/**
 * AzureCloudInstance specific options
 *
 * - azureCloudInstance             - string enum providing short notation for soverign and public cloud authorities
 * - tenant                         - provision to provide the tenant info
 */
export type AzureCloudOptions = {
    azureCloudInstance: AzureCloudInstance;
    tenant?: string;
};

export type TelemetryOptions = {
    application: ApplicationTelemetry;
};

/**
 * Telemetry information sent on request
 * - appName: Unique string name of an application
 * - appVersion: Version of the application using MSAL
 */
export type ApplicationTelemetry = {
    appName: string;
    appVersion: string;
};

export const DEFAULT_SYSTEM_OPTIONS: Required<SystemOptions> = {
    tokenRenewalOffsetSeconds: DEFAULT_TOKEN_RENEWAL_OFFSET_SEC,
    preventCorsPreflight: false,
};

const DEFAULT_LOGGER_IMPLEMENTATION: Required<LoggerOptions> = {
    loggerCallback: () => {
        // allow users to not set loggerCallback
    },
    piiLoggingEnabled: false,
    logLevel: LogLevel.Info,
    correlationId: "",
};

const DEFAULT_NETWORK_IMPLEMENTATION: INetworkModule = {
    async sendGetRequestAsync<T>(): Promise<T> {
        throw createClientAuthError(ClientAuthErrorCodes.methodNotImplemented);
    },
    async sendPostRequestAsync<T>(): Promise<T> {
        throw createClientAuthError(ClientAuthErrorCodes.methodNotImplemented);
    },
};

const DEFAULT_LIBRARY_INFO: LibraryInfo = {
    sku: SKU,
    version: version,
    cpu: "",
    os: "",
};

const DEFAULT_CLIENT_CREDENTIALS: ClientCredentials = {
    clientSecret: "",
    clientAssertion: undefined,
};

const DEFAULT_AZURE_CLOUD_OPTIONS: AzureCloudOptions = {
    azureCloudInstance: AzureCloudInstance.None,
    tenant: `${DEFAULT_COMMON_TENANT}`,
};

const DEFAULT_TELEMETRY_OPTIONS: Required<TelemetryOptions> = {
    application: {
        appName: "",
        appVersion: "",
    },
};

/**
 * Function that sets the default options when not explicitly configured from app developer
 *
 * @param Configuration
 *
 * @returns Configuration
 */
export function buildClientConfiguration({
    authOptions: userAuthOptions,
    systemOptions: userSystemOptions,
    loggerOptions: userLoggerOption,
    storageInterface: storageImplementation,
    networkInterface: networkImplementation,
    cryptoInterface: cryptoImplementation,
    clientCredentials: clientCredentials,
    libraryInfo: libraryInfo,
    telemetry: telemetry,
    serverTelemetryManager: serverTelemetryManager,
    persistencePlugin: persistencePlugin,
    serializableCache: serializableCache,
}: ClientConfiguration): CommonClientConfiguration {
    const loggerOptions = {
        ...DEFAULT_LOGGER_IMPLEMENTATION,
        ...userLoggerOption,
    };

    return {
        authOptions: buildAuthOptions(userAuthOptions),
        systemOptions: { ...DEFAULT_SYSTEM_OPTIONS, ...userSystemOptions },
        loggerOptions: loggerOptions,
        storageInterface:
            storageImplementation ||
            new DefaultStorageClass(
                userAuthOptions.clientId,
                DEFAULT_CRYPTO_IMPLEMENTATION,
                new Logger(loggerOptions),
                new StubPerformanceClient()
            ),
        networkInterface:
            networkImplementation || DEFAULT_NETWORK_IMPLEMENTATION,
        cryptoInterface: cryptoImplementation || DEFAULT_CRYPTO_IMPLEMENTATION,
        clientCredentials: clientCredentials || DEFAULT_CLIENT_CREDENTIALS,
        libraryInfo: { ...DEFAULT_LIBRARY_INFO, ...libraryInfo },
        telemetry: { ...DEFAULT_TELEMETRY_OPTIONS, ...telemetry },
        serverTelemetryManager: serverTelemetryManager || null,
        persistencePlugin: persistencePlugin || null,
        serializableCache: serializableCache || null,
    };
}

/**
 * Construct authoptions from the client and platform passed values
 * @param authOptions
 */
function buildAuthOptions(authOptions: AuthOptions): Required<AuthOptions> {
    return {
        clientCapabilities: [],
        azureCloudOptions: DEFAULT_AZURE_CLOUD_OPTIONS,
        instanceAware: false,
        isMcp: false,
        ...authOptions,
    };
}

/**
 * Returns true if config has protocolMode set to ProtocolMode.OIDC, false otherwise
 * @param ClientConfiguration
 */
export function isOidcProtocolMode(config: ClientConfiguration): boolean {
    return (
        config.authOptions.authority.options.protocolMode === ProtocolMode.OIDC
    );
}
