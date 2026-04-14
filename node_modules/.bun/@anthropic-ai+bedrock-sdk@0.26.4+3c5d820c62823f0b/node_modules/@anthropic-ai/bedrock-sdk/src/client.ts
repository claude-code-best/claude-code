import { BaseAnthropic, ClientOptions as CoreClientOptions } from '@anthropic-ai/sdk/client';
import * as Resources from '@anthropic-ai/sdk/resources/index';
import { AwsCredentialIdentityProvider } from '@smithy/types';
import { getAuthHeaders } from './core/auth';
import { Stream } from './core/streaming';
import { readEnv } from './internal/utils/env';
import { FinalRequestOptions } from './internal/request-options';
import { isObj } from './internal/utils/values';
import { buildHeaders } from './internal/headers';
import { FinalizedRequestInit } from './internal/types';
import { path } from './internal/utils/path';
import { loggerFor } from './internal/utils/log';

export { BaseAnthropic } from '@anthropic-ai/sdk/client';

const DEFAULT_VERSION = 'bedrock-2023-05-31';
const MODEL_ENDPOINTS = new Set<string>(['/v1/complete', '/v1/messages', '/v1/messages?beta=true']);

export type ClientOptions = Omit<CoreClientOptions, 'apiKey' | 'authToken'> & {
  awsSecretKey?: string | null | undefined;
  awsAccessKey?: string | null | undefined;

  /**
   * Defaults to process.env['AWS_REGION'].
   */
  awsRegion?: string | undefined;
  awsSessionToken?: string | null | undefined;
  skipAuth?: boolean;

  /** Custom provider chain resolver for AWS credentials. Useful for non-Node environments, like edge workers, where the default credential provider chain may not work. */
  providerChainResolver?: (() => Promise<AwsCredentialIdentityProvider>) | null;
};

type BothStaticCreds = {
  awsAccessKey: string;
  awsSecretKey: string;
  awsSessionToken?: string | null | undefined;
};

type NoStaticCreds = {
  awsAccessKey?: null | undefined;
  awsSecretKey?: null | undefined;
  awsSessionToken?: null | undefined;
};

type AccessOnly = {
  awsAccessKey: string;
  awsSecretKey?: null | undefined;
  awsSessionToken?: string | null | undefined;
};

type SecretOnly = {
  awsSecretKey: string;
  awsAccessKey?: null | undefined;
  awsSessionToken?: string | null | undefined;
};

/** API Client for interfacing with the Anthropic Bedrock API. */
export class AnthropicBedrock extends BaseAnthropic {
  awsSecretKey: string | null;
  awsAccessKey: string | null;
  awsRegion: string;
  awsSessionToken: string | null;
  skipAuth: boolean = false;
  providerChainResolver: (() => Promise<AwsCredentialIdentityProvider>) | null;

  constructor(opts: ClientOptions & BothStaticCreds);
  constructor(opts?: ClientOptions & NoStaticCreds);

  /**
   * @deprecated Passing only `awsAccessKey` without `awsSecretKey` is deprecated.
   * Provide both keys, or provide neither and rely on the AWS credential provider chain.
   */
  constructor(opts: ClientOptions & AccessOnly);

  /**
   * @deprecated Passing only `awsSecretKey` without `awsAccessKey` is deprecated.
   * Provide both keys, or provide neither and rely on the AWS credential provider chain.
   */
  constructor(opts: ClientOptions & SecretOnly);

  /**
   * API Client for interfacing with the Anthropic Bedrock API.
   *
   * @param {string | null | undefined} [opts.awsSecretKey]
   * @param {string | null | undefined} [opts.awsAccessKey]
   * @param {string | undefined} [opts.awsRegion=process.env['AWS_REGION'] ?? us-east-1]
   * @param {string | null | undefined} [opts.awsSessionToken]
   * @param {(() => Promise<AwsCredentialIdentityProvider>) | null} [opts.providerChainResolver] - Custom provider chain resolver for AWS credentials. Useful for non-Node environments.
   * @param {string} [opts.baseURL=process.env['ANTHROPIC_BEDROCK_BASE_URL'] ?? https://bedrock-runtime.${this.awsRegion}.amazonaws.com] - Override the default base URL for the API.
   * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
   * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
   * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
   * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
   * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
   * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
   * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
   * @param {boolean} [opts.skipAuth=false] - Skip authentication for this request. This is useful if you have an internal proxy that handles authentication for you.
   */
  constructor({
    awsRegion = readEnv('AWS_REGION') ?? 'us-east-1',
    baseURL = readEnv('ANTHROPIC_BEDROCK_BASE_URL') ?? `https://bedrock-runtime.${awsRegion}.amazonaws.com`,
    awsSecretKey = null,
    awsAccessKey = null,
    awsSessionToken = null,
    providerChainResolver = null,
    ...opts
  }: ClientOptions = {}) {
    super({ baseURL, ...opts });

    const hasAccess = awsAccessKey != null;
    const hasSecret = awsSecretKey != null;
    if (hasAccess !== hasSecret) {
      loggerFor(this).warn(
        'Warning: Passing only one of `awsAccessKey` or `awsSecretKey` is deprecated. ' +
          'Please provide both keys, or provide neither and rely on the AWS credential provider chain.',
      );
    }

    this.awsSecretKey = awsSecretKey;
    this.awsAccessKey = awsAccessKey;
    this.awsRegion = awsRegion;
    this.awsSessionToken = awsSessionToken;
    this.skipAuth = opts.skipAuth ?? false;
    this.providerChainResolver = providerChainResolver;
  }

