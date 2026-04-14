import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  CreateMarketplaceModelEndpointRequest,
  CreateMarketplaceModelEndpointResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface CreateMarketplaceModelEndpointCommandInput
  extends CreateMarketplaceModelEndpointRequest {}
export interface CreateMarketplaceModelEndpointCommandOutput
  extends CreateMarketplaceModelEndpointResponse,
    __MetadataBearer {}
declare const CreateMarketplaceModelEndpointCommand_base: {
  new (
    input: CreateMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateMarketplaceModelEndpointCommandInput,
    CreateMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: CreateMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    CreateMarketplaceModelEndpointCommandInput,
    CreateMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class CreateMarketplaceModelEndpointCommand extends CreateMarketplaceModelEndpointCommand_base {
  protected static __types: {
    api: {
      input: CreateMarketplaceModelEndpointRequest;
      output: CreateMarketplaceModelEndpointResponse;
    };
    sdk: {
      input: CreateMarketplaceModelEndpointCommandInput;
      output: CreateMarketplaceModelEndpointCommandOutput;
    };
  };
}
