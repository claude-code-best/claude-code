import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetAutomatedReasoningPolicyAnnotationsRequest,
  GetAutomatedReasoningPolicyAnnotationsResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface GetAutomatedReasoningPolicyAnnotationsCommandInput
  extends GetAutomatedReasoningPolicyAnnotationsRequest {}
export interface GetAutomatedReasoningPolicyAnnotationsCommandOutput
  extends GetAutomatedReasoningPolicyAnnotationsResponse,
    __MetadataBearer {}
declare const GetAutomatedReasoningPolicyAnnotationsCommand_base: {
  new (
    input: GetAutomatedReasoningPolicyAnnotationsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAutomatedReasoningPolicyAnnotationsCommandInput,
    GetAutomatedReasoningPolicyAnnotationsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetAutomatedReasoningPolicyAnnotationsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetAutomatedReasoningPolicyAnnotationsCommandInput,
    GetAutomatedReasoningPolicyAnnotationsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetAutomatedReasoningPolicyAnnotationsCommand extends GetAutomatedReasoningPolicyAnnotationsCommand_base {
  protected static __types: {
    api: {
      input: GetAutomatedReasoningPolicyAnnotationsRequest;
      output: GetAutomatedReasoningPolicyAnnotationsResponse;
    };
    sdk: {
      input: GetAutomatedReasoningPolicyAnnotationsCommandInput;
      output: GetAutomatedReasoningPolicyAnnotationsCommandOutput;
    };
  };
}
