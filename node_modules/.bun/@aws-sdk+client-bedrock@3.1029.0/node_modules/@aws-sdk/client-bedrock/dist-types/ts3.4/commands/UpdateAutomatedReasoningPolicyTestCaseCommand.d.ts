import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  UpdateAutomatedReasoningPolicyTestCaseRequest,
  UpdateAutomatedReasoningPolicyTestCaseResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface UpdateAutomatedReasoningPolicyTestCaseCommandInput
  extends UpdateAutomatedReasoningPolicyTestCaseRequest {}
export interface UpdateAutomatedReasoningPolicyTestCaseCommandOutput
  extends UpdateAutomatedReasoningPolicyTestCaseResponse,
    __MetadataBearer {}
declare const UpdateAutomatedReasoningPolicyTestCaseCommand_base: {
  new (
    input: UpdateAutomatedReasoningPolicyTestCaseCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateAutomatedReasoningPolicyTestCaseCommandInput,
    UpdateAutomatedReasoningPolicyTestCaseCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: UpdateAutomatedReasoningPolicyTestCaseCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateAutomatedReasoningPolicyTestCaseCommandInput,
    UpdateAutomatedReasoningPolicyTestCaseCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class UpdateAutomatedReasoningPolicyTestCaseCommand extends UpdateAutomatedReasoningPolicyTestCaseCommand_base {
  protected static __types: {
    api: {
      input: UpdateAutomatedReasoningPolicyTestCaseRequest;
      output: UpdateAutomatedReasoningPolicyTestCaseResponse;
    };
    sdk: {
      input: UpdateAutomatedReasoningPolicyTestCaseCommandInput;
      output: UpdateAutomatedReasoningPolicyTestCaseCommandOutput;
    };
  };
}
