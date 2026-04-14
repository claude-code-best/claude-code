"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkloadIdentityAuth = void 0;
const tslib_1 = require("../internal/tslib.js");
const Shims = tslib_1.__importStar(require("../internal/shims.js"));
const error_1 = require("../core/error.js");
const SUBJECT_TOKEN_TYPES = {
    jwt: 'urn:ietf:params:oauth:token-type:jwt',
    id: 'urn:ietf:params:oauth:token-type:id_token',
};
const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';
class WorkloadIdentityAuth {
    constructor(config, fetch) {
        this.cachedToken = null;
        this.refreshPromise = null;
        this.tokenExchangeUrl = 'https://auth.openai.com/oauth/token';
        this.config = config;
        this.fetch = fetch ?? Shims.getDefaultFetch();
    }
    async getToken() {
        if (!this.cachedToken || this.isTokenExpired(this.cachedToken)) {
            if (this.refreshPromise) {
                return await this.refreshPromise;
            }
            this.refreshPromise = this.refreshToken();
            try {
                const token = await this.refreshPromise;
                return token;
            }
            finally {
                this.refreshPromise = null;
            }
        }
        if (this.needsRefresh(this.cachedToken) && !this.refreshPromise) {
            this.refreshPromise = this.refreshToken().finally(() => {
                this.refreshPromise = null;
            });
        }
        return this.cachedToken.token;
    }
    async refreshToken() {
        const subjectToken = await this.config.provider.getToken();
        const response = await this.fetch(this.tokenExchangeUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                grant_type: TOKEN_EXCHANGE_GRANT_TYPE,
                client_id: this.config.clientId,
                subject_token: subjectToken,
                subject_token_type: SUBJECT_TOKEN_TYPES[this.config.provider.tokenType],
                identity_provider_id: this.config.identityProviderId,
                service_account_id: this.config.serviceAccountId,
            }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            let body = undefined;
            try {
                body = JSON.parse(errorText);
            }
            catch { }
            if (response.status === 400 || response.status === 401 || response.status === 403) {
                throw new error_1.OAuthError(response.status, body, response.headers);
            }
            throw error_1.APIError.generate(response.status, body, `Token exchange failed with status ${response.status}`, response.headers);
        }
        const tokenResponse = (await response.json());
        const expiresIn = tokenResponse.expires_in || 3600;
        const expiresAt = Date.now() + expiresIn * 1000;
        this.cachedToken = {
            token: tokenResponse.access_token,
            expiresAt,
        };
        return tokenResponse.access_token;
    }
    isTokenExpired(cachedToken) {
        return Date.now() >= cachedToken.expiresAt;
    }
    needsRefresh(cachedToken) {
        const bufferSeconds = this.config.refreshBufferSeconds ?? 1200;
        const bufferMs = bufferSeconds * 1000;
        return Date.now() >= cachedToken.expiresAt - bufferMs;
    }
    invalidateToken() {
        this.cachedToken = null;
        this.refreshPromise = null;
    }
}
exports.WorkloadIdentityAuth = WorkloadIdentityAuth;
//# sourceMappingURL=workload-identity-auth.js.map