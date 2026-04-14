import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetModelCopyJobRequest,
  GetModelCopyJobResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface GetModelCopyJobCommandInput extends GetModelCopyJobRequest {}
export interface GetModelCopyJobCommandOutput
  extends GetModelCopyJobResponse,
    __MetadataBearer {}
declare const GetModelCopyJobCommand_base: {
  new (
    input: GetModelCopyJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelCopyJobCommandInput,
    GetModelCopyJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetModelCopyJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelCopyJobCommandInput,
    GetModelCopyJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetModelCopyJobCommand extends GetModelCopyJobCommand_base {
  protected static __types: {
    api: {
      input: GetModelCopyJobRequest;
      output: GetModelCopyJobResponse;
    };
    sdk: {
      input: GetModelCopyJobCommandInput;
      output: GetModelCopyJobCommandOutput;
    };
  };
}
