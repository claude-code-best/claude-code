import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CreateGuardrailRequest,
  CreateGuardrailResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface CreateGuardrailCommandInput extends CreateGuardrailRequest {}
export interface CreateGuardrailCommandOutput
  extends CreateGuardrailResponse,
    __MetadataBearer {}
declare const CreateGuardrailCommand_base: {
  new (
    input: CreateGuardrailCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateGuardrailCommandInput,
    CreateGuardrailCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreateGuardrailCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateGuardrailCommandInput,
    CreateGuardrailCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreateGuardrailCommand extends CreateGuardrailCommand_base {
  protected static __types: {
    api: {
      input: CreateGuardrailRequest;
      output: CreateGuardrailResponse;
    };
    sdk: {
      input: CreateGuardrailCommandInput;
      output: CreateGuardrailCommandOutput;
    };
  };
}
