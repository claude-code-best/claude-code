import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  BedrockClientResolvedConfig,
  ServiceInputTypes,
  ServiceOutputTypes,
} from "../BedrockClient";
import {
  DeleteMarketplaceModelEndpointRequest,
  DeleteMarketplaceModelEndpointResponse,
} from "../models/models_0";
export { __MetadataBearer };
export { $Command };
export interface DeleteMarketplaceModelEndpointCommandInput
  extends DeleteMarketplaceModelEndpointRequest {}
export interface DeleteMarketplaceModelEndpointCommandOutput
  extends DeleteMarketplaceModelEndpointResponse,
    __MetadataBearer {}
declare const DeleteMarketplaceModelEndpointCommand_base: {
  new (
    input: DeleteMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteMarketplaceModelEndpointCommandInput,
    DeleteMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: DeleteMarketplaceModelEndpointCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    DeleteMarketplaceModelEndpointCommandInput,
    DeleteMarketplaceModelEndpointCommandOutput,
    BedrockClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class DeleteMarketplaceModelEndpointCommand extends DeleteMarketplaceModelEndpointCommand_base {
  protected static __types: {
    api: {
      input: DeleteMarketplaceModelEndpointRequest;
      output: {};
    };
    sdk: {
      input: DeleteMarketplaceModelEndpointCommandInput;
      output: DeleteMarketplaceModelEndpointCommandOutput;
    };
  };
}
