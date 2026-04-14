import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListPromptRoutersRequest,
  ListPromptRoutersResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface ListPromptRoutersCommandInput
  extends ListPromptRoutersRequest {}
export interface ListPromptRoutersCommandOutput
  extends ListPromptRoutersResponse,
    __MetadataBearer {}
declare const ListPromptRoutersCommand_base: {
  new (
    input: ListPromptRoutersCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListPromptRoutersCommandInput,
    ListPromptRoutersCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListPromptRoutersCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListPromptRoutersCommandInput,
    ListPromptRoutersCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListPromptRoutersCommand extends ListPromptRoutersCommand_base {
  protected static __types: {
    api: {
      input: ListPromptRoutersRequest;
      output: ListPromptRoutersResponse;
    };
    sdk: {
      input: ListPromptRoutersCommandInput;
      output: ListPromptRoutersCommandOutput;
    };
  };
}
