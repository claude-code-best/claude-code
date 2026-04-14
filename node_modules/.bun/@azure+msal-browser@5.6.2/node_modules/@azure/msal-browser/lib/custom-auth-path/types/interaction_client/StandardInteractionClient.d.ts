import { ServerTelemetryManager, AuthorizationCodeClient, ClientConfiguration, CommonEndSessionRequest, AccountInfo, AzureCloudOptions, StringDict, CommonAuthorizationUrlRequest, ICrypto, Logger, IPerformanceClient, Authority } from "@azure/msal-common/browser";
import { BaseInteractionClient } from "./BaseInteractionClient.js";
import { InteractionType } from "../utils/BrowserConstants.js";
import { EndSessionRequest } from "../request/EndSessionRequest.js";
import { RedirectRequest } from "../request/RedirectRequest.js";
import { PopupRequest } from "../request/PopupRequest.js";
import { SsoSilentRequest } from "../request/SsoSilentRequest.js";
import { BrowserConfiguration } from "../config/Configuration.js";
import { BrowserCacheManager } from "../cache/BrowserCacheManager.js";
/**
 * Defines the class structure and helper functions used by the "standard", non-brokered auth flows (popup, redirect, silent (RT), silent (iframe))
 */
export declare abstract class StandardInteractionClient extends BaseInteractionClient {
    /**
     * Initializer for the logout request.
     * @param logoutRequest
     */
    protected initializeLogoutRequest(logoutRequest?: EndSessionRequest): CommonEndSessionRequest;
    /**
     * Parses login_hint ID Token Claim out of AccountInfo object to be used as
     * logout_hint in end session request.
     * @param account
     */
    protected getLogoutHintFromIdTokenClaims(account: AccountInfo): string | null;
    /**
     * Creates an Authorization Code Client with the given authority, or the default authority.
     * @param params {
     *         serverTelemetryManager: ServerTelemetryManager;
     *         authorityUrl?: string;
     *         requestAzureCloudOptions?: AzureCloudOptions;
     *         requestExtraQueryParameters?: StringDict;
     *         account?: AccountInfo;
     *        }
     */
    protected createAuthCodeClient(params: {
        serverTelemetryManager: ServerTelemetryManager;
        requestAuthority?: string;
        requestAzureCloudOptions?: AzureCloudOptions;
        requestExtraQueryParameters?: StringDict;
        account?: AccountInfo;
        authority?: Authority;
    }): Promise<AuthorizationCodeClient>;
    /**
     * Creates a Client Configuration object with the given request authority, or the default authority.
     * @param params {
     *         serverTelemetryManager: ServerTelemetryManager;
     *         requestAuthority?: string;
     *         requestAzureCloudOptions?: AzureCloudOptions;
     *         requestExtraQueryParameters?: boolean;
     *         account?: AccountInfo;
     *        }
     */
    protected getClientConfiguration(params: {
        serverTelemetryManager: ServerTelemetryManager;
        requestAuthority?: string;
        requestAzureCloudOptions?: AzureCloudOptions;
        requestExtraQueryParameters?: StringDict;
        account?: AccountInfo;
        authority?: Authority;
    }): Promise<ClientConfiguration>;
}
/**
 * Helper to initialize required request parameters for interactive APIs and ssoSilent().
 *
 * @param request - The authentication request object (RedirectRequest, PopupRequest, or SsoSilentRequest).
 * @param interactionType - The type of interaction (e.g., redirect, popup, silent).
 * @param config - The browser configuration object.
 * @param browserCrypto - The cryptographic interface for browser operations.
 * @param browserStorage - The browser storage manager instance.
 * @param logger - The logger instance for logging messages.
 * @param performanceClient - The performance client for telemetry.
 * @param correlationId - The correlation ID for the request.
 * @returns A promise that resolves to a CommonAuthorizationUrlRequest object with initialized parameters.
 */
export declare function initializeAuthorizationRequest(request: RedirectRequest | PopupRequest | SsoSilentRequest, interactionType: InteractionType, config: BrowserConfiguration, browserCrypto: ICrypto, browserStorage: BrowserCacheManager, logger: Logger, performanceClient: IPerformanceClient, correlationId: string): Promise<CommonAuthorizationUrlRequest>;
//# sourceMappingURL=StandardInteractionClient.d.ts.map