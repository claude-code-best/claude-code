import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import { CreateEvaluationJobResponse } from "../models/models_0";
import { CreateEvaluationJobRequest } from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface CreateEvaluationJobCommandInput
  extends CreateEvaluationJobRequest {}
export interface CreateEvaluationJobCommandOutput
  extends CreateEvaluationJobResponse,
    __MetadataBearer {}
declare const CreateEvaluationJobCommand_base: {
  new (
    input: CreateEvaluationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateEvaluationJobCommandInput,
    CreateEvaluationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreateEvaluationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateEvaluationJobCommandInput,
    CreateEvaluationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreateEvaluationJobCommand extends CreateEvaluationJobCommand_base {
  protected static __types: {
    api: {
      input: CreateEvaluationJobRequest;
      output: CreateEvaluationJobResponse;
    };
    sdk: {
      input: CreateEvaluationJobCommandInput;
      output: CreateEvaluationJobCommandOutput;
    };
  };
}
