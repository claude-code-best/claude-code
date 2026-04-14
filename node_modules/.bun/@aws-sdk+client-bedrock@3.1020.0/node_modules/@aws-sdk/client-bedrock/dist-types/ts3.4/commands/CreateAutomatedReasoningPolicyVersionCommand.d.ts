import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CreateAutomatedReasoningPolicyVersionRequest,
  CreateAutomatedReasoningPolicyVersionResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface CreateAutomatedReasoningPolicyVersionCommandInput
  extends CreateAutomatedReasoningPolicyVersionRequest {}
export interface CreateAutomatedReasoningPolicyVersionCommandOutput
  extends CreateAutomatedReasoningPolicyVersionResponse,
    __MetadataBearer {}
declare const CreateAutomatedReasoningPolicyVersionCommand_base: {
  new (
    input: CreateAutomatedReasoningPolicyVersionCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateAutomatedReasoningPolicyVersionCommandInput,
    CreateAutomatedReasoningPolicyVersionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreateAutomatedReasoningPolicyVersionCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateAutomatedReasoningPolicyVersionCommandInput,
    CreateAutomatedReasoningPolicyVersionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreateAutomatedReasoningPolicyVersionCommand extends CreateAutomatedReasoningPolicyVersionCommand_base {
  protected static __types: {
    api: {
      input: CreateAutomatedReasoningPolicyVersionRequest;
      output: CreateAutomatedReasoningPolicyVersionResponse;
    };
    sdk: {
      input: CreateAutomatedReasoningPolicyVersionCommandInput;
      output: CreateAutomatedReasoningPolicyVersionCommandOutput;
    };
  };
}
