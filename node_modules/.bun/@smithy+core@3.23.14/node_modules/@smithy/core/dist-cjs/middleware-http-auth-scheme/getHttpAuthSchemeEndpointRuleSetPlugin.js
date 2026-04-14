"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHttpAuthSchemeEndpointRuleSetPlugin = exports.httpAuthSchemeEndpointRuleSetMiddlewareOptions = void 0;
const httpAuthSchemeMiddleware_1 = require("./httpAuthSchemeMiddleware");
exports.httpAuthSchemeEndpointRuleSetMiddlewareOptions = {
    step: "serialize",
    tags: ["HTTP_AUTH_SCHEME"],
    name: "httpAuthSchemeMiddleware",
    override: true,
    relation: "before",
    toMiddleware: "endpointV2Middleware",
};
const getHttpAuthSchemeEndpointRuleSetPlugin = (config, { httpAuthSchemeParametersProvider, identityProviderConfigProvider, }) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo((0, httpAuthSchemeMiddleware_1.httpAuthSchemeMiddleware)(config, {
            httpAuthSchemeParametersProvider,
            identityProviderConfigProvider,
        }), exports.httpAuthSchemeEndpointRuleSetMiddlewareOptions);
    },
});
exports.getHttpAuthSchemeEndpointRuleSetPlugin = getHttpAuthSchemeEndpointRuleSetPlugin;
