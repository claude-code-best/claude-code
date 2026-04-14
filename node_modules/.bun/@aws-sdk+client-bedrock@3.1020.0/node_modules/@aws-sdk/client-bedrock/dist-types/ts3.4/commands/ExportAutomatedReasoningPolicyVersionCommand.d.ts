import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ExportAutomatedReasoningPolicyVersionRequest,
  ExportAutomatedReasoningPolicyVersionResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface ExportAutomatedReasoningPolicyVersionCommandInput
  extends ExportAutomatedReasoningPolicyVersionRequest {}
export interface ExportAutomatedReasoningPolicyVersionCommandOutput
  extends ExportAutomatedReasoningPolicyVersionResponse,
    __MetadataBearer {}
declare const ExportAutomatedReasoningPolicyVersionCommand_base: {
  new (
    input: ExportAutomatedReasoningPolicyVersionCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ExportAutomatedReasoningPolicyVersionCommandInput,
    ExportAutomatedReasoningPolicyVersionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: ExportAutomatedReasoningPolicyVersionCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ExportAutomatedReasoningPolicyVersionCommandInput,
    ExportAutomatedReasoningPolicyVersionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ExportAutomatedReasoningPolicyVersionCommand extends ExportAutomatedReasoningPolicyVersionCommand_base {
  protected static __types: {
    api: {
      input: ExportAutomatedReasoningPolicyVersionRequest;
      output: ExportAutomatedReasoningPolicyVersionResponse;
    };
    sdk: {
      input: ExportAutomatedReasoningPolicyVersionCommandInput;
      output: ExportAutomatedReasoningPolicyVersionCommandOutput;
    };
  };
}
