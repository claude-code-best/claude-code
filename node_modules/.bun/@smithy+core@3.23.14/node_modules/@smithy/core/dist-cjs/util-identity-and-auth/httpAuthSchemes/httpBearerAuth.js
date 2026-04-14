"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HttpBearerAuthSigner = void 0;
const protocol_http_1 = require("@smithy/protocol-http");
class HttpBearerAuthSigner {
    async sign(httpRequest, identity, signingProperties) {
        const clonedRequest = protocol_http_1.HttpRequest.clone(httpRequest);
        if (!identity.token) {
            throw new Error("request could not be signed with `token` since the `token` is not defined");
        }
        clonedRequest.headers["Authorization"] = `Bearer ${identity.token}`;
        return clonedRequest;
    }
}
exports.HttpBearerAuthSigner = HttpBearerAuthSigner;
