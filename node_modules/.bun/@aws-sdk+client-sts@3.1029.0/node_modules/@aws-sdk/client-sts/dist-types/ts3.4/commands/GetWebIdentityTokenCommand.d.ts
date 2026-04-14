import { Command as $Command } from "@smithy/smithy-client";
import { MetadataBearer as __MetadataBearer } from "@smithy/types";
import {
  GetWebIdentityTokenRequest,
  GetWebIdentityTokenResponse,
} from "../models/models_0";
import {
  ServiceInputTypes,
  ServiceOutputTypes,
  STSClientResolvedConfig,
} from "../STSClient";
export { __MetadataBearer };
export { $Command };
export interface GetWebIdentityTokenCommandInput
  extends GetWebIdentityTokenRequest {}
export interface GetWebIdentityTokenCommandOutput
  extends GetWebIdentityTokenResponse,
    __MetadataBearer {}
declare const GetWebIdentityTokenCommand_base: {
  new (
    input: GetWebIdentityTokenCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetWebIdentityTokenCommandInput,
    GetWebIdentityTokenCommandOutput,
    STSClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  new (
    input: GetWebIdentityTokenCommandInput
  ): import("@smithy/smithy-client").CommandImpl<
    GetWebIdentityTokenCommandInput,
    GetWebIdentityTokenCommandOutput,
    STSClientResolvedConfig,
    ServiceInputTypes,
    ServiceOutputTypes
  >;
  getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
export declare class GetWebIdentityTokenCommand extends GetWebIdentityTokenCommand_base {
  protected static __types: {
    api: {
      input: GetWebIdentityTokenRequest;
      output: GetWebIdentityTokenResponse;
    };
    sdk: {
      input: GetWebIdentityTokenCommandInput;
      output: GetWebIdentityTokenCommandOutput;
    };
  };
}
