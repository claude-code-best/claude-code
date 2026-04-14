import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CreateAutomatedReasoningPolicyTestCaseRequest,
  CreateAutomatedReasoningPolicyTestCaseResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface CreateAutomatedReasoningPolicyTestCaseCommandInput
  extends CreateAutomatedReasoningPolicyTestCaseRequest {}
export interface CreateAutomatedReasoningPolicyTestCaseCommandOutput
  extends CreateAutomatedReasoningPolicyTestCaseResponse,
    __MetadataBearer {}
declare const CreateAutomatedReasoningPolicyTestCaseCommand_base: {
  new (
    input: CreateAutomatedReasoningPolicyTestCaseCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateAutomatedReasoningPolicyTestCaseCommandInput,
    CreateAutomatedReasoningPolicyTestCaseCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreateAutomatedReasoningPolicyTestCaseCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateAutomatedReasoningPolicyTestCaseCommandInput,
    CreateAutomatedReasoningPolicyTestCaseCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreateAutomatedReasoningPolicyTestCaseCommand extends CreateAutomatedReasoningPolicyTestCaseCommand_base {
  protected static __types: {
    api: {
      input: CreateAutomatedReasoningPolicyTestCaseRequest;
      output: CreateAutomatedReasoningPolicyTestCaseResponse;
    };
    sdk: {
      input: CreateAutomatedReasoningPolicyTestCaseCommandInput;
      output: CreateAutomatedReasoningPolicyTestCaseCommandOutput;
    };
  };
}
