import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListPromptRoutersRequest, ListPromptRoutersResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListPromptRoutersCommand}.
 */
export interface ListPromptRoutersCommandInput extends ListPromptRoutersRequest {
}
/**
 * @public
 *
 * The output of {@link ListPromptRoutersCommand}.
 */
export interface ListPromptRoutersCommandOutput extends ListPromptRoutersResponse, __MetadataBearer {
}
declare const ListPromptRoutersCommand_base: {
    new (input: ListPromptRoutersCommandInput): import("@smithy/smithy-client").CommandImpl<ListPromptRoutersCommandInput, ListPromptRoutersCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [ListPromptRoutersCommandInput]): import("@smithy/smithy-client").CommandImpl<ListPromptRoutersCommandInput, ListPromptRoutersCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Retrieves a list of prompt routers.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListPromptRoutersCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListPromptRoutersCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListPromptRoutersRequest
 *   maxResults: Number("int"),
 *   nextToken: "STRING_VALUE",
 *   type: "custom" || "default",
 * };
 * const command = new ListPromptRoutersCommand(input);
 * const response = await client.send(command);
 * // { // ListPromptRoutersResponse
 * //   promptRouterSummaries: [ // PromptRouterSummaries
 * //     { // PromptRouterSummary
 * //       promptRouterName: "STRING_VALUE", // required
 * //       routingCriteria: { // RoutingCriteria
 * //         responseQualityDifference: Number("double"), // required
 * //       },
 * //       description: "STRING_VALUE",
 * //       createdAt: new Date("TIMESTAMP"),
 * //       updatedAt: new Date("TIMESTAMP"),
 * //       promptRouterArn: "STRING_VALUE", // required
 * //       models: [ // PromptRouterTargetModels // required
 * //         { // PromptRouterTargetModel
 * //           modelArn: "STRING_VALUE", // required
 * //         },
 * //       ],
 * //       fallbackModel: {
 * //         modelArn: "STRING_VALUE", // required
 * //       },
 * //       status: "AVAILABLE", // required
 * //       type: "custom" || "default", // required
 * //     },
 * //   ],
 * //   nextToken: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param ListPromptRoutersCommandInput - {@link ListPromptRoutersCommandInput}
 * @returns {@link ListPromptRoutersCommandOutput}
 * @see {@link ListPromptRoutersCommandInput} for command's `input` shape.
 * @see {@link ListPromptRoutersCommandOutput} for command's `response` shape.
 * @see {@link BedrockClientResolvedConfig | config} for BedrockClient's `config` shape.
 *
 * @throws {@link AccessDeniedException} (client fault)
 *  <p>The request is denied because of missing access permissions.</p>
 *
 * @throws {@link InternalServerException} (server fault)
 *  <p>An internal server error occurred. Retry your request.</p>
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
export declare class ListPromptRoutersCommand extends ListPromptRoutersCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListPromptRoutersRequest;
            output: ListPromptRoutersResponse;
        };
        sdk: {
            input: ListPromptRoutersCommandInput;
            output: ListPromptRoutersCommandOutput;
        };
    };
}
