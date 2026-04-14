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
exports.AnthropicFoundry = exports.BaseAnthropic = void 0;
const headers_1 = require("./internal/headers.js");
const Errors = __importStar(require("./core/error.js"));
const utils_1 = require("./internal/utils.js");
const client_1 = require("@anthropic-ai/sdk/client");
var client_2 = require("@anthropic-ai/sdk/client");
Object.defineProperty(exports, "BaseAnthropic", { enumerable: true, get: function () { return client_2.BaseAnthropic; } });
const Resources = __importStar(require("@anthropic-ai/sdk/resources/index"));
/** API Client for interfacing with the Anthropic Foundry API. */
class AnthropicFoundry extends client_1.Anthropic {
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
    constructor({ baseURL = (0, utils_1.readEnv)('ANTHROPIC_FOUNDRY_BASE_URL'), apiKey = (0, utils_1.readEnv)('ANTHROPIC_FOUNDRY_API_KEY'), resource = (0, utils_1.readEnv)('ANTHROPIC_FOUNDRY_RESOURCE'), azureADTokenProvider, dangerouslyAllowBrowser, ...opts } = {}) {
        if (typeof azureADTokenProvider === 'function') {
            dangerouslyAllowBrowser = true;
        }
        if (!azureADTokenProvider && !apiKey) {
            throw new Errors.AnthropicError('Missing credentials. Please pass one of `apiKey` and `azureTokenProvider`, or set the `ANTHROPIC_FOUNDRY_API_KEY` environment variable.');
        }
        if (azureADTokenProvider && apiKey) {
            throw new Errors.AnthropicError('The `apiKey` and `azureADTokenProvider` arguments are mutually exclusive; only one can be passed at a time.');
        }
        if (!baseURL) {
            if (!resource) {
                throw new Errors.AnthropicError('Must provide one of the `baseURL` or `resource` arguments, or the `ANTHROPIC_FOUNDRY_RESOURCE` environment variable');
            }
            baseURL = `https://${resource}.services.ai.azure.com/anthropic/`;
        }
        else {
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
        this.resource = null;
        // @ts-expect-error are using a different Messages type that omits batches
        this.messages = makeMessagesResource(this);
        // @ts-expect-error are using a different Beta type that omits batches
        this.beta = makeBetaResource(this);
        // @ts-expect-error Anthropic Foundry does not support models endpoint
        this.models = undefined;
    }
    async authHeaders() {
        if (typeof this._options.apiKey === 'function') {
            let token;
            try {
                token = await this._options.apiKey();
            }
            catch (err) {
                if (err instanceof Errors.AnthropicError)
                    throw err;
                throw new Errors.AnthropicError(`Failed to get token from azureADTokenProvider: ${err.message}`, 
                // @ts-ignore
                { cause: err });
            }
            if (typeof token !== 'string' || !token) {
                throw new Errors.AnthropicError(`Expected azureADTokenProvider function argument to return a string but it returned ${token}`);
            }
            return (0, headers_1.buildHeaders)([{ Authorization: `Bearer ${token}` }]);
        }
        if (typeof this._options.apiKey === 'string') {
            return (0, headers_1.buildHeaders)([{ 'x-api-key': this.apiKey }]);
        }
        return undefined;
    }
    validateHeaders() {
        return;
    }
}
exports.AnthropicFoundry = AnthropicFoundry;
function makeMessagesResource(client) {
    const resource = new Resources.Messages(client);
    // @ts-expect-error we're deleting non-optional properties
    delete resource.batches;
    return resource;
}
function makeBetaResource(client) {
    const resource = new Resources.Beta(client);
    // @ts-expect-error we're deleting non-optional properties
    delete resource.messages.batches;
    return resource;
}
//# sourceMappingURL=client.js.map