/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    SystemOptions,
    LoggerOptions,
    INetworkModule,
    DEFAULT_SYSTEM_OPTIONS,
    ProtocolMode,
    OIDCOptions,
    LogLevel,
    StubbedNetworkModule,
    AzureCloudInstance,
    AzureCloudOptions,
    ApplicationTelemetry,
    createClientConfigurationError,
    ClientConfigurationErrorCodes,
    IPerformanceClient,
    StubPerformanceClient,
    Logger,
    Constants,
} from "@azure/msal-common/browser";
import { BrowserCacheLocation } from "../utils/BrowserConstants.js";
import { INavigationClient } from "../navigation/INavigationClient.js";
import { NavigationClient } from "../navigation/NavigationClient.js";
import { FetchClient } from "../network/FetchClient.js";

// Default timeout for popup windows and iframes in milliseconds
export const DEFAULT_POPUP_TIMEOUT_MS = 60000;
export const DEFAULT_IFRAME_TIMEOUT_MS = 10000;
export const DEFAULT_REDIRECT_TIMEOUT_MS = 30000;
export const DEFAULT_NATIVE_BROKER_HANDSHAKE_TIMEOUT_MS = 2000;

/**
 * Use this to configure the auth options in the Configuration object
 */
export type BrowserAuthOptions = {
    /**
     * Client ID of your app registered with our Application registration portal : https://portal.azure.com/#blade/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/RegisteredAppsPreview in Microsoft Identity Platform
     */
    clientId: string;
    /**
     * You can configure a specific authority, defaults to " " or "https://login.microsoftonline.com/common"
     */
    authority?: string;
    /**
     * An array of URIs that are known to be valid. Used in B2C scenarios.
     */
    knownAuthorities?: Array<string>;
    /**
     * A string containing the cloud discovery response. Used in AAD scenarios.
     */
    cloudDiscoveryMetadata?: string;
    /**
     * A string containing the .well-known/openid-configuration endpoint response
     */
    authorityMetadata?: string;
    /**
     * The redirect URI where authentication responses can be received by your application. It must exactly match one of the redirect URIs registered in the Azure portal.
     */
    redirectUri?: string;
    /**
     * The redirect URI where the window navigates after a successful logout.
     */
    postLogoutRedirectUri?: string | null;

    /**
     * Array of capabilities which will be added to the claims.access_token.xms_cc request property on every network request.
     */
    clientCapabilities?: Array<string>;
    /**
     * Enum that configures options for the OIDC protocol mode.
     */
    OIDCOptions?: OIDCOptions;
    /**
     * Enum that represents the Azure Cloud to use.
     */
    azureCloudOptions?: AzureCloudOptions;
    /**
     * Callback that will be passed the url that MSAL will navigate to in redirect flows. Returning false in the callback will stop navigation.
     */
    onRedirectNavigate?: (url: string) => boolean | void;
    /**
     * Flag of whether the STS will send back additional parameters to specify where the tokens should be retrieved from.
     */
    instanceAware?: boolean;
    /**
     * Flag on whether a resource parameter is required for token requests. Used for MCP flows.
     */
    isMcp?: boolean;
};

/** @internal */
export type InternalAuthOptions = Omit<
    Required<BrowserAuthOptions>,
    "onRedirectNavigate"
> & {
    OIDCOptions: Required<OIDCOptions>;
    onRedirectNavigate?: (url: string) => boolean | void;
};

/**
 * Use this to configure the below cache configuration options:
 */
export type CacheOptions = {
    /**
     * Used to specify the cacheLocation user wants to set. Valid values are "localStorage", "sessionStorage" and "memoryStorage".
     */
    cacheLocation?: BrowserCacheLocation | string;
    /**
     * Used to specify the number of days cache entries written by previous versions of MSAL.js should be retained in the browser. Defaults to 5 days.
     */
    cacheRetentionDays?: number;
};

