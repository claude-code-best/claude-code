import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import { GetEvaluationJobRequest } from "../models/models_0";
import { GetEvaluationJobResponse } from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface GetEvaluationJobCommandInput extends GetEvaluationJobRequest {}
export interface GetEvaluationJobCommandOutput
  extends GetEvaluationJobResponse,
    __MetadataBearer {}
declare const GetEvaluationJobCommand_base: {
  new (
    input: GetEvaluationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetEvaluationJobCommandInput,
    GetEvaluationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetEvaluationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetEvaluationJobCommandInput,
    GetEvaluationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetEvaluationJobCommand extends GetEvaluationJobCommand_base {
  protected static __types: {
    api: {
      input: GetEvaluationJobRequest;
      output: GetEvaluationJobResponse;
    };
    sdk: {
      input: GetEvaluationJobCommandInput;
      output: GetEvaluationJobCommandOutput;
    };
  };
}
