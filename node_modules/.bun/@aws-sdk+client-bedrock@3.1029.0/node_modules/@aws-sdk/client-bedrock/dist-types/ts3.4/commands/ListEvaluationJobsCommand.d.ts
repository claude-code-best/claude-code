import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListEvaluationJobsRequest,
  ListEvaluationJobsResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface ListEvaluationJobsCommandInput
  extends ListEvaluationJobsRequest {}
export interface ListEvaluationJobsCommandOutput
  extends ListEvaluationJobsResponse,
    __MetadataBearer {}
declare const ListEvaluationJobsCommand_base: {
  new (
    input: ListEvaluationJobsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListEvaluationJobsCommandInput,
    ListEvaluationJobsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListEvaluationJobsCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListEvaluationJobsCommandInput,
    ListEvaluationJobsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListEvaluationJobsCommand extends ListEvaluationJobsCommand_base {
  protected static __types: {
    api: {
      input: ListEvaluationJobsRequest;
      output: ListEvaluationJobsResponse;
    };
    sdk: {
      input: ListEvaluationJobsCommandInput;
      output: ListEvaluationJobsCommandOutput;
    };
  };
}
