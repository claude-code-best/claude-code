import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  ListMarketplaceModelEndpointsRequest,
  ListMarketplaceModelEndpointsResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface ListMarketplaceModelEndpointsCommandInput
  extends ListMarketplaceModelEndpointsRequest {}
export interface ListMarketplaceModelEndpointsCommandOutput
  extends ListMarketplaceModelEndpointsResponse,
    __MetadataBearer {}
declare const ListMarketplaceModelEndpointsCommand_base: {
  new (
    input: ListMarketplaceModelEndpointsCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    ListMarketplaceModelEndpointsCommandInput,
    ListMarketplaceModelEndpointsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    ...[input]: [] | [ListMarketplaceModelEndpointsCommandInput]
  ): import("@smithy/smithy-client").CommandImpl<
    ListMarketplaceModelEndpointsCommandInput,
    ListMarketplaceModelEndpointsCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class ListMarketplaceModelEndpointsCommand extends ListMarketplaceModelEndpointsCommand_base {
  protected static __types: {
    api: {
      input: ListMarketplaceModelEndpointsRequest;
      output: ListMarketplaceModelEndpointsResponse;
    };
    sdk: {
      input: ListMarketplaceModelEndpointsCommandInput;
      output: ListMarketplaceModelEndpointsCommandOutput;
    };
  };
}
