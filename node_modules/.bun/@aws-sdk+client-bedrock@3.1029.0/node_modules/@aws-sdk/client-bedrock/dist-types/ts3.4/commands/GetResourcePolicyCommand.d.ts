import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetResourcePolicyRequest,
  GetResourcePolicyResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface GetResourcePolicyCommandInput
  extends GetResourcePolicyRequest {}
export interface GetResourcePolicyCommandOutput
  extends GetResourcePolicyResponse,
    __MetadataBearer {}
declare const GetResourcePolicyCommand_base: {
  new (
    input: GetResourcePolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetResourcePolicyCommandInput,
    GetResourcePolicyCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetResourcePolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetResourcePolicyCommandInput,
    GetResourcePolicyCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetResourcePolicyCommand extends GetResourcePolicyCommand_base {
  protected static __types: {
    api: {
      input: GetResourcePolicyRequest;
      output: GetResourcePolicyResponse;
    };
    sdk: {
      input: GetResourcePolicyCommandInput;
      output: GetResourcePolicyCommandOutput;
    };
  };
}
