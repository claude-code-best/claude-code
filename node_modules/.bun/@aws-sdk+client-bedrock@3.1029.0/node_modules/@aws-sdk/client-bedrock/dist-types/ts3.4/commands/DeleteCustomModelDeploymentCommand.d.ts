import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteCustomModelDeploymentRequest,
  DeleteCustomModelDeploymentResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface DeleteCustomModelDeploymentCommandInput
  extends DeleteCustomModelDeploymentRequest {}
export interface DeleteCustomModelDeploymentCommandOutput
  extends DeleteCustomModelDeploymentResponse,
    __MetadataBearer {}
declare const DeleteCustomModelDeploymentCommand_base: {
  new (
    input: DeleteCustomModelDeploymentCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteCustomModelDeploymentCommandInput,
    DeleteCustomModelDeploymentCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteCustomModelDeploymentCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteCustomModelDeploymentCommandInput,
    DeleteCustomModelDeploymentCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteCustomModelDeploymentCommand extends DeleteCustomModelDeploymentCommand_base {
  protected static __types: {
    api: {
      input: DeleteCustomModelDeploymentRequest;
      output: {};
    };
    sdk: {
      input: DeleteCustomModelDeploymentCommandInput;
      output: DeleteCustomModelDeploymentCommandOutput;
    };
  };
}
