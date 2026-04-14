"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.httpSigningMiddleware = void 0;
const protocol_http_1 = require("@smithy/protocol-http");
const util_middleware_1 = require("@smithy/util-middleware");
const defaultErrorHandler = (signingProperties) => (error) => {
    throw error;
};
const defaultSuccessHandler = (httpResponse, signingProperties) => { };
const httpSigningMiddleware = (config) => (next, context) => async (args) => {
    if (!protocol_http_1.HttpRequest.isInstance(args.request)) {
        return next(args);
    }
    const smithyContext = (0, util_middleware_1.getSmithyContext)(context);
    const scheme = smithyContext.selectedHttpAuthScheme;
    if (!scheme) {
        throw new Error(`No HttpAuthScheme was selected: unable to sign request`);
    }
    const { httpAuthOption: { signingProperties = {} }, identity, signer, } = scheme;
    const output = await next({
        ...args,
        request: await signer.sign(args.request, identity, signingProperties),
    }).catch((signer.errorHandler || defaultErrorHandler)(signingProperties));
    (signer.successHandler || defaultSuccessHandler)(output.response, signingProperties);
    return output;
};
exports.httpSigningMiddleware = httpSigningMiddleware;
