import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListInferenceProfilesRequest, ListInferenceProfilesResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListInferenceProfilesCommand}.
 */
export interface ListInferenceProfilesCommandInput extends ListInferenceProfilesRequest {
}
/**
 * @public
 *
 * The output of {@link ListInferenceProfilesCommand}.
 */
export interface ListInferenceProfilesCommandOutput extends ListInferenceProfilesResponse, __MetadataBearer {
}
declare const ListInferenceProfilesCommand_base: {
    new (input: ListInferenceProfilesCommandInput): import("@smithy/smithy-client").CommandImpl<ListInferenceProfilesCommandInput, ListInferenceProfilesCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [ListInferenceProfilesCommandInput]): import("@smithy/smithy-client").CommandImpl<ListInferenceProfilesCommandInput, ListInferenceProfilesCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Returns a list of inference profiles that you can use. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html">Increase throughput and resilience with cross-region inference in Amazon Bedrock</a>. in the Amazon Bedrock User Guide.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListInferenceProfilesCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListInferenceProfilesCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListInferenceProfilesRequest
 *   maxResults: Number("int"),
 *   nextToken: "STRING_VALUE",
 *   typeEquals: "SYSTEM_DEFINED" || "APPLICATION",
 * };
 * const command = new ListInferenceProfilesCommand(input);
 * const response = await client.send(command);
 * // { // ListInferenceProfilesResponse
 * //   inferenceProfileSummaries: [ // InferenceProfileSummaries
 * //     { // InferenceProfileSummary
 * //       inferenceProfileName: "STRING_VALUE", // required
 * //       description: "STRING_VALUE",
 * //       createdAt: new Date("TIMESTAMP"),
 * //       updatedAt: new Date("TIMESTAMP"),
 * //       inferenceProfileArn: "STRING_VALUE", // required
 * //       models: [ // InferenceProfileModels // required
 * //         { // InferenceProfileModel
 * //           modelArn: "STRING_VALUE",
 * //         },
 * //       ],
 * //       inferenceProfileId: "STRING_VALUE", // required
 * //       status: "ACTIVE", // required
 * //       type: "SYSTEM_DEFINED" || "APPLICATION", // required
 * //     },
 * //   ],
 * //   nextToken: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param ListInferenceProfilesCommandInput - {@link ListInferenceProfilesCommandInput}
 * @returns {@link ListInferenceProfilesCommandOutput}
 * @see {@link ListInferenceProfilesCommandInput} for command's `input` shape.
 * @see {@link ListInferenceProfilesCommandOutput} for command's `response` shape.
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
export declare class ListInferenceProfilesCommand extends ListInferenceProfilesCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListInferenceProfilesRequest;
            output: ListInferenceProfilesResponse;
        };
        sdk: {
            input: ListInferenceProfilesCommandInput;
            output: ListInferenceProfilesCommandOutput;
        };
    };
}
