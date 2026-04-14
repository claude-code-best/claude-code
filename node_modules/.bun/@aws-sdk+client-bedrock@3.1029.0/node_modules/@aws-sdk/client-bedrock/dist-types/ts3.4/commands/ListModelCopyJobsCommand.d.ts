import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListModelCopyJobsRequest,
  ListModelCopyJobsResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface ListModelCopyJobsCommandInput
  extends ListModelCopyJobsRequest {}
export interface ListModelCopyJobsCommandOutput
  extends ListModelCopyJobsResponse,
    __MetadataBearer {}
declare const ListModelCopyJobsCommand_base: {
  new (
    input: ListModelCopyJobsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListModelCopyJobsCommandInput,
    ListModelCopyJobsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListModelCopyJobsCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListModelCopyJobsCommandInput,
    ListModelCopyJobsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListModelCopyJobsCommand extends ListModelCopyJobsCommand_base {
  protected static __types: {
    api: {
      input: ListModelCopyJobsRequest;
      output: ListModelCopyJobsResponse;
    };
    sdk: {
      input: ListModelCopyJobsCommandInput;
      output: ListModelCopyJobsCommandOutput;
    };
  };
}
