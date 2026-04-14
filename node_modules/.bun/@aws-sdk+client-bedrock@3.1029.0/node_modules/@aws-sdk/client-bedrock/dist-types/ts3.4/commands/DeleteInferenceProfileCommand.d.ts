import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteInferenceProfileRequest,
  DeleteInferenceProfileResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface DeleteInferenceProfileCommandInput
  extends DeleteInferenceProfileRequest {}
export interface DeleteInferenceProfileCommandOutput
  extends DeleteInferenceProfileResponse,
    __MetadataBearer {}
declare const DeleteInferenceProfileCommand_base: {
  new (
    input: DeleteInferenceProfileCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteInferenceProfileCommandInput,
    DeleteInferenceProfileCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteInferenceProfileCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteInferenceProfileCommandInput,
    DeleteInferenceProfileCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteInferenceProfileCommand extends DeleteInferenceProfileCommand_base {
  protected static __types: {
    api: {
      input: DeleteInferenceProfileRequest;
      output: {};
    };
    sdk: {
      input: DeleteInferenceProfileCommandInput;
      output: DeleteInferenceProfileCommandOutput;
    };
  };
}
