import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  PutEnforcedGuardrailConfigurationRequest,
  PutEnforcedGuardrailConfigurationResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface PutEnforcedGuardrailConfigurationCommandInput
  extends PutEnforcedGuardrailConfigurationRequest {}
export interface PutEnforcedGuardrailConfigurationCommandOutput
  extends PutEnforcedGuardrailConfigurationResponse,
    __MetadataBearer {}
declare const PutEnforcedGuardrailConfigurationCommand_base: {
  new (
    input: PutEnforcedGuardrailConfigurationCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    PutEnforcedGuardrailConfigurationCommandInput,
    PutEnforcedGuardrailConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: PutEnforcedGuardrailConfigurationCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    PutEnforcedGuardrailConfigurationCommandInput,
    PutEnforcedGuardrailConfigurationCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class PutEnforcedGuardrailConfigurationCommand extends PutEnforcedGuardrailConfigurationCommand_base {
  protected static __types: {
    api: {
      input: PutEnforcedGuardrailConfigurationRequest;
      output: PutEnforcedGuardrailConfigurationResponse;
    };
    sdk: {
      input: PutEnforcedGuardrailConfigurationCommandInput;
      output: PutEnforcedGuardrailConfigurationCommandOutput;
    };
  };
}
