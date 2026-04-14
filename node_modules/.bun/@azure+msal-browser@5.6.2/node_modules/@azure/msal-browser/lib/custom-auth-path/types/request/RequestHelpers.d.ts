import { AccountInfo, Constants, BaseAuthRequest, CommonSilentFlowRequest, IPerformanceClient, Logger, ProtocolMode } from "@azure/msal-common/browser";
import { BrowserConfiguration } from "../config/Configuration.js";
import { SilentRequest } from "./SilentRequest.js";
import { PopupRequest } from "./PopupRequest.js";
import { RedirectRequest } from "./RedirectRequest.js";
/**
 * Initializer function for all request APIs
 * @param request
 * @param config
 * @param performanceClient
 * @param logger
 * @param correlationId
 */
export declare function initializeBaseRequest(request: Partial<BaseAuthRequest> & {
    correlationId: string;
}, config: BrowserConfiguration, performanceClient: IPerformanceClient, logger: Logger, correlationId: string): Promise<BaseAuthRequest>;
export declare function initializeSilentRequest(request: SilentRequest & {
    correlationId: string;
}, account: AccountInfo, config: BrowserConfiguration, performanceClient: IPerformanceClient, logger: Logger): Promise<CommonSilentFlowRequest>;
/**
 * Validates that the combination of request method, protocol mode and authorize body parameters is correct.
 * Returns the validated or defaulted HTTP method or throws if the configured combination is invalid.
 * @param interactionRequest
 * @param protocolMode
 * @returns
 */
export declare function validateRequestMethod(interactionRequest: BaseAuthRequest | PopupRequest | RedirectRequest, protocolMode: ProtocolMode): Constants.HttpMethod;
//# sourceMappingURL=RequestHelpers.d.ts.map