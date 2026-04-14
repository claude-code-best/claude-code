import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteCustomModelRequest,
  DeleteCustomModelResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface DeleteCustomModelCommandInput
  extends DeleteCustomModelRequest {}
export interface DeleteCustomModelCommandOutput
  extends DeleteCustomModelResponse,
    __MetadataBearer {}
declare const DeleteCustomModelCommand_base: {
  new (
    input: DeleteCustomModelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteCustomModelCommandInput,
    DeleteCustomModelCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteCustomModelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteCustomModelCommandInput,
    DeleteCustomModelCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteCustomModelCommand extends DeleteCustomModelCommand_base {
  protected static __types: {
    api: {
      input: DeleteCustomModelRequest;
      output: {};
    };
    sdk: {
      input: DeleteCustomModelCommandInput;
      output: DeleteCustomModelCommandOutput;
    };
  };
}