  messages: MessagesResource = makeMessagesResource(this);
  completions: Resources.Completions = new Resources.Completions(this);
  beta: BetaResource = makeBetaResource(this);

  protected override validateHeaders() {
    // auth validation is handled in prepareRequest since it needs to be async
  }

  protected override async prepareRequest(
    request: FinalizedRequestInit,
    { url, options }: { url: string; options: FinalRequestOptions },
  ): Promise<void> {
    if (this.skipAuth) {
      return;
    }
    const regionName = this.awsRegion;
    if (!regionName) {
      throw new Error(
        'Expected `awsRegion` option to be passed to the client or the `AWS_REGION` environment variable to be present',
      );
    }

    const headers = await getAuthHeaders(request, {
      url,
      regionName,
      awsAccessKey: this.awsAccessKey,
      awsSecretKey: this.awsSecretKey,
      awsSessionToken: this.awsSessionToken,
      fetchOptions: this.fetchOptions,
      providerChainResolver: this.providerChainResolver,
    });
    request.headers = buildHeaders([headers, request.headers]).values;
  }

  override async buildRequest(options: FinalRequestOptions): Promise<{
    req: FinalizedRequestInit;
    url: string;
    timeout: number;
  }> {
    options.__streamClass = Stream;

    if (isObj(options.body)) {
      // create a shallow copy of the request body so that code that mutates it later
      // doesn't mutate the original user-provided object
      options.body = { ...options.body };
    }

    if (isObj(options.body)) {
      if (!options.body['anthropic_version']) {
        options.body['anthropic_version'] = DEFAULT_VERSION;
      }

      if (options.headers && !options.body['anthropic_beta']) {
        const betas = buildHeaders([options.headers]).values.get('anthropic-beta');
        if (betas != null) {
          options.body['anthropic_beta'] = betas.split(',');
        }
      }
    }

    if (MODEL_ENDPOINTS.has(options.path) && options.method === 'post') {
      if (!isObj(options.body)) {
        throw new Error('Expected request body to be an object for post /v1/messages');
      }

      const model = options.body['model'] as string;
      options.body['model'] = undefined;

      const stream = options.body['stream'];
      options.body['stream'] = undefined;

      if (stream) {
        options.path = path`/model/${model}/invoke-with-response-stream`;
      } else {
        options.path = path`/model/${model}/invoke`;
      }
    }

    return super.buildRequest(options);
  }
}

/**
 * The Bedrock API does not currently support token counting or the Batch API.
 */
type MessagesResource = Omit<Resources.Messages, 'batches' | 'countTokens'>;

function makeMessagesResource(client: AnthropicBedrock): MessagesResource {
  const resource = new Resources.Messages(client);

  // @ts-expect-error we're deleting non-optional properties
  delete resource.batches;

  // @ts-expect-error we're deleting non-optional properties
  delete resource.countTokens;

  return resource;
}

/**
 * The Bedrock API does not currently support prompt caching, token counting or the Batch API.
 */
type BetaResource = Omit<Resources.Beta, 'promptCaching' | 'messages'> & {
  messages: Omit<Resources.Beta['messages'], 'batches' | 'countTokens'>;
};

function makeBetaResource(client: AnthropicBedrock): BetaResource {
  const resource = new Resources.Beta(client);

  // @ts-expect-error we're deleting non-optional properties
  delete resource.promptCaching;

  // @ts-expect-error we're deleting non-optional properties
  delete resource.messages.batches;

  // @ts-expect-error we're deleting non-optional properties
  delete resource.messages.countTokens;

  return resource;
}
