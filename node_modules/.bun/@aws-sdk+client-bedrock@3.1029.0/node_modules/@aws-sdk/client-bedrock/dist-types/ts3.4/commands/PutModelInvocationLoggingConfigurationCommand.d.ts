import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  PutModelInvocationLoggingConfigurationRequest,
  PutModelInvocationLoggingConfigurationResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface PutModelInvocationLoggingConfigurationCommandInput
  extends PutModelInvocationLoggingConfigurationRequest {}
export interface PutModelInvocationLoggingConfigurationCommandOutput
  extends PutModelInvocationLoggingConfigurationResponse,
    __MetadataBearer {}
declare const PutModelInvocationLoggingConfigurationCommand_base: {
  new (
    input: PutModelInvocationLoggingConfigurationCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    PutModelInvocationLoggingConfigurationCommandInput,
    PutModelInvocationLoggingConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: PutModelInvocationLoggingConfigurationCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    PutModelInvocationLoggingConfigurationCommandInput,
    PutModelInvocationLoggingConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class PutModelInvocationLoggingConfigurationCommand extends PutModelInvocationLoggingConfigurationCommand_base {
  protected static __types: {
    api: {
      input: PutModelInvocationLoggingConfigurationRequest;
      output: {};
    };
    sdk: {
      input: PutModelInvocationLoggingConfigurationCommandInput;
      output: PutModelInvocationLoggingConfigurationCommandOutput;
    };
  };
}
