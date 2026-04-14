import { BaseAnthropic, ClientOptions as CoreClientOptions } from '@anthropic-ai/sdk/client';
import * as Resources from '@anthropic-ai/sdk/resources/index';
import { GoogleAuth, AuthClient } from 'google-auth-library';
import { FinalRequestOptions } from "./internal/request-options.js";
import { FinalizedRequestInit } from "./internal/types.js";
export { BaseAnthropic } from '@anthropic-ai/sdk/client';
export type ClientOptions = Omit<CoreClientOptions, 'apiKey' | 'authToken'> & {
    region?: string | null | undefined;
    projectId?: string | null | undefined;
    accessToken?: string | null | undefined;
    /**
     * Override the default google auth config using the
     * [google-auth-library](https://www.npmjs.com/package/google-auth-library) package.
     *
     * Note that you'll likely have to set `scopes`, e.g.
     * ```ts
     * new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' })
     * ```
     */
    googleAuth?: GoogleAuth | null | undefined;
    /**
     * Provide a pre-configured `AuthClient` instance from the
     * [google-auth-library](https://www.npmjs.com/package/google-auth-library) package.
     *
     * This is useful when you want to use a specific authentication method like
     * [Impersonated credentials](https://www.npmjs.com/package/google-auth-library#impersonated-credentials-client):
     * ```ts
     * new AnthropicVertex({
     *   authClient: new Impersonated({
     *     sourceClient: await new GoogleAuth().getClient(),
     *     targetPrincipal: 'impersonated-account@projectID.iam.gserviceaccount.com',
     *     lifetime: 30,
     *     delegates: [],
     *     targetScopes: ['https://www.googleapis.com/auth/cloud-platform']
     *   })
     * })
     * ```
     */
    authClient?: AuthClient | null | undefined;
};
export declare class AnthropicVertex extends BaseAnthropic {
    region: string;
    projectId: string | null;
    accessToken: string | null;
    private _auth?;
    private _authClientPromise;
    /**
     * API Client for interfacing with the Anthropic Vertex API.
     *
     * @param {string | null} opts.accessToken
     * @param {string | null} opts.projectId
     * @param {GoogleAuth} opts.googleAuth - Override the default google auth config
     * @param {AuthClient} opts.authClient - Provide a pre-configured AuthClient instance (alternative to googleAuth)
     * @param {string | null} [opts.region=process.env['CLOUD_ML_REGION']] - The region to use for the API. Use 'global' for global endpoint. [More details here](https://cloud.google.com/vertex-ai/generative-ai/docs/learn/locations).
     * @param {string} [opts.baseURL=process.env['ANTHROPIC_VERTEX__BASE_URL'] ?? https://${region}-aiplatform.googleapis.com/v1] - Override the default base URL for the API.
     * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
     * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
     * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
     * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
     * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
     * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
     * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
     */
    constructor({ baseURL, region, projectId, ...opts }?: ClientOptions);
    messages: MessagesResource;
    beta: BetaResource;
    protected validateHeaders(): void;
    protected prepareOptions(options: FinalRequestOptions): Promise<void>;
    buildRequest(options: FinalRequestOptions): Promise<{
        req: FinalizedRequestInit;
        url: string;
        timeout: number;
    }>;
}
/**
 * The Vertex SDK does not currently support the Batch API.
 */
type MessagesResource = Omit<Resources.Messages, 'batches'>;
/**
 * The Vertex API does not currently support the Batch API.
 */
type BetaResource = Omit<Resources.Beta, 'messages'> & {
    messages: Omit<Resources.Beta['messages'], 'batches'>;
};
//# sourceMappingURL=client.d.ts.map