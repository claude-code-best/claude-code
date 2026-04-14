import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetCustomModelDeploymentRequest,
  GetCustomModelDeploymentResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface GetCustomModelDeploymentCommandInput
  extends GetCustomModelDeploymentRequest {}
export interface GetCustomModelDeploymentCommandOutput
  extends GetCustomModelDeploymentResponse,
    __MetadataBearer {}
declare const GetCustomModelDeploymentCommand_base: {
  new (
    input: GetCustomModelDeploymentCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetCustomModelDeploymentCommandInput,
    GetCustomModelDeploymentCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetCustomModelDeploymentCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetCustomModelDeploymentCommandInput,
    GetCustomModelDeploymentCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetCustomModelDeploymentCommand extends GetCustomModelDeploymentCommand_base {
  protected static __types: {
    api: {
      input: GetCustomModelDeploymentRequest;
      output: GetCustomModelDeploymentResponse;
    };
    sdk: {
      input: GetCustomModelDeploymentCommandInput;
      output: GetCustomModelDeploymentCommandOutput;
    };
  };
}
