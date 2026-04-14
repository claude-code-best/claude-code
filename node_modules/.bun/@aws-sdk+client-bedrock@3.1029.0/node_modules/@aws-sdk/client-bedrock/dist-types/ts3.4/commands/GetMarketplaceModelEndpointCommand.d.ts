import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  GetMarketplaceModelEndpointRequest,
  GetMarketplaceModelEndpointResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface GetMarketplaceModelEndpointCommandInput
  extends GetMarketplaceModelEndpointRequest {}
export interface GetMarketplaceModelEndpointCommandOutput
  extends GetMarketplaceModelEndpointResponse,
    __MetadataBearer {}
declare const GetMarketplaceModelEndpointCommand_base: {
  new (
    input: GetMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetMarketplaceModelEndpointCommandInput,
    GetMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetMarketplaceModelEndpointCommandInput,
    GetMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetMarketplaceModelEndpointCommand extends GetMarketplaceModelEndpointCommand_base {
  protected static __types: {
    api: {
      input: GetMarketplaceModelEndpointRequest;
      output: GetMarketplaceModelEndpointResponse;
    };
    sdk: {
      input: GetMarketplaceModelEndpointCommandInput;
      output: GetMarketplaceModelEndpointCommandOutput;
    };
  };
}
