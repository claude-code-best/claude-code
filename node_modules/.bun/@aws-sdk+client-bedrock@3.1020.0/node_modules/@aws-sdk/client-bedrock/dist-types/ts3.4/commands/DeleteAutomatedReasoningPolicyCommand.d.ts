import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteAutomatedReasoningPolicyRequest,
  DeleteAutomatedReasoningPolicyResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface DeleteAutomatedReasoningPolicyCommandInput
  extends DeleteAutomatedReasoningPolicyRequest {}
export interface DeleteAutomatedReasoningPolicyCommandOutput
  extends DeleteAutomatedReasoningPolicyResponse,
    __MetadataBearer {}
declare const DeleteAutomatedReasoningPolicyCommand_base: {
  new (
    input: DeleteAutomatedReasoningPolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteAutomatedReasoningPolicyCommandInput,
    DeleteAutomatedReasoningPolicyCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteAutomatedReasoningPolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteAutomatedReasoningPolicyCommandInput,
    DeleteAutomatedReasoningPolicyCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteAutomatedReasoningPolicyCommand extends DeleteAutomatedReasoningPolicyCommand_base {
  protected static __types: {
    api: {
      input: DeleteAutomatedReasoningPolicyRequest;
      output: {};
    };
    sdk: {
      input: DeleteAutomatedReasoningPolicyCommandInput;
      output: DeleteAutomatedReasoningPolicyCommandOutput;
    };
  };
}
