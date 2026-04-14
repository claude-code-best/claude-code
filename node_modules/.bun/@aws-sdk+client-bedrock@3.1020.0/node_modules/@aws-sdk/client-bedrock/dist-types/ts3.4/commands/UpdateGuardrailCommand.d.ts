import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  UpdateGuardrailRequest,
  UpdateGuardrailResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface UpdateGuardrailCommandInput extends UpdateGuardrailRequest {}
export interface UpdateGuardrailCommandOutput
  extends UpdateGuardrailResponse,
    __MetadataBearer {}
declare const UpdateGuardrailCommand_base: {
  new (
    input: UpdateGuardrailCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateGuardrailCommandInput,
    UpdateGuardrailCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: UpdateGuardrailCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateGuardrailCommandInput,
    UpdateGuardrailCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class UpdateGuardrailCommand extends UpdateGuardrailCommand_base {
  protected static __types: {
    api: {
      input: UpdateGuardrailRequest;
      output: UpdateGuardrailResponse;
    };
    sdk: {
      input: UpdateGuardrailCommandInput;
      output: UpdateGuardrailCommandOutput;
    };
  };
}
