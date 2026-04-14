import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeregisterMarketplaceModelEndpointRequest,
  DeregisterMarketplaceModelEndpointResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface DeregisterMarketplaceModelEndpointCommandInput
  extends DeregisterMarketplaceModelEndpointRequest {}
export interface DeregisterMarketplaceModelEndpointCommandOutput
  extends DeregisterMarketplaceModelEndpointResponse,
    __MetadataBearer {}
declare const DeregisterMarketplaceModelEndpointCommand_base: {
  new (
    input: DeregisterMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeregisterMarketplaceModelEndpointCommandInput,
    DeregisterMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeregisterMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeregisterMarketplaceModelEndpointCommandInput,
    DeregisterMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeregisterMarketplaceModelEndpointCommand extends DeregisterMarketplaceModelEndpointCommand_base {
  protected static __types: {
    api: {
      input: DeregisterMarketplaceModelEndpointRequest;
      output: {};
    };
    sdk: {
      input: DeregisterMarketplaceModelEndpointCommandInput;
      output: DeregisterMarketplaceModelEndpointCommandOutput;
    };
  };
}
