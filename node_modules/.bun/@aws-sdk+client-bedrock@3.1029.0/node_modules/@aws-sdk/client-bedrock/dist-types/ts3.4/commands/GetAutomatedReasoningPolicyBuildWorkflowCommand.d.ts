import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetAutomatedReasoningPolicyBuildWorkflowRequest,
  GetAutomatedReasoningPolicyBuildWorkflowResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface GetAutomatedReasoningPolicyBuildWorkflowCommandInput
  extends GetAutomatedReasoningPolicyBuildWorkflowRequest {}
export interface GetAutomatedReasoningPolicyBuildWorkflowCommandOutput
  extends GetAutomatedReasoningPolicyBuildWorkflowResponse,
    __MetadataBearer {}
declare const GetAutomatedReasoningPolicyBuildWorkflowCommand_base: {
  new (
    input: GetAutomatedReasoningPolicyBuildWorkflowCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAutomatedReasoningPolicyBuildWorkflowCommandInput,
    GetAutomatedReasoningPolicyBuildWorkflowCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetAutomatedReasoningPolicyBuildWorkflowCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAutomatedReasoningPolicyBuildWorkflowCommandInput,
    GetAutomatedReasoningPolicyBuildWorkflowCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetAutomatedReasoningPolicyBuildWorkflowCommand extends GetAutomatedReasoningPolicyBuildWorkflowCommand_base {
  protected static __types: {
    api: {
      input: GetAutomatedReasoningPolicyBuildWorkflowRequest;
      output: GetAutomatedReasoningPolicyBuildWorkflowResponse;
    };
    sdk: {
      input: GetAutomatedReasoningPolicyBuildWorkflowCommandInput;
      output: GetAutomatedReasoningPolicyBuildWorkflowCommandOutput;
    };
  };
}
