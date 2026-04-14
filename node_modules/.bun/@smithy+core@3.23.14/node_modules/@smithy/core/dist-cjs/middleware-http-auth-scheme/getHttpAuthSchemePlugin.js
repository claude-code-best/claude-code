"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHttpAuthSchemePlugin = exports.httpAuthSchemeMiddlewareOptions = void 0;
const httpAuthSchemeMiddleware_1 = require("./httpAuthSchemeMiddleware");
exports.httpAuthSchemeMiddlewareOptions = {
    step: "serialize",
    tags: ["HTTP_AUTH_SCHEME"],
    name: "httpAuthSchemeMiddleware",
    override: true,
    relation: "before",
    toMiddleware: "serializerMiddleware",
};
const getHttpAuthSchemePlugin = (config, { httpAuthSchemeParametersProvider, identityProviderConfigProvider, }) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo((0, httpAuthSchemeMiddleware_1.httpAuthSchemeMiddleware)(config, {
            httpAuthSchemeParametersProvider,
            identityProviderConfigProvider,
        }), exports.httpAuthSchemeMiddlewareOptions);
    },
});
exports.getHttpAuthSchemePlugin = getHttpAuthSchemePlugin;
