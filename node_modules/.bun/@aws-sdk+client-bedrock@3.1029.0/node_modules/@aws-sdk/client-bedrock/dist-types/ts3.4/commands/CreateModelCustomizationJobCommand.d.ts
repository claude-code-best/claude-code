import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CreateModelCustomizationJobRequest,
  CreateModelCustomizationJobResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface CreateModelCustomizationJobCommandInput
  extends CreateModelCustomizationJobRequest {}
export interface CreateModelCustomizationJobCommandOutput
  extends CreateModelCustomizationJobResponse,
    __MetadataBearer {}
declare const CreateModelCustomizationJobCommand_base: {
  new (
    input: CreateModelCustomizationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateModelCustomizationJobCommandInput,
    CreateModelCustomizationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreateModelCustomizationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateModelCustomizationJobCommandInput,
    CreateModelCustomizationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreateModelCustomizationJobCommand extends CreateModelCustomizationJobCommand_base {
  protected static __types: {
    api: {
      input: CreateModelCustomizationJobRequest;
      output: CreateModelCustomizationJobResponse;
    };
    sdk: {
      input: CreateModelCustomizationJobCommandInput;
      output: CreateModelCustomizationJobCommandOutput;
    };
  };
}