export type BrowserSystemOptions = SystemOptions & {
    /**
     * Used to initialize the Logger object (See ClientConfiguration.ts)
     */
    loggerOptions?: LoggerOptions;
    /**
     * Network interface implementation
     */
    networkClient?: INetworkModule;
    /**
     * Override the methods used to navigate to other webpages. Particularly useful if you are using a client-side router
     */
    navigationClient?: INavigationClient;
    /**
     * Sets the timeout for waiting for response from a popup using BroadcastChannel
     */
    popupBridgeTimeout?: number;
    /**
     * Sets the timeout for waiting for response from an iframe using BroadcastChannel
     */
    iframeBridgeTimeout?: number;
    /**
     * Time to wait for redirection to occur before resolving promise
     */
    redirectNavigationTimeout?: number;
    /**
     * Sets whether popups are opened and navigated to later. By default, this flag is set to true. When set to true, blank popups are opened and navigates to login domain. When set to false, popups are opened directly to the login domain.
     */
    navigatePopups?: boolean;
    /**
     * Flag to enable redirect opertaions when the app is rendered in an iframe (to support scenarios such as embedded B2C login).
     */
    allowRedirectInIframe?: boolean;
    /**
     * Flag to enable native broker support (e.g. acquiring tokens from WAM on Windows, MacBroker on Mac)
     */
    allowPlatformBroker?: boolean;
    /**
     * Sets the timeout for waiting for the native broker handshake to resolve
     */
    nativeBrokerHandshakeTimeout?: number;
    /**
     * Enum that represents the protocol that msal follows. Used for configuring proper endpoints.
     */
    protocolMode?: ProtocolMode;
};

/** @internal */
export type BrowserExperimentalOptions = {
    /**
     * Enables iframe timeout telemetry experiment for silent iframe bridge monitoring.
     */
    iframeTimeoutTelemetry?: boolean;
};

/**
 * Telemetry Options
 */
export type BrowserTelemetryOptions = {
    /**
     * Telemetry information sent on request
     * - appName: Unique string name of an application
     * - appVersion: Version of the application using MSAL
     */
    application?: ApplicationTelemetry;

    client?: IPerformanceClient;
};

/**
 * This object allows you to configure important elements of MSAL functionality and is passed into the constructor of PublicClientApplication
 */
export type Configuration = {
    /**
     * This is where you configure auth elements like clientID, authority used for authenticating against the Microsoft Identity Platform
     */
    auth: BrowserAuthOptions;
    /**
     * This is where you configure cache location and whether to store cache in cookies
     */
    cache?: CacheOptions;
    /**
     * This is where you can configure the network client, logger, token renewal offset
     */
    system?: BrowserSystemOptions;
    /**
     * This is where you can configure experimental features. These do not follow semver and may be changed or removed without a major version bump. Use with caution.
     */
    experimental?: BrowserExperimentalOptions;
    /**
     * This is where you can configure telemetry data and options
     */
    telemetry?: BrowserTelemetryOptions;
};

/** @internal */
export type BrowserConfiguration = {
    auth: InternalAuthOptions;
    cache: Required<CacheOptions>;
    system: Required<BrowserSystemOptions>;
    experimental: Required<BrowserExperimentalOptions>;
    telemetry: Required<BrowserTelemetryOptions>;
};

/**
 * MSAL function that sets the default options when not explicitly configured from app developer
 *
 * @param auth
 * @param cache
 * @param system
 *
 * @returns Configuration object
 */
