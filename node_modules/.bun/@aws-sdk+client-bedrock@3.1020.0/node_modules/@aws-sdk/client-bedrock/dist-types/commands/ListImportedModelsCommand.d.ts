import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListImportedModelsRequest, ListImportedModelsResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListImportedModelsCommand}.
 */
export interface ListImportedModelsCommandInput extends ListImportedModelsRequest {
}
/**
 * @public
 *
 * The output of {@link ListImportedModelsCommand}.
 */
export interface ListImportedModelsCommandOutput extends ListImportedModelsResponse, __MetadataBearer {
}
declare const ListImportedModelsCommand_base: {
    new (input: ListImportedModelsCommandInput): import("@smithy/smithy-client").CommandImpl<ListImportedModelsCommandInput, ListImportedModelsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [ListImportedModelsCommandInput]): import("@smithy/smithy-client").CommandImpl<ListImportedModelsCommandInput, ListImportedModelsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Returns a list of models you've imported. You can filter the results to return based on one or more criteria. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-import-model.html">Import a customized model</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListImportedModelsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListImportedModelsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListImportedModelsRequest
 *   creationTimeBefore: new Date("TIMESTAMP"),
 *   creationTimeAfter: new Date("TIMESTAMP"),
 *   nameContains: "STRING_VALUE",
 *   maxResults: Number("int"),
 *   nextToken: "STRING_VALUE",
 *   sortBy: "CreationTime",
 *   sortOrder: "Ascending" || "Descending",
 * };
 * const command = new ListImportedModelsCommand(input);
 * const response = await client.send(command);
 * // { // ListImportedModelsResponse
 * //   nextToken: "STRING_VALUE",
 * //   modelSummaries: [ // ImportedModelSummaryList
 * //     { // ImportedModelSummary
 * //       modelArn: "STRING_VALUE", // required
 * //       modelName: "STRING_VALUE", // required
 * //       creationTime: new Date("TIMESTAMP"), // required
 * //       instructSupported: true || false,
 * //       modelArchitecture: "STRING_VALUE",
 * //     },
 * //   ],
 * // };
 *
 * ```
 *
 * @param ListImportedModelsCommandInput - {@link ListImportedModelsCommandInput}
 * @returns {@link ListImportedModelsCommandOutput}
 * @see {@link ListImportedModelsCommandInput} for command's `input` shape.
 * @see {@link ListImportedModelsCommandOutput} for command's `response` shape.
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
export declare class ListImportedModelsCommand extends ListImportedModelsCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListImportedModelsRequest;
            output: ListImportedModelsResponse;
        };
        sdk: {
            input: ListImportedModelsCommandInput;
            output: ListImportedModelsCommandOutput;
        };
    };
}
