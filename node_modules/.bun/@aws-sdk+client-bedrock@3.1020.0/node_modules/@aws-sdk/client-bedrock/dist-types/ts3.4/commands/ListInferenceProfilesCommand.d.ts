import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListInferenceProfilesRequest,
  ListInferenceProfilesResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface ListInferenceProfilesCommandInput
  extends ListInferenceProfilesRequest {}
export interface ListInferenceProfilesCommandOutput
  extends ListInferenceProfilesResponse,
    __MetadataBearer {}
declare const ListInferenceProfilesCommand_base: {
  new (
    input: ListInferenceProfilesCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListInferenceProfilesCommandInput,
    ListInferenceProfilesCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListInferenceProfilesCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListInferenceProfilesCommandInput,
    ListInferenceProfilesCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListInferenceProfilesCommand extends ListInferenceProfilesCommand_base {
  protected static __types: {
    api: {
      input: ListInferenceProfilesRequest;
      output: ListInferenceProfilesResponse;
    };
    sdk: {
      input: ListInferenceProfilesCommandInput;
      output: ListInferenceProfilesCommandOutput;
    };
  };
}
