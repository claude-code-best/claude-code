import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteMarketplaceModelEndpointRequest, DeleteMarketplaceModelEndpointResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteMarketplaceModelEndpointCommand}.
 */
export interface DeleteMarketplaceModelEndpointCommandInput extends DeleteMarketplaceModelEndpointRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteMarketplaceModelEndpointCommand}.
 */
export interface DeleteMarketplaceModelEndpointCommandOutput extends DeleteMarketplaceModelEndpointResponse, __MetadataBearer {
}
declare const DeleteMarketplaceModelEndpointCommand_base: {
    new (input: DeleteMarketplaceModelEndpointCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteMarketplaceModelEndpointCommandInput, DeleteMarketplaceModelEndpointCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteMarketplaceModelEndpointCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteMarketplaceModelEndpointCommandInput, DeleteMarketplaceModelEndpointCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes an endpoint for a model from Amazon Bedrock Marketplace.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteMarketplaceModelEndpointCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteMarketplaceModelEndpointCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteMarketplaceModelEndpointRequest
 *   endpointArn: "STRING_VALUE", // required
 * };
 * const command = new DeleteMarketplaceModelEndpointCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteMarketplaceModelEndpointCommandInput - {@link DeleteMarketplaceModelEndpointCommandInput}
 * @returns {@link DeleteMarketplaceModelEndpointCommandOutput}
 * @see {@link DeleteMarketplaceModelEndpointCommandInput} for command's `input` shape.
 * @see {@link DeleteMarketplaceModelEndpointCommandOutput} for command's `response` shape.
 * @see {@link BedrockClientResolvedConfig | config} for BedrockClient's `config` shape.
 *
 * @throws {@link AccessDeniedException} (client fault)
 *  <p>The request is denied because of missing access permissions.</p>
 *
 * @throws {@link InternalServerException} (server fault)
 *  <p>An internal server error occurred. Retry your request.</p>
 *
 * @throws {@link ResourceNotFoundException} (client fault)
 *  <p>The specified resource Amazon Resource Name (ARN) was not found. Check the Amazon Resource Name (ARN) and try your request again.</p>
 *
 * @throws {@link ThrottlingException} (client fault)
 *  <p>The number of requests exceeds the limit. Resubmit your request later.</p>
 *
 * @throws {@link ValidationException} (client fault)
 *  <p>Input validation failed. Check your request parameters and retry the request.</p>
 *
 * @throws {@link BedrockServiceException}
 * <p>Base exception class for all service exceptions from Bedrock service.</p>
 *
 *
 * @public
 */
export declare class DeleteMarketplaceModelEndpointCommand extends DeleteMarketplaceModelEndpointCommand_base {
    /** @internal type navigation helper, not in runtime. */
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
