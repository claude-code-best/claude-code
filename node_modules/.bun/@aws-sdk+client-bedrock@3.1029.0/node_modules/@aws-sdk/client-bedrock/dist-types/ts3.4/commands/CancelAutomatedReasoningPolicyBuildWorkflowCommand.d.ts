import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CancelAutomatedReasoningPolicyBuildWorkflowRequest,
  CancelAutomatedReasoningPolicyBuildWorkflowResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface CancelAutomatedReasoningPolicyBuildWorkflowCommandInput
  extends CancelAutomatedReasoningPolicyBuildWorkflowRequest {}
export interface CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput
  extends CancelAutomatedReasoningPolicyBuildWorkflowResponse,
    __MetadataBearer {}
declare const CancelAutomatedReasoningPolicyBuildWorkflowCommand_base: {
  new (
    input: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CancelAutomatedReasoningPolicyBuildWorkflowCommandInput,
    CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CancelAutomatedReasoningPolicyBuildWorkflowCommandInput,
    CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CancelAutomatedReasoningPolicyBuildWorkflowCommand extends CancelAutomatedReasoningPolicyBuildWorkflowCommand_base {
  protected static __types: {
    api: {
      input: CancelAutomatedReasoningPolicyBuildWorkflowRequest;
      output: {};
    };
    sdk: {
      input: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput;
      output: CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput;
    };
  };
}
