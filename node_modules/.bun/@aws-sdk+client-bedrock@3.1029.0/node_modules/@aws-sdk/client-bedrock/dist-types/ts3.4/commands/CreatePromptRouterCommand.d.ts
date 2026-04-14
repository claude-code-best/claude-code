import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CreatePromptRouterRequest,
  CreatePromptRouterResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface CreatePromptRouterCommandInput
  extends CreatePromptRouterRequest {}
export interface CreatePromptRouterCommandOutput
  extends CreatePromptRouterResponse,
    __MetadataBearer {}
declare const CreatePromptRouterCommand_base: {
  new (
    input: CreatePromptRouterCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreatePromptRouterCommandInput,
    CreatePromptRouterCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreatePromptRouterCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreatePromptRouterCommandInput,
    CreatePromptRouterCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreatePromptRouterCommand extends CreatePromptRouterCommand_base {
  protected static __types: {
    api: {
      input: CreatePromptRouterRequest;
      output: CreatePromptRouterResponse;
    };
    sdk: {
      input: CreatePromptRouterCommandInput;
      output: CreatePromptRouterCommandOutput;
    };
  };
}
