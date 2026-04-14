import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  UpdateCustomModelDeploymentRequest,
  UpdateCustomModelDeploymentResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface UpdateCustomModelDeploymentCommandInput
  extends UpdateCustomModelDeploymentRequest {}
export interface UpdateCustomModelDeploymentCommandOutput
  extends UpdateCustomModelDeploymentResponse,
    __MetadataBearer {}
declare const UpdateCustomModelDeploymentCommand_base: {
  new (
    input: UpdateCustomModelDeploymentCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateCustomModelDeploymentCommandInput,
    UpdateCustomModelDeploymentCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: UpdateCustomModelDeploymentCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateCustomModelDeploymentCommandInput,
    UpdateCustomModelDeploymentCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class UpdateCustomModelDeploymentCommand extends UpdateCustomModelDeploymentCommand_base {
  protected static __types: {
    api: {
      input: UpdateCustomModelDeploymentRequest;
      output: UpdateCustomModelDeploymentResponse;
    };
    sdk: {
      input: UpdateCustomModelDeploymentCommandInput;
      output: UpdateCustomModelDeploymentCommandOutput;
    };
  };
}
