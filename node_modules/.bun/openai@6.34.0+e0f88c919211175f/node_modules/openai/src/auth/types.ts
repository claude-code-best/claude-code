export interface SubjectTokenProvider {
  tokenType: 'jwt' | 'id';
  getToken: () => Promise<string>;
}

export interface WorkloadIdentity {
  /**A unique string that identifies the client.*/
  clientId: string;

  /**Identity provider resource id in WIFAPI.*/
  identityProviderId: string;

  /**OpenAI Service account id to bind the verified external identity to.*/
  serviceAccountId: string;

  /**The provider configuration for obtaining the subject token.*/
  provider: SubjectTokenProvider;

  /**Optional buffer time in seconds to refresh the OpenAI token before it expires. Defaults to 1200 seconds (20 minutes).*/
  refreshBufferSeconds?: number;
}

export interface TokenExchangeResponse {
  access_token: string;
  issued_token_type: string;
  token_type: string;
  expires_in?: number;
}
