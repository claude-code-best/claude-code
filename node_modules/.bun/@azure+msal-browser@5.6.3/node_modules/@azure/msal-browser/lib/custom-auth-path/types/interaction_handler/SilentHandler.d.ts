import { Logger, IPerformanceClient, Authority, CommonAuthorizationUrlRequest } from "@azure/msal-common/browser";
import { BrowserConfiguration } from "../config/Configuration.js";
/**
 * Creates a hidden iframe to given URL using user-requested scopes as an id.
 * @param urlNavigate
 * @param userRequestScopes
 */
export declare function initiateCodeRequest(requestUrl: string, performanceClient: IPerformanceClient, logger: Logger, correlationId: string): Promise<HTMLIFrameElement>;
export declare function initiateCodeFlowWithPost(config: BrowserConfiguration, authority: Authority, request: CommonAuthorizationUrlRequest, logger: Logger, performanceClient: IPerformanceClient): Promise<HTMLIFrameElement>;
export declare function initiateEarRequest(config: BrowserConfiguration, authority: Authority, request: CommonAuthorizationUrlRequest, logger: Logger, performanceClient: IPerformanceClient): Promise<HTMLIFrameElement>;
/**
 * @hidden
 * Removes a hidden iframe from `document.body` if it is a direct child.
 * @param iframe - The iframe element to remove.
 */
export declare function removeHiddenIframe(iframe: HTMLIFrameElement): void;
//# sourceMappingURL=SilentHandler.d.ts.map