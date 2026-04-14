import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteModelInvocationLoggingConfigurationRequest,
  DeleteModelInvocationLoggingConfigurationResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface DeleteModelInvocationLoggingConfigurationCommandInput
  extends DeleteModelInvocationLoggingConfigurationRequest {}
export interface DeleteModelInvocationLoggingConfigurationCommandOutput
  extends DeleteModelInvocationLoggingConfigurationResponse,
    __MetadataBearer {}
declare const DeleteModelInvocationLoggingConfigurationCommand_base: {
  new (
    input: DeleteModelInvocationLoggingConfigurationCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteModelInvocationLoggingConfigurationCommandInput,
    DeleteModelInvocationLoggingConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [DeleteModelInvocationLoggingConfigurationCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteModelInvocationLoggingConfigurationCommandInput,
    DeleteModelInvocationLoggingConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteModelInvocationLoggingConfigurationCommand extends DeleteModelInvocationLoggingConfigurationCommand_base {
  protected static __types: {
    api: {
      input: {};
      output: {};
    };
    sdk: {
      input: DeleteModelInvocationLoggingConfigurationCommandInput;
      output: DeleteModelInvocationLoggingConfigurationCommandOutput;
    };
  };
}
