import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteGuardrailRequest,
  DeleteGuardrailResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface DeleteGuardrailCommandInput extends DeleteGuardrailRequest {}
export interface DeleteGuardrailCommandOutput
  extends DeleteGuardrailResponse,
    __MetadataBearer {}
declare const DeleteGuardrailCommand_base: {
  new (
    input: DeleteGuardrailCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteGuardrailCommandInput,
    DeleteGuardrailCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteGuardrailCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteGuardrailCommandInput,
    DeleteGuardrailCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteGuardrailCommand extends DeleteGuardrailCommand_base {
  protected static __types: {
    api: {
      input: DeleteGuardrailRequest;
      output: {};
    };
    sdk: {
      input: DeleteGuardrailCommandInput;
      output: DeleteGuardrailCommandOutput;
    };
  };
}
