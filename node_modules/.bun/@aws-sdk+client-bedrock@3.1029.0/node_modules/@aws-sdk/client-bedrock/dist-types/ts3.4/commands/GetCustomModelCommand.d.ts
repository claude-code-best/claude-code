import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetCustomModelRequest,
  GetCustomModelResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface GetCustomModelCommandInput extends GetCustomModelRequest {}
export interface GetCustomModelCommandOutput
  extends GetCustomModelResponse,
    __MetadataBearer {}
declare const GetCustomModelCommand_base: {
  new (
    input: GetCustomModelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetCustomModelCommandInput,
    GetCustomModelCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetCustomModelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetCustomModelCommandInput,
    GetCustomModelCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetCustomModelCommand extends GetCustomModelCommand_base {
  protected static __types: {
    api: {
      input: GetCustomModelRequest;
      output: GetCustomModelResponse;
    };
    sdk: {
      input: GetCustomModelCommandInput;
      output: GetCustomModelCommandOutput;
    };
  };
}
