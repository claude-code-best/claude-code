import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListModelImportJobsRequest, ListModelImportJobsResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListModelImportJobsCommand}.
 */
export interface ListModelImportJobsCommandInput extends ListModelImportJobsRequest {
}
/**
 * @public
 *
 * The output of {@link ListModelImportJobsCommand}.
 */
export interface ListModelImportJobsCommandOutput extends ListModelImportJobsResponse, __MetadataBearer {
}
declare const ListModelImportJobsCommand_base: {
    new (input: ListModelImportJobsCommandInput): import("@smithy/smithy-client").CommandImpl<ListModelImportJobsCommandInput, ListModelImportJobsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [ListModelImportJobsCommandInput]): import("@smithy/smithy-client").CommandImpl<ListModelImportJobsCommandInput, ListModelImportJobsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Returns a list of import jobs you've submitted. You can filter the results to return based on one or more criteria. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-import-model.html">Import a customized model</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListModelImportJobsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListModelImportJobsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListModelImportJobsRequest
 *   creationTimeAfter: new Date("TIMESTAMP"),
 *   creationTimeBefore: new Date("TIMESTAMP"),
 *   statusEquals: "InProgress" || "Completed" || "Failed",
 *   nameContains: "STRING_VALUE",
 *   maxResults: Number("int"),
 *   nextToken: "STRING_VALUE",
 *   sortBy: "CreationTime",
 *   sortOrder: "Ascending" || "Descending",
 * };
 * const command = new ListModelImportJobsCommand(input);
 * const response = await client.send(command);
 * // { // ListModelImportJobsResponse
 * //   nextToken: "STRING_VALUE",
 * //   modelImportJobSummaries: [ // ModelImportJobSummaries
 * //     { // ModelImportJobSummary
 * //       jobArn: "STRING_VALUE", // required
 * //       jobName: "STRING_VALUE", // required
 * //       status: "InProgress" || "Completed" || "Failed", // required
 * //       lastModifiedTime: new Date("TIMESTAMP"),
 * //       creationTime: new Date("TIMESTAMP"), // required
 * //       endTime: new Date("TIMESTAMP"),
 * //       importedModelArn: "STRING_VALUE",
 * //       importedModelName: "STRING_VALUE",
 * //     },
 * //   ],
 * // };
 *
 * ```
 *
 * @param ListModelImportJobsCommandInput - {@link ListModelImportJobsCommandInput}
 * @returns {@link ListModelImportJobsCommandOutput}
 * @see {@link ListModelImportJobsCommandInput} for command's `input` shape.
 * @see {@link ListModelImportJobsCommandOutput} for command's `response` shape.
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
export declare class ListModelImportJobsCommand extends ListModelImportJobsCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListModelImportJobsRequest;
            output: ListModelImportJobsResponse;
        };
        sdk: {
            input: ListModelImportJobsCommandInput;
            output: ListModelImportJobsCommandOutput;
        };
    };
}
