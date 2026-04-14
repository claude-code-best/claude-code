import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetUseCaseForModelAccessRequest,
  GetUseCaseForModelAccessResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface GetUseCaseForModelAccessCommandInput
  extends GetUseCaseForModelAccessRequest {}
export interface GetUseCaseForModelAccessCommandOutput
  extends GetUseCaseForModelAccessResponse,
    __MetadataBearer {}
declare const GetUseCaseForModelAccessCommand_base: {
  new (
    input: GetUseCaseForModelAccessCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetUseCaseForModelAccessCommandInput,
    GetUseCaseForModelAccessCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [GetUseCaseForModelAccessCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    GetUseCaseForModelAccessCommandInput,
    GetUseCaseForModelAccessCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetUseCaseForModelAccessCommand extends GetUseCaseForModelAccessCommand_base {
  protected static __types: {
    api: {
      input: {};
      output: GetUseCaseForModelAccessResponse;
    };
    sdk: {
      input: GetUseCaseForModelAccessCommandInput;
      output: GetUseCaseForModelAccessCommandOutput;
    };
  };
}
