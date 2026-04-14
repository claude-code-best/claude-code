import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CreateCustomModelDeploymentRequest,
  CreateCustomModelDeploymentResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface CreateCustomModelDeploymentCommandInput
  extends CreateCustomModelDeploymentRequest {}
export interface CreateCustomModelDeploymentCommandOutput
  extends CreateCustomModelDeploymentResponse,
    __MetadataBearer {}
declare const CreateCustomModelDeploymentCommand_base: {
  new (
    input: CreateCustomModelDeploymentCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateCustomModelDeploymentCommandInput,
    CreateCustomModelDeploymentCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreateCustomModelDeploymentCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateCustomModelDeploymentCommandInput,
    CreateCustomModelDeploymentCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreateCustomModelDeploymentCommand extends CreateCustomModelDeploymentCommand_base {
  protected static __types: {
    api: {
      input: CreateCustomModelDeploymentRequest;
      output: CreateCustomModelDeploymentResponse;
    };
    sdk: {
      input: CreateCustomModelDeploymentCommandInput;
      output: CreateCustomModelDeploymentCommandOutput;
    };
  };
}
