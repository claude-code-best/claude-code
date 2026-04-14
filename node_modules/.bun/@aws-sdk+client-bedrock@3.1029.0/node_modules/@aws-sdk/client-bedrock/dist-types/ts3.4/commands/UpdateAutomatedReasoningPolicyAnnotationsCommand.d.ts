import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  UpdateAutomatedReasoningPolicyAnnotationsRequest,
  UpdateAutomatedReasoningPolicyAnnotationsResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface UpdateAutomatedReasoningPolicyAnnotationsCommandInput
  extends UpdateAutomatedReasoningPolicyAnnotationsRequest {}
export interface UpdateAutomatedReasoningPolicyAnnotationsCommandOutput
  extends UpdateAutomatedReasoningPolicyAnnotationsResponse,
    __MetadataBearer {}
declare const UpdateAutomatedReasoningPolicyAnnotationsCommand_base: {
  new (
    input: UpdateAutomatedReasoningPolicyAnnotationsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateAutomatedReasoningPolicyAnnotationsCommandInput,
    UpdateAutomatedReasoningPolicyAnnotationsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: UpdateAutomatedReasoningPolicyAnnotationsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateAutomatedReasoningPolicyAnnotationsCommandInput,
    UpdateAutomatedReasoningPolicyAnnotationsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class UpdateAutomatedReasoningPolicyAnnotationsCommand extends UpdateAutomatedReasoningPolicyAnnotationsCommand_base {
  protected static __types: {
    api: {
      input: UpdateAutomatedReasoningPolicyAnnotationsRequest;
      output: UpdateAutomatedReasoningPolicyAnnotationsResponse;
    };
    sdk: {
      input: UpdateAutomatedReasoningPolicyAnnotationsCommandInput;
      output: UpdateAutomatedReasoningPolicyAnnotationsCommandOutput;
    };
  };
}
