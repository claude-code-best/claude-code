import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  UpdateMarketplaceModelEndpointRequest,
  UpdateMarketplaceModelEndpointResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface UpdateMarketplaceModelEndpointCommandInput
  extends UpdateMarketplaceModelEndpointRequest {}
export interface UpdateMarketplaceModelEndpointCommandOutput
  extends UpdateMarketplaceModelEndpointResponse,
    __MetadataBearer {}
declare const UpdateMarketplaceModelEndpointCommand_base: {
  new (
    input: UpdateMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateMarketplaceModelEndpointCommandInput,
    UpdateMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: UpdateMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    UpdateMarketplaceModelEndpointCommandInput,
    UpdateMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class UpdateMarketplaceModelEndpointCommand extends UpdateMarketplaceModelEndpointCommand_base {
  protected static __types: {
    api: {
      input: UpdateMarketplaceModelEndpointRequest;
      output: UpdateMarketplaceModelEndpointResponse;
    };
    sdk: {
      input: UpdateMarketplaceModelEndpointCommandInput;
      output: UpdateMarketplaceModelEndpointCommandOutput;
    };
  };
}
