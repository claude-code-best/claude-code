import type { NullableHeaders } from './internal/headers';
import { buildHeaders } from './internal/headers';
import * as Errors from './core/error';
import { readEnv } from './internal/utils';
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
export class AnthropicFoundry extends Anthropic {
  resource: string | null = null;

  // @ts-expect-error are using a different Messages type that omits batches
  override messages: MessagesResource = makeMessagesResource(this);

  // @ts-expect-error are using a different Beta type that omits batches
  override beta: BetaResource = makeBetaResource(this);

  // @ts-expect-error Anthropic Foundry does not support models endpoint
  override models = undefined;
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
  constructor({
    baseURL = readEnv('ANTHROPIC_FOUNDRY_BASE_URL'),
    apiKey = readEnv('ANTHROPIC_FOUNDRY_API_KEY'),
    resource = readEnv('ANTHROPIC_FOUNDRY_RESOURCE'),
    azureADTokenProvider,
    dangerouslyAllowBrowser,
    ...opts
  }: FoundryClientOptions = {}) {
    if (typeof azureADTokenProvider === 'function') {
      dangerouslyAllowBrowser = true;
    }

    if (!azureADTokenProvider && !apiKey) {
      throw new Errors.AnthropicError(
        'Missing credentials. Please pass one of `apiKey` and `azureTokenProvider`, or set the `ANTHROPIC_FOUNDRY_API_KEY` environment variable.',
      );
    }

    if (azureADTokenProvider && apiKey) {
      throw new Errors.AnthropicError(
        'The `apiKey` and `azureADTokenProvider` arguments are mutually exclusive; only one can be passed at a time.',
      );
    }

    if (!baseURL) {
      if (!resource) {
        throw new Errors.AnthropicError(
          'Must provide one of the `baseURL` or `resource` arguments, or the `ANTHROPIC_FOUNDRY_RESOURCE` environment variable',
        );
      }

      baseURL = `https://${resource}.services.ai.azure.com/anthropic/`;
    } else {
      if (resource) {
        throw new Errors.AnthropicError('baseURL and resource are mutually exclusive');
      }
    }

    super({
      apiKey: azureADTokenProvider ?? apiKey,
      baseURL,
      ...opts,
      ...(dangerouslyAllowBrowser !== undefined ? { dangerouslyAllowBrowser } : {}),
    });
  }

  protected override async authHeaders(): Promise<NullableHeaders | undefined> {
    if (typeof this._options.apiKey === 'function') {
      let token: unknown;
      try {
        token = await this._options.apiKey();
      } catch (err: any) {
        if (err instanceof Errors.AnthropicError) throw err;
        throw new Errors.AnthropicError(
          `Failed to get token from azureADTokenProvider: ${err.message}`,
          // @ts-ignore
          { cause: err },
        );
      }

      if (typeof token !== 'string' || !token) {
        throw new Errors.AnthropicError(
          `Expected azureADTokenProvider function argument to return a string but it returned ${token}`,
        );
      }

      return buildHeaders([{ Authorization: `Bearer ${token}` }]);
    }

    if (typeof this._options.apiKey === 'string') {
      return buildHeaders([{ 'x-api-key': this.apiKey }]);
    }

    return undefined;
  }

  protected override validateHeaders(): void {
    return;
  }
}

/**
 * The Anthropic Foundry does not currently support the Batch API.
 */
type MessagesResource = Omit<Resources.Messages, 'batches'>;

function makeMessagesResource(client: AnthropicFoundry): MessagesResource {
  const resource = new Resources.Messages(client);

  // @ts-expect-error we're deleting non-optional properties
  delete resource.batches;

  return resource;
}

/**
 * The Anthropic Foundry does not currently support the Batch API.
 */
type BetaResource = Omit<Resources.Beta, 'messages'> & {
  messages: Omit<Resources.Beta['messages'], 'batches'>;
};

function makeBetaResource(client: AnthropicFoundry): BetaResource {
  const resource = new Resources.Beta(client);

  // @ts-expect-error we're deleting non-optional properties
  delete resource.messages.batches;

  return resource;
}
