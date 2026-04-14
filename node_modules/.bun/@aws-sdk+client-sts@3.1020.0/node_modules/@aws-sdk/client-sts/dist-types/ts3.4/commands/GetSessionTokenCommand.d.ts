import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  GetSessionTokenRequest,
  GetSessionTokenResponse,
} from "../models/models_0";
import {
  ServiceInputTypes,
  ServiceOutputTypes,
  STSClientResolvedConfig,
} from "../STSClient";
export { __MetadataBearer };
export { $Command };
export interface GetSessionTokenCommandInput extends GetSessionTokenRequest {}
export interface GetSessionTokenCommandOutput
  extends GetSessionTokenResponse,
    __MetadataBearer {}
declare const GetSessionTokenCommand_base: {
  new (
    input: GetSessionTokenCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetSessionTokenCommandInput,
    GetSessionTokenCommandOutput,
    STSClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [GetSessionTokenCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    GetSessionTokenCommandInput,
    GetSessionTokenCommandOutput,
    STSClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetSessionTokenCommand extends GetSessionTokenCommand_base {
  protected static __types: {
    api: {
      input: GetSessionTokenRequest;
      output: GetSessionTokenResponse;
    };
    sdk: {
      input: GetSessionTokenCommandInput;
      output: GetSessionTokenCommandOutput;
    };
  };
}
