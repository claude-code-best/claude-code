import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteAutomatedReasoningPolicyBuildWorkflowRequest,
  DeleteAutomatedReasoningPolicyBuildWorkflowResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput
  extends DeleteAutomatedReasoningPolicyBuildWorkflowRequest {}
export interface DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput
  extends DeleteAutomatedReasoningPolicyBuildWorkflowResponse,
    __MetadataBearer {}
declare const DeleteAutomatedReasoningPolicyBuildWorkflowCommand_base: {
  new (
    input: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput,
    DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput,
    DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteAutomatedReasoningPolicyBuildWorkflowCommand extends DeleteAutomatedReasoningPolicyBuildWorkflowCommand_base {
  protected static __types: {
    api: {
      input: DeleteAutomatedReasoningPolicyBuildWorkflowRequest;
      output: {};
    };
    sdk: {
      input: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput;
      output: DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput;
    };
  };
}
