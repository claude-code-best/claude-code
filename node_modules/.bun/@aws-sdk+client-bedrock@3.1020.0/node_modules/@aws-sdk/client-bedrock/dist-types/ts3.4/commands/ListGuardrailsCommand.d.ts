import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListGuardrailsRequest,
  ListGuardrailsResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface ListGuardrailsCommandInput extends ListGuardrailsRequest {}
export interface ListGuardrailsCommandOutput
  extends ListGuardrailsResponse,
    __MetadataBearer {}
declare const ListGuardrailsCommand_base: {
  new (
    input: ListGuardrailsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListGuardrailsCommandInput,
    ListGuardrailsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListGuardrailsCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListGuardrailsCommandInput,
    ListGuardrailsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListGuardrailsCommand extends ListGuardrailsCommand_base {
  protected static __types: {
    api: {
      input: ListGuardrailsRequest;
      output: ListGuardrailsResponse;
    };
    sdk: {
      input: ListGuardrailsCommandInput;
      output: ListGuardrailsCommandOutput;
    };
  };
}
