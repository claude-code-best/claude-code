import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  StartAutomatedReasoningPolicyBuildWorkflowRequest,
  StartAutomatedReasoningPolicyBuildWorkflowResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface StartAutomatedReasoningPolicyBuildWorkflowCommandInput
  extends StartAutomatedReasoningPolicyBuildWorkflowRequest {}
export interface StartAutomatedReasoningPolicyBuildWorkflowCommandOutput
  extends StartAutomatedReasoningPolicyBuildWorkflowResponse,
    __MetadataBearer {}
declare const StartAutomatedReasoningPolicyBuildWorkflowCommand_base: {
  new (
    input: StartAutomatedReasoningPolicyBuildWorkflowCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    StartAutomatedReasoningPolicyBuildWorkflowCommandInput,
    StartAutomatedReasoningPolicyBuildWorkflowCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: StartAutomatedReasoningPolicyBuildWorkflowCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    StartAutomatedReasoningPolicyBuildWorkflowCommandInput,
    StartAutomatedReasoningPolicyBuildWorkflowCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class StartAutomatedReasoningPolicyBuildWorkflowCommand extends StartAutomatedReasoningPolicyBuildWorkflowCommand_base {
  protected static __types: {
    api: {
      input: StartAutomatedReasoningPolicyBuildWorkflowRequest;
      output: StartAutomatedReasoningPolicyBuildWorkflowResponse;
    };
    sdk: {
      input: StartAutomatedReasoningPolicyBuildWorkflowCommandInput;
      output: StartAutomatedReasoningPolicyBuildWorkflowCommandOutput;
    };
  };
}
