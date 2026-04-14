import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetAutomatedReasoningPolicyTestCaseRequest,
  GetAutomatedReasoningPolicyTestCaseResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface GetAutomatedReasoningPolicyTestCaseCommandInput
  extends GetAutomatedReasoningPolicyTestCaseRequest {}
export interface GetAutomatedReasoningPolicyTestCaseCommandOutput
  extends GetAutomatedReasoningPolicyTestCaseResponse,
    __MetadataBearer {}
declare const GetAutomatedReasoningPolicyTestCaseCommand_base: {
  new (
    input: GetAutomatedReasoningPolicyTestCaseCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAutomatedReasoningPolicyTestCaseCommandInput,
    GetAutomatedReasoningPolicyTestCaseCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetAutomatedReasoningPolicyTestCaseCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAutomatedReasoningPolicyTestCaseCommandInput,
    GetAutomatedReasoningPolicyTestCaseCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetAutomatedReasoningPolicyTestCaseCommand extends GetAutomatedReasoningPolicyTestCaseCommand_base {
  protected static __types: {
    api: {
      input: GetAutomatedReasoningPolicyTestCaseRequest;
      output: GetAutomatedReasoningPolicyTestCaseResponse;
    };
    sdk: {
      input: GetAutomatedReasoningPolicyTestCaseCommandInput;
      output: GetAutomatedReasoningPolicyTestCaseCommandOutput;
    };
  };
}
