import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CreateAutomatedReasoningPolicyRequest,
  CreateAutomatedReasoningPolicyResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface CreateAutomatedReasoningPolicyCommandInput
  extends CreateAutomatedReasoningPolicyRequest {}
export interface CreateAutomatedReasoningPolicyCommandOutput
  extends CreateAutomatedReasoningPolicyResponse,
    __MetadataBearer {}
declare const CreateAutomatedReasoningPolicyCommand_base: {
  new (
    input: CreateAutomatedReasoningPolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateAutomatedReasoningPolicyCommandInput,
    CreateAutomatedReasoningPolicyCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreateAutomatedReasoningPolicyCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateAutomatedReasoningPolicyCommandInput,
    CreateAutomatedReasoningPolicyCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreateAutomatedReasoningPolicyCommand extends CreateAutomatedReasoningPolicyCommand_base {
  protected static __types: {
    api: {
      input: CreateAutomatedReasoningPolicyRequest;
      output: CreateAutomatedReasoningPolicyResponse;
    };
    sdk: {
      input: CreateAutomatedReasoningPolicyCommandInput;
      output: CreateAutomatedReasoningPolicyCommandOutput;
    };
  };
}
