import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetModelInvocationLoggingConfigurationRequest,
  GetModelInvocationLoggingConfigurationResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface GetModelInvocationLoggingConfigurationCommandInput
  extends GetModelInvocationLoggingConfigurationRequest {}
export interface GetModelInvocationLoggingConfigurationCommandOutput
  extends GetModelInvocationLoggingConfigurationResponse,
    __MetadataBearer {}
declare const GetModelInvocationLoggingConfigurationCommand_base: {
  new (
    input: GetModelInvocationLoggingConfigurationCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelInvocationLoggingConfigurationCommandInput,
    GetModelInvocationLoggingConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [GetModelInvocationLoggingConfigurationCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelInvocationLoggingConfigurationCommandInput,
    GetModelInvocationLoggingConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetModelInvocationLoggingConfigurationCommand extends GetModelInvocationLoggingConfigurationCommand_base {
  protected static __types: {
    api: {
      input: {};
      output: GetModelInvocationLoggingConfigurationResponse;
    };
    sdk: {
      input: GetModelInvocationLoggingConfigurationCommandInput;
      output: GetModelInvocationLoggingConfigurationCommandOutput;
    };
  };
}
