import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  GetDelegatedAccessTokenRequest,
  GetDelegatedAccessTokenResponse,
} from "../models/models_0";
import {
  ServiceInputTypes,
  ServiceOutputTypes,
  STSClientResolvedConfig,
} from "../STSClient";
export { __MetadataBearer };
export { $Command };
export interface GetDelegatedAccessTokenCommandInput
  extends GetDelegatedAccessTokenRequest {}
export interface GetDelegatedAccessTokenCommandOutput
  extends GetDelegatedAccessTokenResponse,
    __MetadataBearer {}
declare const GetDelegatedAccessTokenCommand_base: {
  new (
    input: GetDelegatedAccessTokenCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetDelegatedAccessTokenCommandInput,
    GetDelegatedAccessTokenCommandOutput,
    STSClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetDelegatedAccessTokenCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetDelegatedAccessTokenCommandInput,
    GetDelegatedAccessTokenCommandOutput,
    STSClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetDelegatedAccessTokenCommand extends GetDelegatedAccessTokenCommand_base {
  protected static __types: {
    api: {
      input: GetDelegatedAccessTokenRequest;
      output: GetDelegatedAccessTokenResponse;
    };
    sdk: {
      input: GetDelegatedAccessTokenCommandInput;
      output: GetDelegatedAccessTokenCommandOutput;
    };
  };
}
