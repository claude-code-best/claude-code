import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListEnforcedGuardrailsConfigurationRequest,
  ListEnforcedGuardrailsConfigurationResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface ListEnforcedGuardrailsConfigurationCommandInput
  extends ListEnforcedGuardrailsConfigurationRequest {}
export interface ListEnforcedGuardrailsConfigurationCommandOutput
  extends ListEnforcedGuardrailsConfigurationResponse,
    __MetadataBearer {}
declare const ListEnforcedGuardrailsConfigurationCommand_base: {
  new (
    input: ListEnforcedGuardrailsConfigurationCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListEnforcedGuardrailsConfigurationCommandInput,
    ListEnforcedGuardrailsConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListEnforcedGuardrailsConfigurationCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListEnforcedGuardrailsConfigurationCommandInput,
    ListEnforcedGuardrailsConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListEnforcedGuardrailsConfigurationCommand extends ListEnforcedGuardrailsConfigurationCommand_base {
  protected static __types: {
    api: {
      input: ListEnforcedGuardrailsConfigurationRequest;
      output: ListEnforcedGuardrailsConfigurationResponse;
    };
    sdk: {
      input: ListEnforcedGuardrailsConfigurationCommandInput;
      output: ListEnforcedGuardrailsConfigurationCommandOutput;
    };
  };
}
