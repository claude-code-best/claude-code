import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import { GetGuardrailRequest } from "../models/models_0";
import { GetGuardrailResponse } from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface GetGuardrailCommandInput extends GetGuardrailRequest {}
export interface GetGuardrailCommandOutput
  extends GetGuardrailResponse,
    __MetadataBearer {}
declare const GetGuardrailCommand_base: {
  new (
    input: GetGuardrailCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetGuardrailCommandInput,
    GetGuardrailCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetGuardrailCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetGuardrailCommandInput,
    GetGuardrailCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetGuardrailCommand extends GetGuardrailCommand_base {
  protected static __types: {
    api: {
      input: GetGuardrailRequest;
      output: GetGuardrailResponse;
    };
    sdk: {
      input: GetGuardrailCommandInput;
      output: GetGuardrailCommandOutput;
    };
  };
}
