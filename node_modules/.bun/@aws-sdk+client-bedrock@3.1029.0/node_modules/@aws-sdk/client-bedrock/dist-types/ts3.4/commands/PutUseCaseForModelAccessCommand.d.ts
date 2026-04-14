import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  PutUseCaseForModelAccessRequest,
  PutUseCaseForModelAccessResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface PutUseCaseForModelAccessCommandInput
  extends PutUseCaseForModelAccessRequest {}
export interface PutUseCaseForModelAccessCommandOutput
  extends PutUseCaseForModelAccessResponse,
    __MetadataBearer {}
declare const PutUseCaseForModelAccessCommand_base: {
  new (
    input: PutUseCaseForModelAccessCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    PutUseCaseForModelAccessCommandInput,
    PutUseCaseForModelAccessCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: PutUseCaseForModelAccessCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    PutUseCaseForModelAccessCommandInput,
    PutUseCaseForModelAccessCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class PutUseCaseForModelAccessCommand extends PutUseCaseForModelAccessCommand_base {
  protected static __types: {
    api: {
      input: PutUseCaseForModelAccessRequest;
      output: {};
    };
    sdk: {
      input: PutUseCaseForModelAccessCommandInput;
      output: PutUseCaseForModelAccessCommandOutput;
    };
  };
}
