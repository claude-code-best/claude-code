import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListProvisionedModelThroughputsRequest,
  ListProvisionedModelThroughputsResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface ListProvisionedModelThroughputsCommandInput
  extends ListProvisionedModelThroughputsRequest {}
export interface ListProvisionedModelThroughputsCommandOutput
  extends ListProvisionedModelThroughputsResponse,
    __MetadataBearer {}
declare const ListProvisionedModelThroughputsCommand_base: {
  new (
    input: ListProvisionedModelThroughputsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListProvisionedModelThroughputsCommandInput,
    ListProvisionedModelThroughputsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListProvisionedModelThroughputsCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListProvisionedModelThroughputsCommandInput,
    ListProvisionedModelThroughputsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListProvisionedModelThroughputsCommand extends ListProvisionedModelThroughputsCommand_base {
  protected static __types: {
    api: {
      input: ListProvisionedModelThroughputsRequest;
      output: ListProvisionedModelThroughputsResponse;
    };
    sdk: {
      input: ListProvisionedModelThroughputsCommandInput;
      output: ListProvisionedModelThroughputsCommandOutput;
    };
  };
}
