import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteProvisionedModelThroughputRequest,
  DeleteProvisionedModelThroughputResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface DeleteProvisionedModelThroughputCommandInput
  extends DeleteProvisionedModelThroughputRequest {}
export interface DeleteProvisionedModelThroughputCommandOutput
  extends DeleteProvisionedModelThroughputResponse,
    __MetadataBearer {}
declare const DeleteProvisionedModelThroughputCommand_base: {
  new (
    input: DeleteProvisionedModelThroughputCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteProvisionedModelThroughputCommandInput,
    DeleteProvisionedModelThroughputCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteProvisionedModelThroughputCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteProvisionedModelThroughputCommandInput,
    DeleteProvisionedModelThroughputCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteProvisionedModelThroughputCommand extends DeleteProvisionedModelThroughputCommand_base {
  protected static __types: {
    api: {
      input: DeleteProvisionedModelThroughputRequest;
      output: {};
    };
    sdk: {
      input: DeleteProvisionedModelThroughputCommandInput;
      output: DeleteProvisionedModelThroughputCommandOutput;
    };
  };
}
