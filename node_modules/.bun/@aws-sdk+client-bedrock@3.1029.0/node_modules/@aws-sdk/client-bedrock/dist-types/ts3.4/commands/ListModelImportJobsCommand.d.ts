import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListModelImportJobsRequest,
  ListModelImportJobsResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface ListModelImportJobsCommandInput
  extends ListModelImportJobsRequest {}
export interface ListModelImportJobsCommandOutput
  extends ListModelImportJobsResponse,
    __MetadataBearer {}
declare const ListModelImportJobsCommand_base: {
  new (
    input: ListModelImportJobsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListModelImportJobsCommandInput,
    ListModelImportJobsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListModelImportJobsCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListModelImportJobsCommandInput,
    ListModelImportJobsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListModelImportJobsCommand extends ListModelImportJobsCommand_base {
  protected static __types: {
    api: {
      input: ListModelImportJobsRequest;
      output: ListModelImportJobsResponse;
    };
    sdk: {
      input: ListModelImportJobsCommandInput;
      output: ListModelImportJobsCommandOutput;
    };
  };
}
