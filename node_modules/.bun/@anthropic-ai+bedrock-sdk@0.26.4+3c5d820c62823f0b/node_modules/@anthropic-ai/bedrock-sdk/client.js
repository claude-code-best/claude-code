"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.AnthropicBedrock = exports.BaseAnthropic = void 0;
const client_1 = require("@anthropic-ai/sdk/client");
const Resources = __importStar(require("@anthropic-ai/sdk/resources/index"));
const auth_1 = require("./core/auth.js");
const streaming_1 = require("./core/streaming.js");
const env_1 = require("./internal/utils/env.js");
const values_1 = require("./internal/utils/values.js");
const headers_1 = require("./internal/headers.js");
const path_1 = require("./internal/utils/path.js");
const log_1 = require("./internal/utils/log.js");
var client_2 = require("@anthropic-ai/sdk/client");
Object.defineProperty(exports, "BaseAnthropic", { enumerable: true, get: function () { return client_2.BaseAnthropic; } });
const DEFAULT_VERSION = 'bedrock-2023-05-31';
const MODEL_ENDPOINTS = new Set(['/v1/complete', '/v1/messages', '/v1/messages?beta=true']);
/** API Client for interfacing with the Anthropic Bedrock API. */
class AnthropicBedrock extends client_1.BaseAnthropic {
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
    constructor({ awsRegion = (0, env_1.readEnv)('AWS_REGION') ?? 'us-east-1', baseURL = (0, env_1.readEnv)('ANTHROPIC_BEDROCK_BASE_URL') ?? `https://bedrock-runtime.${awsRegion}.amazonaws.com`, awsSecretKey = null, awsAccessKey = null, awsSessionToken = null, providerChainResolver = null, ...opts } = {}) {
        super({ baseURL, ...opts });
        this.skipAuth = false;
        this.messages = makeMessagesResource(this);
        this.completions = new Resources.Completions(this);
        this.beta = makeBetaResource(this);
        const hasAccess = awsAccessKey != null;
        const hasSecret = awsSecretKey != null;
        if (hasAccess !== hasSecret) {
            (0, log_1.loggerFor)(this).warn('Warning: Passing only one of `awsAccessKey` or `awsSecretKey` is deprecated. ' +
                'Please provide both keys, or provide neither and rely on the AWS credential provider chain.');
        }
        this.awsSecretKey = awsSecretKey;
        this.awsAccessKey = awsAccessKey;
        this.awsRegion = awsRegion;
        this.awsSessionToken = awsSessionToken;
        this.skipAuth = opts.skipAuth ?? false;
        this.providerChainResolver = providerChainResolver;
    }
    validateHeaders() {
        // auth validation is handled in prepareRequest since it needs to be async
    }
    async prepareRequest(request, { url, options }) {
        if (this.skipAuth) {
            return;
        }
        const regionName = this.awsRegion;
        if (!regionName) {
            throw new Error('Expected `awsRegion` option to be passed to the client or the `AWS_REGION` environment variable to be present');
        }
        const headers = await (0, auth_1.getAuthHeaders)(request, {
            url,
            regionName,
            awsAccessKey: this.awsAccessKey,
            awsSecretKey: this.awsSecretKey,
            awsSessionToken: this.awsSessionToken,
            fetchOptions: this.fetchOptions,
            providerChainResolver: this.providerChainResolver,
        });
        request.headers = (0, headers_1.buildHeaders)([headers, request.headers]).values;
    }
    async buildRequest(options) {
        options.__streamClass = streaming_1.Stream;
        if ((0, values_1.isObj)(options.body)) {
            // create a shallow copy of the request body so that code that mutates it later
            // doesn't mutate the original user-provided object
            options.body = { ...options.body };
        }
        if ((0, values_1.isObj)(options.body)) {
            if (!options.body['anthropic_version']) {
                options.body['anthropic_version'] = DEFAULT_VERSION;
            }
            if (options.headers && !options.body['anthropic_beta']) {
                const betas = (0, headers_1.buildHeaders)([options.headers]).values.get('anthropic-beta');
                if (betas != null) {
                    options.body['anthropic_beta'] = betas.split(',');
                }
            }
        }
        if (MODEL_ENDPOINTS.has(options.path) && options.method === 'post') {
            if (!(0, values_1.isObj)(options.body)) {
                throw new Error('Expected request body to be an object for post /v1/messages');
            }
            const model = options.body['model'];
            options.body['model'] = undefined;
            const stream = options.body['stream'];
            options.body['stream'] = undefined;
            if (stream) {
                options.path = (0, path_1.path) `/model/${model}/invoke-with-response-stream`;
            }
            else {
                options.path = (0, path_1.path) `/model/${model}/invoke`;
            }
        }
        return super.buildRequest(options);
    }
}
exports.AnthropicBedrock = AnthropicBedrock;
function makeMessagesResource(client) {
    const resource = new Resources.Messages(client);
    // @ts-expect-error we're deleting non-optional properties
    delete resource.batches;
    // @ts-expect-error we're deleting non-optional properties
    delete resource.countTokens;
    return resource;
}
function makeBetaResource(client) {
    const resource = new Resources.Beta(client);
    // @ts-expect-error we're deleting non-optional properties
    delete resource.promptCaching;
    // @ts-expect-error we're deleting non-optional properties
    delete resource.messages.batches;
    // @ts-expect-error we're deleting non-optional properties
    delete resource.messages.countTokens;
    return resource;
}
//# sourceMappingURL=client.js.map