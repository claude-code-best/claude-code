import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListCustomModelsRequest,
  ListCustomModelsResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface ListCustomModelsCommandInput extends ListCustomModelsRequest {}
export interface ListCustomModelsCommandOutput
  extends ListCustomModelsResponse,
    __MetadataBearer {}
declare const ListCustomModelsCommand_base: {
  new (
    input: ListCustomModelsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListCustomModelsCommandInput,
    ListCustomModelsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListCustomModelsCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListCustomModelsCommandInput,
    ListCustomModelsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListCustomModelsCommand extends ListCustomModelsCommand_base {
  protected static __types: {
    api: {
      input: ListCustomModelsRequest;
      output: ListCustomModelsResponse;
    };
    sdk: {
      input: ListCustomModelsCommandInput;
      output: ListCustomModelsCommandOutput;
    };
  };
}
