import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  StopEvaluationJobRequest,
  StopEvaluationJobResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface StopEvaluationJobCommandInput
  extends StopEvaluationJobRequest {}
export interface StopEvaluationJobCommandOutput
  extends StopEvaluationJobResponse,
    __MetadataBearer {}
declare const StopEvaluationJobCommand_base: {
  new (
    input: StopEvaluationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    StopEvaluationJobCommandInput,
    StopEvaluationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: StopEvaluationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    StopEvaluationJobCommandInput,
    StopEvaluationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class StopEvaluationJobCommand extends StopEvaluationJobCommand_base {
  protected static __types: {
    api: {
      input: StopEvaluationJobRequest;
      output: {};
    };
    sdk: {
      input: StopEvaluationJobCommandInput;
      output: StopEvaluationJobCommandOutput;
    };
  };
}
