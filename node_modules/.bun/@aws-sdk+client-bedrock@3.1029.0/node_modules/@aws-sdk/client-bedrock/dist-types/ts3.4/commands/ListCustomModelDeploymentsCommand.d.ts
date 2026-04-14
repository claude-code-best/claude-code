import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListCustomModelDeploymentsRequest,
  ListCustomModelDeploymentsResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface ListCustomModelDeploymentsCommandInput
  extends ListCustomModelDeploymentsRequest {}
export interface ListCustomModelDeploymentsCommandOutput
  extends ListCustomModelDeploymentsResponse,
    __MetadataBearer {}
declare const ListCustomModelDeploymentsCommand_base: {
  new (
    input: ListCustomModelDeploymentsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListCustomModelDeploymentsCommandInput,
    ListCustomModelDeploymentsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListCustomModelDeploymentsCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListCustomModelDeploymentsCommandInput,
    ListCustomModelDeploymentsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListCustomModelDeploymentsCommand extends ListCustomModelDeploymentsCommand_base {
  protected static __types: {
    api: {
      input: ListCustomModelDeploymentsRequest;
      output: ListCustomModelDeploymentsResponse;
    };
    sdk: {
      input: ListCustomModelDeploymentsCommandInput;
      output: ListCustomModelDeploymentsCommandOutput;
    };
  };
}
