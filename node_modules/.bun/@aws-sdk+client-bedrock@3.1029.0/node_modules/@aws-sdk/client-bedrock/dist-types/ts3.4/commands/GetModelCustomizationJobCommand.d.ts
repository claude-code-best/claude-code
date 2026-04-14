import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetModelCustomizationJobRequest,
  GetModelCustomizationJobResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface GetModelCustomizationJobCommandInput
  extends GetModelCustomizationJobRequest {}
export interface GetModelCustomizationJobCommandOutput
  extends GetModelCustomizationJobResponse,
    __MetadataBearer {}
declare const GetModelCustomizationJobCommand_base: {
  new (
    input: GetModelCustomizationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelCustomizationJobCommandInput,
    GetModelCustomizationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetModelCustomizationJobCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetModelCustomizationJobCommandInput,
    GetModelCustomizationJobCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetModelCustomizationJobCommand extends GetModelCustomizationJobCommand_base {
  protected static __types: {
    api: {
      input: GetModelCustomizationJobRequest;
      output: GetModelCustomizationJobResponse;
    };
    sdk: {
      input: GetModelCustomizationJobCommandInput;
      output: GetModelCustomizationJobCommandOutput;
    };
  };
}
