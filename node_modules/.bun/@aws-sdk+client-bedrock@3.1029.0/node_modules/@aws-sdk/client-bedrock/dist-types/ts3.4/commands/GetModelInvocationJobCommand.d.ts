import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetModelInvocationJobRequest,
  GetModelInvocationJobResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface GetModelInvocationJobCommandInput
  extends GetModelInvocationJobRequest {}
export interface GetModelInvocationJobCommandOutput
  extends GetModelInvocationJobResponse,
    __MetadataBearer {}
declare const GetModelInvocationJobCommand_base: {
  new (
    input: GetModelInvocationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelInvocationJobCommandInput,
    GetModelInvocationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetModelInvocationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelInvocationJobCommandInput,
    GetModelInvocationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetModelInvocationJobCommand extends GetModelInvocationJobCommand_base {
  protected static __types: {
    api: {
      input: GetModelInvocationJobRequest;
      output: GetModelInvocationJobResponse;
    };
    sdk: {
      input: GetModelInvocationJobCommandInput;
      output: GetModelInvocationJobCommandOutput;
    };
  };
}
