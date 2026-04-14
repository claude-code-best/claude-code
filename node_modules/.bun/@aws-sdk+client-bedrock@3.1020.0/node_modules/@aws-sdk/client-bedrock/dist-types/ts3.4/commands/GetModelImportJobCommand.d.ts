import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetModelImportJobRequest,
  GetModelImportJobResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface GetModelImportJobCommandInput
  extends GetModelImportJobRequest {}
export interface GetModelImportJobCommandOutput
  extends GetModelImportJobResponse,
    __MetadataBearer {}
declare const GetModelImportJobCommand_base: {
  new (
    input: GetModelImportJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelImportJobCommandInput,
    GetModelImportJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetModelImportJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelImportJobCommandInput,
    GetModelImportJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetModelImportJobCommand extends GetModelImportJobCommand_base {
  protected static __types: {
    api: {
      input: GetModelImportJobRequest;
      output: GetModelImportJobResponse;
    };
    sdk: {
      input: GetModelImportJobCommandInput;
      output: GetModelImportJobCommandOutput;
    };
  };
}
