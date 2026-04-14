import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteFoundationModelAgreementRequest,
  DeleteFoundationModelAgreementResponse,
} from "../models/models_1";
export { __MetadataBearer };
export { $Command };
export interface DeleteFoundationModelAgreementCommandInput
  extends DeleteFoundationModelAgreementRequest {}
export interface DeleteFoundationModelAgreementCommandOutput
  extends DeleteFoundationModelAgreementResponse,
    __MetadataBearer {}
declare const DeleteFoundationModelAgreementCommand_base: {
  new (
    input: DeleteFoundationModelAgreementCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteFoundationModelAgreementCommandInput,
    DeleteFoundationModelAgreementCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteFoundationModelAgreementCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteFoundationModelAgreementCommandInput,
    DeleteFoundationModelAgreementCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteFoundationModelAgreementCommand extends DeleteFoundationModelAgreementCommand_base {
  protected static __types: {
    api: {
      input: DeleteFoundationModelAgreementRequest;
      output: {};
    };
    sdk: {
      input: DeleteFoundationModelAgreementCommandInput;
      output: DeleteFoundationModelAgreementCommandOutput;
    };
  };
}