export function buildConfiguration(
    {
        auth: userInputAuth,
        cache: userInputCache,
        system: userInputSystem,
        experimental: userInputExperimental,
        telemetry: userInputTelemetry,
    }: Configuration,
    isBrowserEnvironment: boolean
): BrowserConfiguration {
    // Default auth options for browser
    const DEFAULT_AUTH_OPTIONS: InternalAuthOptions = {
        clientId: "",
        authority: `${Constants.DEFAULT_AUTHORITY}`,
        knownAuthorities: [],
        cloudDiscoveryMetadata: "",
        authorityMetadata: "",
        redirectUri:
            typeof window !== "undefined" && window.location
                ? window.location.href.split("?")[0].split("#")[0]
                : "",
        postLogoutRedirectUri: "",
        clientCapabilities: [],
        OIDCOptions: {
            responseMode: Constants.ResponseMode.FRAGMENT,
            defaultScopes: [
                Constants.OPENID_SCOPE,
                Constants.PROFILE_SCOPE,
                Constants.OFFLINE_ACCESS_SCOPE,
            ],
        },
        azureCloudOptions: {
            azureCloudInstance: AzureCloudInstance.None,
            tenant: "",
        },
        instanceAware: false,
        isMcp: false,
    };

    // Default cache options for browser
    const DEFAULT_CACHE_OPTIONS: Required<CacheOptions> = {
        cacheLocation: BrowserCacheLocation.SessionStorage,
        cacheRetentionDays: 5,
    };

    // Default logger options for browser
    const DEFAULT_LOGGER_OPTIONS: LoggerOptions = {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        loggerCallback: (): void => {
            // allow users to not set logger call back
        },
        logLevel: LogLevel.Info,
        piiLoggingEnabled: false,
    };

    // Default system options for browser
    const DEFAULT_BROWSER_SYSTEM_OPTIONS: Required<BrowserSystemOptions> = {
        ...DEFAULT_SYSTEM_OPTIONS,
        loggerOptions: DEFAULT_LOGGER_OPTIONS,
        networkClient: isBrowserEnvironment
            ? new FetchClient()
            : StubbedNetworkModule,
        navigationClient: new NavigationClient(),
        popupBridgeTimeout:
            userInputSystem?.popupBridgeTimeout || DEFAULT_POPUP_TIMEOUT_MS,
        iframeBridgeTimeout:
            userInputSystem?.iframeBridgeTimeout || DEFAULT_IFRAME_TIMEOUT_MS,
        redirectNavigationTimeout: DEFAULT_REDIRECT_TIMEOUT_MS,
        allowRedirectInIframe: false,
        navigatePopups: true,
        allowPlatformBroker: false,
        nativeBrokerHandshakeTimeout:
            userInputSystem?.nativeBrokerHandshakeTimeout ||
            DEFAULT_NATIVE_BROKER_HANDSHAKE_TIMEOUT_MS,
        protocolMode: ProtocolMode.AAD,
    };

    const providedSystemOptions: Required<BrowserSystemOptions> = {
        ...DEFAULT_BROWSER_SYSTEM_OPTIONS,
        ...userInputSystem,
        loggerOptions: userInputSystem?.loggerOptions || DEFAULT_LOGGER_OPTIONS,
    };

    const DEFAULT_TELEMETRY_OPTIONS: Required<BrowserTelemetryOptions> = {
        application: {
            appName: "",
            appVersion: "",
        },
        client: new StubPerformanceClient(),
    };

    const DEFAULT_EXPERIMENTAL_OPTIONS: Required<BrowserExperimentalOptions> = {
        iframeTimeoutTelemetry: false,
    };

    // Throw an error if user has set OIDCOptions without being in OIDC protocol mode
    if (
        userInputSystem?.protocolMode !== ProtocolMode.OIDC &&
        userInputAuth?.OIDCOptions
    ) {
        const logger = new Logger(providedSystemOptions.loggerOptions);
        logger.warning(
            JSON.stringify(
                createClientConfigurationError(
                    ClientConfigurationErrorCodes.cannotSetOIDCOptions
                )
            ),
            ""
        );
    }

    // Throw an error if user has set allowPlatformBroker to true with OIDC protocol mode
    if (
        userInputSystem?.protocolMode &&
        userInputSystem.protocolMode === ProtocolMode.OIDC &&
        providedSystemOptions?.allowPlatformBroker
    ) {
        throw createClientConfigurationError(
            ClientConfigurationErrorCodes.cannotAllowPlatformBroker
        );
    }

    const overlayedConfig: BrowserConfiguration = {
        auth: {
            ...DEFAULT_AUTH_OPTIONS,
            ...userInputAuth,
            OIDCOptions: {
                ...DEFAULT_AUTH_OPTIONS.OIDCOptions,
                ...userInputAuth?.OIDCOptions,
            },
        },
        cache: { ...DEFAULT_CACHE_OPTIONS, ...userInputCache },
        system: providedSystemOptions,
        experimental: {
            ...DEFAULT_EXPERIMENTAL_OPTIONS,
            ...userInputExperimental,
        },
        telemetry: { ...DEFAULT_TELEMETRY_OPTIONS, ...userInputTelemetry },
    };

    return overlayedConfig;
}
