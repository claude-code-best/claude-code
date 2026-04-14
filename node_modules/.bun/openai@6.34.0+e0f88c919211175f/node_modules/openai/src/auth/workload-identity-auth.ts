import type { WorkloadIdentity, TokenExchangeResponse } from './types';
import type { Fetch } from '../internal/builtin-types';
import * as Shims from '../internal/shims';
import { APIError, OAuthError } from '../core/error';

interface CachedToken {
  token: string;
  expiresAt: number;
}

const SUBJECT_TOKEN_TYPES: Record<string, string> = {
  jwt: 'urn:ietf:params:oauth:token-type:jwt',
  id: 'urn:ietf:params:oauth:token-type:id_token',
};

const TOKEN_EXCHANGE_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:token-exchange';

export class WorkloadIdentityAuth {
  private cachedToken: CachedToken | null = null;
  private refreshPromise: Promise<string> | null = null;
  private readonly config: WorkloadIdentity;
  private readonly tokenExchangeUrl: string = 'https://auth.openai.com/oauth/token';
  private readonly fetch: Fetch;

  constructor(config: WorkloadIdentity, fetch?: Fetch) {
    this.config = config;
    this.fetch = fetch ?? Shims.getDefaultFetch();
  }

  async getToken(): Promise<string> {
    if (!this.cachedToken || this.isTokenExpired(this.cachedToken)) {
      if (this.refreshPromise) {
        return await this.refreshPromise;
      }

      this.refreshPromise = this.refreshToken();

      try {
        const token = await this.refreshPromise;
        return token;
      } finally {
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

  private async refreshToken(): Promise<string> {
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
      let body: any = undefined;

      try {
        body = JSON.parse(errorText);
      } catch {}

      if (response.status === 400 || response.status === 401 || response.status === 403) {
        throw new OAuthError(response.status as 400 | 401 | 403, body, response.headers);
      }
      throw APIError.generate(
        response.status,
        body,
        `Token exchange failed with status ${response.status}`,
        response.headers,
      );
    }

    const tokenResponse = (await response.json()) as TokenExchangeResponse;
    const expiresIn = tokenResponse.expires_in || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    this.cachedToken = {
      token: tokenResponse.access_token,
      expiresAt,
    };

    return tokenResponse.access_token;
  }

  private isTokenExpired(cachedToken: CachedToken): boolean {
    return Date.now() >= cachedToken.expiresAt;
  }

  private needsRefresh(cachedToken: CachedToken): boolean {
    const bufferSeconds = this.config.refreshBufferSeconds ?? 1200;
    const bufferMs = bufferSeconds * 1000;
    return Date.now() >= cachedToken.expiresAt - bufferMs;
  }

  invalidateToken(): void {
    this.cachedToken = null;
    this.refreshPromise = null;
  }
}
