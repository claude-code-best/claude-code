import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteImportedModelRequest,
  DeleteImportedModelResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface DeleteImportedModelCommandInput
  extends DeleteImportedModelRequest {}
export interface DeleteImportedModelCommandOutput
  extends DeleteImportedModelResponse,
    __MetadataBearer {}
declare const DeleteImportedModelCommand_base: {
  new (
    input: DeleteImportedModelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteImportedModelCommandInput,
    DeleteImportedModelCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteImportedModelCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteImportedModelCommandInput,
    DeleteImportedModelCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteImportedModelCommand extends DeleteImportedModelCommand_base {
  protected static __types: {
    api: {
      input: DeleteImportedModelRequest;
      output: {};
    };
    sdk: {
      input: DeleteImportedModelCommandInput;
      output: DeleteImportedModelCommandOutput;
    };
  };
}
