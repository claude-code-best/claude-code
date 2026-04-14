import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListAutomatedReasoningPolicyBuildWorkflowsRequest,
  ListAutomatedReasoningPolicyBuildWorkflowsResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface ListAutomatedReasoningPolicyBuildWorkflowsCommandInput
  extends ListAutomatedReasoningPolicyBuildWorkflowsRequest {}
export interface ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput
  extends ListAutomatedReasoningPolicyBuildWorkflowsResponse,
    __MetadataBearer {}
declare const ListAutomatedReasoningPolicyBuildWorkflowsCommand_base: {
  new (
    input: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListAutomatedReasoningPolicyBuildWorkflowsCommandInput,
    ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListAutomatedReasoningPolicyBuildWorkflowsCommandInput,
    ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListAutomatedReasoningPolicyBuildWorkflowsCommand extends ListAutomatedReasoningPolicyBuildWorkflowsCommand_base {
  protected static __types: {
    api: {
      input: ListAutomatedReasoningPolicyBuildWorkflowsRequest;
      output: ListAutomatedReasoningPolicyBuildWorkflowsResponse;
    };
    sdk: {
      input: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput;
      output: ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput;
    };
  };
}
