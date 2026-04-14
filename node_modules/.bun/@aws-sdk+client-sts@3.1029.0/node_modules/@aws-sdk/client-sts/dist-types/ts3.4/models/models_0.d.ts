export interface AssumedRoleUser {
  AssumedRoleId: string | undefined;
  Arn: string | undefined;
}
export interface PolicyDescriptorType {
  arn?: string | undefined;
}
export interface ProvidedContext {
  ProviderArn?: string | undefined;
  ContextAssertion?: string | undefined;
}
export interface Tag {
  Key: string | undefined;
  Value: string | undefined;
}
export interface AssumeRoleRequest {
  RoleArn: string | undefined;
  RoleSessionName: string | undefined;
  PolicyArns?: PolicyDescriptorType[] | undefined;
  Policy?: string | undefined;
  DurationSeconds?: number | undefined;
  Tags?: Tag[] | undefined;
  TransitiveTagKeys?: string[] | undefined;
  ExternalId?: string | undefined;
  SerialNumber?: string | undefined;
  TokenCode?: string | undefined;
  SourceIdentity?: string | undefined;
  ProvidedContexts?: ProvidedContext[] | undefined;
}
export interface Credentials {
  AccessKeyId: string | undefined;
  SecretAccessKey: string | undefined;
  SessionToken: string | undefined;
  Expiration: Date | undefined;
}
export interface AssumeRoleResponse {
  Credentials?: Credentials | undefined;
  AssumedRoleUser?: AssumedRoleUser | undefined;
  PackedPolicySize?: number | undefined;
  SourceIdentity?: string | undefined;
}
export interface AssumeRoleWithSAMLRequest {
  RoleArn: string | undefined;
  PrincipalArn: string | undefined;
  SAMLAssertion: string | undefined;
  PolicyArns?: PolicyDescriptorType[] | undefined;
  Policy?: string | undefined;
  DurationSeconds?: number | undefined;
}
export interface AssumeRoleWithSAMLResponse {
  Credentials?: Credentials | undefined;
  AssumedRoleUser?: AssumedRoleUser | undefined;
  PackedPolicySize?: number | undefined;
  Subject?: string | undefined;
  SubjectType?: string | undefined;
  Issuer?: string | undefined;
  Audience?: string | undefined;
  NameQualifier?: string | undefined;
  SourceIdentity?: string | undefined;
}
export interface AssumeRoleWithWebIdentityRequest {
  RoleArn: string | undefined;
  RoleSessionName: string | undefined;
  WebIdentityToken: string | undefined;
  ProviderId?: string | undefined;
  PolicyArns?: PolicyDescriptorType[] | undefined;
  Policy?: string | undefined;
  DurationSeconds?: number | undefined;
}
export interface AssumeRoleWithWebIdentityResponse {
  Credentials?: Credentials | undefined;
  SubjectFromWebIdentityToken?: string | undefined;
  AssumedRoleUser?: AssumedRoleUser | undefined;
  PackedPolicySize?: number | undefined;
  Provider?: string | undefined;
  Audience?: string | undefined;
  SourceIdentity?: string | undefined;
}
export interface AssumeRootRequest {
  TargetPrincipal: string | undefined;
  TaskPolicyArn: PolicyDescriptorType | undefined;
  DurationSeconds?: number | undefined;
}
export interface AssumeRootResponse {
  Credentials?: Credentials | undefined;
  SourceIdentity?: string | undefined;
}
export interface DecodeAuthorizationMessageRequest {
  EncodedMessage: string | undefined;
}
export interface DecodeAuthorizationMessageResponse {
  DecodedMessage?: string | undefined;
}
export interface GetAccessKeyInfoRequest {
  AccessKeyId: string | undefined;
}
export interface GetAccessKeyInfoResponse {
  Account?: string | undefined;
}
export interface GetCallerIdentityRequest {}
export interface GetCallerIdentityResponse {
  UserId?: string | undefined;
  Account?: string | undefined;
  Arn?: string | undefined;
}
export interface GetDelegatedAccessTokenRequest {
  TradeInToken: string | undefined;
}
export interface GetDelegatedAccessTokenResponse {
  Credentials?: Credentials | undefined;
  PackedPolicySize?: number | undefined;
  AssumedPrincipal?: string | undefined;
}
export interface GetFederationTokenRequest {
  Name: string | undefined;
  Policy?: string | undefined;
  PolicyArns?: PolicyDescriptorType[] | undefined;
  DurationSeconds?: number | undefined;
  Tags?: Tag[] | undefined;
}
export interface FederatedUser {
  FederatedUserId: string | undefined;
  Arn: string | undefined;
}
export interface GetFederationTokenResponse {
  Credentials?: Credentials | undefined;
  FederatedUser?: FederatedUser | undefined;
  PackedPolicySize?: number | undefined;
}
export interface GetSessionTokenRequest {
  DurationSeconds?: number | undefined;
  SerialNumber?: string | undefined;
  TokenCode?: string | undefined;
}
export interface GetSessionTokenResponse {
  Credentials?: Credentials | undefined;
}
export interface GetWebIdentityTokenRequest {
  Audience: string[] | undefined;
  DurationSeconds?: number | undefined;
  SigningAlgorithm: string | undefined;
  Tags?: Tag[] | undefined;
}
export interface GetWebIdentityTokenResponse {
  WebIdentityToken?: string | undefined;
  Expiration?: Date | undefined;
}
