import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CreateGuardrailVersionRequest,
  CreateGuardrailVersionResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface CreateGuardrailVersionCommandInput
  extends CreateGuardrailVersionRequest {}
export interface CreateGuardrailVersionCommandOutput
  extends CreateGuardrailVersionResponse,
    __MetadataBearer {}
declare const CreateGuardrailVersionCommand_base: {
  new (
    input: CreateGuardrailVersionCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateGuardrailVersionCommandInput,
    CreateGuardrailVersionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreateGuardrailVersionCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateGuardrailVersionCommandInput,
    CreateGuardrailVersionCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreateGuardrailVersionCommand extends CreateGuardrailVersionCommand_base {
  protected static __types: {
    api: {
      input: CreateGuardrailVersionRequest;
      output: CreateGuardrailVersionResponse;
    };
    sdk: {
      input: CreateGuardrailVersionCommandInput;
      output: CreateGuardrailVersionCommandOutput;
    };
  };
}
