import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteResourcePolicyRequest,
  DeleteResourcePolicyResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface DeleteResourcePolicyCommandInput
  extends DeleteResourcePolicyRequest {}
export interface DeleteResourcePolicyCommandOutput
  extends DeleteResourcePolicyResponse,
    __MetadataBearer {}
declare const DeleteResourcePolicyCommand_base: {
  new (
    input: DeleteResourcePolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteResourcePolicyCommandInput,
    DeleteResourcePolicyCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteResourcePolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteResourcePolicyCommandInput,
    DeleteResourcePolicyCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteResourcePolicyCommand extends DeleteResourcePolicyCommand_base {
  protected static __types: {
    api: {
      input: DeleteResourcePolicyRequest;
      output: {};
    };
    sdk: {
      input: DeleteResourcePolicyCommandInput;
      output: DeleteResourcePolicyCommandOutput;
    };
  };
}
