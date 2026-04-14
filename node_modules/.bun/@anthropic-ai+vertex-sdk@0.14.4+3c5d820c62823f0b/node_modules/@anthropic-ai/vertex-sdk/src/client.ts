import { BaseAnthropic, ClientOptions as CoreClientOptions } from '@anthropic-ai/sdk/client';
import * as Resources from '@anthropic-ai/sdk/resources/index';
import { GoogleAuth, AuthClient } from 'google-auth-library';
import { readEnv } from './internal/utils/env';
import { FinalRequestOptions } from './internal/request-options';
import { FinalizedRequestInit } from './internal/types';
import { isObj } from './internal/utils/values';
import { buildHeaders } from './internal/headers';

export { BaseAnthropic } from '@anthropic-ai/sdk/client';

const DEFAULT_VERSION = 'vertex-2023-10-16';
const MODEL_ENDPOINTS = new Set<string>(['/v1/messages', '/v1/messages?beta=true']);

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

export class AnthropicVertex extends BaseAnthropic {
  region: string;
  projectId: string | null;
  accessToken: string | null;

  private _auth?: GoogleAuth;
  private _authClientPromise: Promise<AuthClient>;

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
  constructor({
    baseURL = readEnv('ANTHROPIC_VERTEX_BASE_URL'),
    region = readEnv('CLOUD_ML_REGION') ?? null,
    projectId = readEnv('ANTHROPIC_VERTEX_PROJECT_ID') ?? null,
    ...opts
  }: ClientOptions = {}) {
    if (!region) {
      throw new Error(
        'No region was given. The client should be instantiated with the `region` option or the `CLOUD_ML_REGION` environment variable should be set.',
      );
    }

    super({
      baseURL:
        baseURL ||
        (region === 'global' ?
          'https://aiplatform.googleapis.com/v1'
        : `https://${region}-aiplatform.googleapis.com/v1`),
      ...opts,
    });

    this.region = region;
    this.projectId = projectId;
    this.accessToken = opts.accessToken ?? null;

    if (opts.authClient && opts.googleAuth) {
      throw new Error(
        'You cannot provide both `authClient` and `googleAuth`. Please provide only one of them.',
      );
    } else if (opts.authClient) {
      this._authClientPromise = Promise.resolve(opts.authClient);
    } else {
      this._auth =
        opts.googleAuth ?? new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
      this._authClientPromise = this._auth.getClient();
    }
  }

  messages: MessagesResource = makeMessagesResource(this);
  beta: BetaResource = makeBetaResource(this);

  protected override validateHeaders() {
    // auth validation is handled in prepareOptions since it needs to be async
  }

  protected override async prepareOptions(options: FinalRequestOptions): Promise<void> {
    const authClient = await this._authClientPromise;

    const authHeaders = await authClient.getRequestHeaders();
    const projectId = authClient.projectId ?? authHeaders['x-goog-user-project'];
    if (!this.projectId && projectId) {
      this.projectId = projectId;
    }

    options.headers = buildHeaders([authHeaders, options.headers]);
  }

  override async buildRequest(options: FinalRequestOptions): Promise<{
    req: FinalizedRequestInit;
    url: string;
    timeout: number;
  }> {
    if (isObj(options.body)) {
      // create a shallow copy of the request body so that code that mutates it later
      // doesn't mutate the original user-provided object
      options.body = { ...options.body };
    }

    if (isObj(options.body)) {
      if (!options.body['anthropic_version']) {
        options.body['anthropic_version'] = DEFAULT_VERSION;
      }
    }

    if (MODEL_ENDPOINTS.has(options.path) && options.method === 'post') {
      if (!this.projectId) {
        throw new Error(
          'No projectId was given and it could not be resolved from credentials. The client should be instantiated with the `projectId` option or the `ANTHROPIC_VERTEX_PROJECT_ID` environment variable should be set.',
        );
      }

      if (!isObj(options.body)) {
        throw new Error('Expected request body to be an object for post /v1/messages');
      }

      const model = options.body['model'];
      options.body['model'] = undefined;

      const stream = options.body['stream'] ?? false;

      const specifier = stream ? 'streamRawPredict' : 'rawPredict';

      options.path = `/projects/${this.projectId}/locations/${this.region}/publishers/anthropic/models/${model}:${specifier}`;
    }

    if (
      options.path === '/v1/messages/count_tokens' ||
      (options.path == '/v1/messages/count_tokens?beta=true' && options.method === 'post')
    ) {
      if (!this.projectId) {
        throw new Error(
          'No projectId was given and it could not be resolved from credentials. The client should be instantiated with the `projectId` option or the `ANTHROPIC_VERTEX_PROJECT_ID` environment variable should be set.',
        );
      }

      options.path = `/projects/${this.projectId}/locations/${this.region}/publishers/anthropic/models/count-tokens:rawPredict`;
    }

    return super.buildRequest(options);
  }
}

/**
 * The Vertex SDK does not currently support the Batch API.
 */
type MessagesResource = Omit<Resources.Messages, 'batches'>;

function makeMessagesResource(client: AnthropicVertex): MessagesResource {
  const resource = new Resources.Messages(client);

  // @ts-expect-error we're deleting non-optional properties
  delete resource.batches;

  return resource;
}

/**
 * The Vertex API does not currently support the Batch API.
 */
type BetaResource = Omit<Resources.Beta, 'messages'> & {
  messages: Omit<Resources.Beta['messages'], 'batches'>;
};

function makeBetaResource(client: AnthropicVertex): BetaResource {
  const resource = new Resources.Beta(client);

  // @ts-expect-error we're deleting non-optional properties
  delete resource.messages.batches;

  return resource;
}
