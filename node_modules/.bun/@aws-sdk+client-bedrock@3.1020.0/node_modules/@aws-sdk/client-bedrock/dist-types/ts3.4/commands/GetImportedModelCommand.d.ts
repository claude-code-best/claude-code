import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetImportedModelRequest,
  GetImportedModelResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface GetImportedModelCommandInput extends GetImportedModelRequest {}
export interface GetImportedModelCommandOutput
  extends GetImportedModelResponse,
    __MetadataBearer {}
declare const GetImportedModelCommand_base: {
  new (
    input: GetImportedModelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetImportedModelCommandInput,
    GetImportedModelCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetImportedModelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetImportedModelCommandInput,
    GetImportedModelCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetImportedModelCommand extends GetImportedModelCommand_base {
  protected static __types: {
    api: {
      input: GetImportedModelRequest;
      output: GetImportedModelResponse;
    };
    sdk: {
      input: GetImportedModelCommandInput;
      output: GetImportedModelCommandOutput;
    };
  };
}
