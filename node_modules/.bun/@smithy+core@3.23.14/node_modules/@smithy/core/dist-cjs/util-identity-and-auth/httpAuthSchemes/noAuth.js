"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NoAuthSigner = void 0;
class NoAuthSigner {
    async sign(httpRequest, identity, signingProperties) {
        return httpRequest;
    }
}
exports.NoAuthSigner = NoAuthSigner;
