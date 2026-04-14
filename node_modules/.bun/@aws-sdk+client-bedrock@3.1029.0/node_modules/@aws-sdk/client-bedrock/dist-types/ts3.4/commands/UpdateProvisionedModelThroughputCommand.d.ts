import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  UpdateProvisionedModelThroughputRequest,
  UpdateProvisionedModelThroughputResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface UpdateProvisionedModelThroughputCommandInput
  extends UpdateProvisionedModelThroughputRequest {}
export interface UpdateProvisionedModelThroughputCommandOutput
  extends UpdateProvisionedModelThroughputResponse,
    __MetadataBearer {}
declare const UpdateProvisionedModelThroughputCommand_base: {
  new (
    input: UpdateProvisionedModelThroughputCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateProvisionedModelThroughputCommandInput,
    UpdateProvisionedModelThroughputCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: UpdateProvisionedModelThroughputCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateProvisionedModelThroughputCommandInput,
    UpdateProvisionedModelThroughputCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class UpdateProvisionedModelThroughputCommand extends UpdateProvisionedModelThroughputCommand_base {
  protected static __types: {
    api: {
      input: UpdateProvisionedModelThroughputRequest;
      output: {};
    };
    sdk: {
      input: UpdateProvisionedModelThroughputCommandInput;
      output: UpdateProvisionedModelThroughputCommandOutput;
    };
  };
}
