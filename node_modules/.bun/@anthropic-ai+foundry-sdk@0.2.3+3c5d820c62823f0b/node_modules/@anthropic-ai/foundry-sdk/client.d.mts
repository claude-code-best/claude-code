import type { NullableHeaders } from "./internal/headers.mjs";
import { Anthropic, ClientOptions } from '@anthropic-ai/sdk/client';
export { BaseAnthropic } from '@anthropic-ai/sdk/client';
import * as Resources from '@anthropic-ai/sdk/resources/index';
/** API Client for interfacing with the Anthropic Foundry API. */
export interface FoundryClientOptions extends ClientOptions {
    /**
     * The name of your Foundry resource.
     *
     * For example, `https://{resource}.services.ai.azure.com/anthropic/v1/messages`.
     */
    resource?: string | undefined;
    /**
     * Defaults to process.env['ANTHROPIC_FOUNDRY_API_KEY'].
     */
    apiKey?: string | undefined;
    /**
     * A function that returns an access token for Microsoft Entra (formerly known as Azure Active Directory),
     * which will be invoked on every request.
     */
    azureADTokenProvider?: (() => Promise<string>) | undefined;
}
/** API Client for interfacing with the Anthropic Foundry API. */
export declare class AnthropicFoundry extends Anthropic {
    resource: string | null;
    messages: MessagesResource;
    beta: BetaResource;
    models: undefined;
    /**
     * API Client for interfacing with the Anthropic Foundry API.
     *
     * @param {string | undefined} [opts.resource=process.env['ANTHROPIC_FOUNDRY_RESOURCE'] ?? undefined] - Your Foundry resource name
     * @param {string | undefined} [opts.apiKey=process.env['ANTHROPIC_FOUNDRY_API_KEY'] ?? undefined]
     * @param {string | null | undefined} [opts.organization=process.env['ANTHROPIC_ORG_ID'] ?? null]
     * @param {string} [opts.baseURL=process.env['ANTHROPIC_FOUNDRY_BASE_URL']] - Sets the base URL for the API, e.g. `https://example-resource.azure.anthropic.com/anthropic/`.
     * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
     * @param {number} [opts.httpAgent] - An HTTP agent used to manage HTTP(s) connections.
     * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
     * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
     * @param {Headers} opts.defaultHeaders - Default headers to include with every request to the API.
     * @param {DefaultQuery} opts.defaultQuery - Default query parameters to include with every request to the API.
     * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
     */
    constructor({ baseURL, apiKey, resource, azureADTokenProvider, dangerouslyAllowBrowser, ...opts }?: FoundryClientOptions);
    protected authHeaders(): Promise<NullableHeaders | undefined>;
    protected validateHeaders(): void;
}
/**
 * The Anthropic Foundry does not currently support the Batch API.
 */
type MessagesResource = Omit<Resources.Messages, 'batches'>;
/**
 * The Anthropic Foundry does not currently support the Batch API.
 */
type BetaResource = Omit<Resources.Beta, 'messages'> & {
    messages: Omit<Resources.Beta['messages'], 'batches'>;
};
//# sourceMappingURL=client.d.mts.map