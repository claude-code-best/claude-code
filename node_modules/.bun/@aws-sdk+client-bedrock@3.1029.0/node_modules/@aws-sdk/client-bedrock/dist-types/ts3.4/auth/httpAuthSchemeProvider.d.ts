import {
  AwsSdkSigV4AuthInputConfig,
  AwsSdkSigV4AuthResolvedConfig,
  AwsSdkSigV4PreviouslyResolved,
} from "@aws-sdk/core/httpAuthSchemes";
import {
  HandlerExecutionContext,
  HttpAuthScheme,
  HttpAuthSchemeParameters,
  HttpAuthSchemeParametersProvider,
  HttpAuthSchemeProvider,
  Provider,
  TokenIdentity,
  TokenIdentityProvider,
} from "@smithy/types";
import { BedrockClientResolvedConfig } from "../BedrockClient";
export interface BedrockHttpAuthSchemeParameters
  extends HttpAuthSchemeParameters {
  region?: string;
}
export interface BedrockHttpAuthSchemeParametersProvider
  extends HttpAuthSchemeParametersProvider<
    BedrockClientResolvedConfig,
    HandlerExecutionContext,
    BedrockHttpAuthSchemeParameters,
    object
  > {}
export declare const defaultBedrockHttpAuthSchemeParametersProvider: (
  config: BedrockClientResolvedConfig,
  context: HandlerExecutionContext,
  input: object
) => Promise<BedrockHttpAuthSchemeParameters>;
export interface BedrockHttpAuthSchemeProvider
  extends HttpAuthSchemeProvider<BedrockHttpAuthSchemeParameters> {}
export declare const defaultBedrockHttpAuthSchemeProvider: BedrockHttpAuthSchemeProvider;
export interface HttpAuthSchemeInputConfig extends AwsSdkSigV4AuthInputConfig {
  authSchemePreference?: string[] | Provider<string[]>;
  httpAuthSchemes?: HttpAuthScheme[];
  httpAuthSchemeProvider?: BedrockHttpAuthSchemeProvider;
  token?: TokenIdentity | TokenIdentityProvider;
}
export interface HttpAuthSchemeResolvedConfig
  extends AwsSdkSigV4AuthResolvedConfig {
  readonly authSchemePreference: Provider<string[]>;
  readonly httpAuthSchemes: HttpAuthScheme[];
  readonly httpAuthSchemeProvider: BedrockHttpAuthSchemeProvider;
  readonly token?: TokenIdentityProvider;
}
export declare const resolveHttpAuthSchemeConfig: <T>(
  config: T & HttpAuthSchemeInputConfig & AwsSdkSigV4PreviouslyResolved
) => T & HttpAuthSchemeResolvedConfig;
