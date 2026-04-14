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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthHeaders = void 0;
const sha256_js_1 = require("@aws-crypto/sha256-js");
const fetch_http_handler_1 = require("@smithy/fetch-http-handler");
const protocol_http_1 = require("@smithy/protocol-http");
const signature_v4_1 = require("@smithy/signature-v4");
const assert_1 = __importDefault(require("assert"));
const DEFAULT_PROVIDER_CHAIN_RESOLVER = () => Promise.resolve().then(() => __importStar(require('@aws-sdk/credential-providers'))).then(({ fromNodeProviderChain }) => fromNodeProviderChain({
    clientConfig: {
        requestHandler: new fetch_http_handler_1.FetchHttpHandler({
            requestInit: (httpRequest) => {
                return {
                    ...httpRequest,
                };
            },
        }),
    },
}))
    .catch((error) => {
    throw new Error(`Failed to import '@aws-sdk/credential-providers'.` +
        `You can provide a custom \`providerChainResolver\` in the client options if your runtime does not have access to '@aws-sdk/credential-providers': ` +
        `\`new AnthropicBedrock({ providerChainResolver })\` ` +
        `Original error: ${error.message}`);
});
const getAuthHeaders = async (req, props) => {
    (0, assert_1.default)(req.method, 'Expected request method property to be set');
    let credentials;
    if (props.awsAccessKey && props.awsSecretKey) {
        credentials = {
            accessKeyId: props.awsAccessKey,
            secretAccessKey: props.awsSecretKey,
            ...(props.awsSessionToken != null && { sessionToken: props.awsSessionToken }),
        };
    }
    else {
        const provider = await (props.providerChainResolver ?
            props.providerChainResolver()
            : DEFAULT_PROVIDER_CHAIN_RESOLVER());
        credentials = await provider();
    }
    const signer = new signature_v4_1.SignatureV4({
        service: 'bedrock',
        region: props.regionName,
        credentials,
        sha256: sha256_js_1.Sha256,
    });
    const url = new URL(props.url);
    const headers = !req.headers ? {}
        : Symbol.iterator in req.headers ?
            Object.fromEntries(Array.from(req.headers).map((header) => [...header]))
            : { ...req.headers };
    // The connection header may be stripped by a proxy somewhere, so the receiver
    // of this message may not see this header, so we remove it from the set of headers
    // that are signed.
    delete headers['connection'];
    headers['host'] = url.hostname;
    const request = new protocol_http_1.HttpRequest({
        method: req.method.toUpperCase(),
        protocol: url.protocol,
        path: url.pathname,
        headers,
        body: req.body,
    });
    const signed = await signer.sign(request);
    return signed.headers;
};
exports.getAuthHeaders = getAuthHeaders;
//# sourceMappingURL=auth.js.map