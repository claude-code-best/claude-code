import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListMarketplaceModelEndpointsRequest, ListMarketplaceModelEndpointsResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListMarketplaceModelEndpointsCommand}.
 */
export interface ListMarketplaceModelEndpointsCommandInput extends ListMarketplaceModelEndpointsRequest {
}
/**
 * @public
 *
 * The output of {@link ListMarketplaceModelEndpointsCommand}.
 */
export interface ListMarketplaceModelEndpointsCommandOutput extends ListMarketplaceModelEndpointsResponse, __MetadataBearer {
}
declare const ListMarketplaceModelEndpointsCommand_base: {
    new (input: ListMarketplaceModelEndpointsCommandInput): import("@smithy/smithy-client").CommandImpl<ListMarketplaceModelEndpointsCommandInput, ListMarketplaceModelEndpointsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [ListMarketplaceModelEndpointsCommandInput]): import("@smithy/smithy-client").CommandImpl<ListMarketplaceModelEndpointsCommandInput, ListMarketplaceModelEndpointsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Lists the endpoints for models from Amazon Bedrock Marketplace in your Amazon Web Services account.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListMarketplaceModelEndpointsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListMarketplaceModelEndpointsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListMarketplaceModelEndpointsRequest
 *   maxResults: Number("int"),
 *   nextToken: "STRING_VALUE",
 *   modelSourceEquals: "STRING_VALUE",
 * };
 * const command = new ListMarketplaceModelEndpointsCommand(input);
 * const response = await client.send(command);
 * // { // ListMarketplaceModelEndpointsResponse
 * //   marketplaceModelEndpoints: [ // MarketplaceModelEndpointSummaries
 * //     { // MarketplaceModelEndpointSummary
 * //       endpointArn: "STRING_VALUE", // required
 * //       modelSourceIdentifier: "STRING_VALUE", // required
 * //       status: "REGISTERED" || "INCOMPATIBLE_ENDPOINT",
 * //       statusMessage: "STRING_VALUE",
 * //       createdAt: new Date("TIMESTAMP"), // required
 * //       updatedAt: new Date("TIMESTAMP"), // required
 * //     },
 * //   ],
 * //   nextToken: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param ListMarketplaceModelEndpointsCommandInput - {@link ListMarketplaceModelEndpointsCommandInput}
 * @returns {@link ListMarketplaceModelEndpointsCommandOutput}
 * @see {@link ListMarketplaceModelEndpointsCommandInput} for command's `input` shape.
 * @see {@link ListMarketplaceModelEndpointsCommandOutput} for command's `response` shape.
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
export declare class ListMarketplaceModelEndpointsCommand extends ListMarketplaceModelEndpointsCommand_base {
    /** @internal type navigation helper, not in runtime. */
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
