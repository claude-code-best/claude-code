import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListCustomModelsRequest, ListCustomModelsResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListCustomModelsCommand}.
 */
export interface ListCustomModelsCommandInput extends ListCustomModelsRequest {
}
/**
 * @public
 *
 * The output of {@link ListCustomModelsCommand}.
 */
export interface ListCustomModelsCommandOutput extends ListCustomModelsResponse, __MetadataBearer {
}
declare const ListCustomModelsCommand_base: {
    new (input: ListCustomModelsCommandInput): import("@smithy/smithy-client").CommandImpl<ListCustomModelsCommandInput, ListCustomModelsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [ListCustomModelsCommandInput]): import("@smithy/smithy-client").CommandImpl<ListCustomModelsCommandInput, ListCustomModelsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Returns a list of the custom models that you have created with the <code>CreateModelCustomizationJob</code> operation.</p> <p>For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models.html">Custom models</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListCustomModelsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListCustomModelsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListCustomModelsRequest
 *   creationTimeBefore: new Date("TIMESTAMP"),
 *   creationTimeAfter: new Date("TIMESTAMP"),
 *   nameContains: "STRING_VALUE",
 *   baseModelArnEquals: "STRING_VALUE",
 *   foundationModelArnEquals: "STRING_VALUE",
 *   maxResults: Number("int"),
 *   nextToken: "STRING_VALUE",
 *   sortBy: "CreationTime",
 *   sortOrder: "Ascending" || "Descending",
 *   isOwned: true || false,
 *   modelStatus: "Active" || "Creating" || "Failed",
 * };
 * const command = new ListCustomModelsCommand(input);
 * const response = await client.send(command);
 * // { // ListCustomModelsResponse
 * //   nextToken: "STRING_VALUE",
 * //   modelSummaries: [ // CustomModelSummaryList
 * //     { // CustomModelSummary
 * //       modelArn: "STRING_VALUE", // required
 * //       modelName: "STRING_VALUE", // required
 * //       creationTime: new Date("TIMESTAMP"), // required
 * //       baseModelArn: "STRING_VALUE", // required
 * //       baseModelName: "STRING_VALUE", // required
 * //       customizationType: "FINE_TUNING" || "CONTINUED_PRE_TRAINING" || "DISTILLATION" || "REINFORCEMENT_FINE_TUNING" || "IMPORTED",
 * //       ownerAccountId: "STRING_VALUE",
 * //       modelStatus: "Active" || "Creating" || "Failed",
 * //     },
 * //   ],
 * // };
 *
 * ```
 *
 * @param ListCustomModelsCommandInput - {@link ListCustomModelsCommandInput}
 * @returns {@link ListCustomModelsCommandOutput}
 * @see {@link ListCustomModelsCommandInput} for command's `input` shape.
 * @see {@link ListCustomModelsCommandOutput} for command's `response` shape.
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
export declare class ListCustomModelsCommand extends ListCustomModelsCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListCustomModelsRequest;
            output: ListCustomModelsResponse;
        };
        sdk: {
            input: ListCustomModelsCommandInput;
            output: ListCustomModelsCommandOutput;
        };
    };
}
