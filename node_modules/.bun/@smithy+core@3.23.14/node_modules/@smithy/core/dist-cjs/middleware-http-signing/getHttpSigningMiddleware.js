"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHttpSigningPlugin = exports.httpSigningMiddlewareOptions = void 0;
const httpSigningMiddleware_1 = require("./httpSigningMiddleware");
exports.httpSigningMiddlewareOptions = {
    step: "finalizeRequest",
    tags: ["HTTP_SIGNING"],
    name: "httpSigningMiddleware",
    aliases: ["apiKeyMiddleware", "tokenMiddleware", "awsAuthMiddleware"],
    override: true,
    relation: "after",
    toMiddleware: "retryMiddleware",
};
const getHttpSigningPlugin = (config) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo((0, httpSigningMiddleware_1.httpSigningMiddleware)(config), exports.httpSigningMiddlewareOptions);
    },
});
exports.getHttpSigningPlugin = getHttpSigningPlugin;
