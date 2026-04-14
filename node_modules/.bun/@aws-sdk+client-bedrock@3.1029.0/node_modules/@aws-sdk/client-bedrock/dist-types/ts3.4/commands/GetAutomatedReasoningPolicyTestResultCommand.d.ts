import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetAutomatedReasoningPolicyTestResultRequest,
  GetAutomatedReasoningPolicyTestResultResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface GetAutomatedReasoningPolicyTestResultCommandInput
  extends GetAutomatedReasoningPolicyTestResultRequest {}
export interface GetAutomatedReasoningPolicyTestResultCommandOutput
  extends GetAutomatedReasoningPolicyTestResultResponse,
    __MetadataBearer {}
declare const GetAutomatedReasoningPolicyTestResultCommand_base: {
  new (
    input: GetAutomatedReasoningPolicyTestResultCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAutomatedReasoningPolicyTestResultCommandInput,
    GetAutomatedReasoningPolicyTestResultCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetAutomatedReasoningPolicyTestResultCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAutomatedReasoningPolicyTestResultCommandInput,
    GetAutomatedReasoningPolicyTestResultCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetAutomatedReasoningPolicyTestResultCommand extends GetAutomatedReasoningPolicyTestResultCommand_base {
  protected static __types: {
    api: {
      input: GetAutomatedReasoningPolicyTestResultRequest;
      output: GetAutomatedReasoningPolicyTestResultResponse;
    };
    sdk: {
      input: GetAutomatedReasoningPolicyTestResultCommandInput;
      output: GetAutomatedReasoningPolicyTestResultCommandOutput;
    };
  };
}
