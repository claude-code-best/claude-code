import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListModelInvocationJobsRequest, ListModelInvocationJobsResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListModelInvocationJobsCommand}.
 */
export interface ListModelInvocationJobsCommandInput extends ListModelInvocationJobsRequest {
}
/**
 * @public
 *
 * The output of {@link ListModelInvocationJobsCommand}.
 */
export interface ListModelInvocationJobsCommandOutput extends ListModelInvocationJobsResponse, __MetadataBearer {
}
declare const ListModelInvocationJobsCommand_base: {
    new (input: ListModelInvocationJobsCommandInput): import("@smithy/smithy-client").CommandImpl<ListModelInvocationJobsCommandInput, ListModelInvocationJobsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [ListModelInvocationJobsCommandInput]): import("@smithy/smithy-client").CommandImpl<ListModelInvocationJobsCommandInput, ListModelInvocationJobsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Lists all batch inference jobs in the account. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference-view.html">View details about a batch inference job</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListModelInvocationJobsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListModelInvocationJobsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListModelInvocationJobsRequest
 *   submitTimeAfter: new Date("TIMESTAMP"),
 *   submitTimeBefore: new Date("TIMESTAMP"),
 *   statusEquals: "Submitted" || "InProgress" || "Completed" || "Failed" || "Stopping" || "Stopped" || "PartiallyCompleted" || "Expired" || "Validating" || "Scheduled",
 *   nameContains: "STRING_VALUE",
 *   maxResults: Number("int"),
 *   nextToken: "STRING_VALUE",
 *   sortBy: "CreationTime",
 *   sortOrder: "Ascending" || "Descending",
 * };
 * const command = new ListModelInvocationJobsCommand(input);
 * const response = await client.send(command);
 * // { // ListModelInvocationJobsResponse
 * //   nextToken: "STRING_VALUE",
 * //   invocationJobSummaries: [ // ModelInvocationJobSummaries
 * //     { // ModelInvocationJobSummary
 * //       jobArn: "STRING_VALUE", // required
 * //       jobName: "STRING_VALUE", // required
 * //       modelId: "STRING_VALUE", // required
 * //       clientRequestToken: "STRING_VALUE",
 * //       roleArn: "STRING_VALUE", // required
 * //       status: "Submitted" || "InProgress" || "Completed" || "Failed" || "Stopping" || "Stopped" || "PartiallyCompleted" || "Expired" || "Validating" || "Scheduled",
 * //       message: "STRING_VALUE",
 * //       submitTime: new Date("TIMESTAMP"), // required
 * //       lastModifiedTime: new Date("TIMESTAMP"),
 * //       endTime: new Date("TIMESTAMP"),
 * //       inputDataConfig: { // ModelInvocationJobInputDataConfig Union: only one key present
 * //         s3InputDataConfig: { // ModelInvocationJobS3InputDataConfig
 * //           s3InputFormat: "JSONL",
 * //           s3Uri: "STRING_VALUE", // required
 * //           s3BucketOwner: "STRING_VALUE",
 * //         },
 * //       },
 * //       outputDataConfig: { // ModelInvocationJobOutputDataConfig Union: only one key present
 * //         s3OutputDataConfig: { // ModelInvocationJobS3OutputDataConfig
 * //           s3Uri: "STRING_VALUE", // required
 * //           s3EncryptionKeyId: "STRING_VALUE",
 * //           s3BucketOwner: "STRING_VALUE",
 * //         },
 * //       },
 * //       vpcConfig: { // VpcConfig
 * //         subnetIds: [ // SubnetIds // required
 * //           "STRING_VALUE",
 * //         ],
 * //         securityGroupIds: [ // SecurityGroupIds // required
 * //           "STRING_VALUE",
 * //         ],
 * //       },
 * //       timeoutDurationInHours: Number("int"),
 * //       jobExpirationTime: new Date("TIMESTAMP"),
 * //       modelInvocationType: "InvokeModel" || "Converse",
 * //     },
 * //   ],
 * // };
 *
 * ```
 *
 * @param ListModelInvocationJobsCommandInput - {@link ListModelInvocationJobsCommandInput}
 * @returns {@link ListModelInvocationJobsCommandOutput}
 * @see {@link ListModelInvocationJobsCommandInput} for command's `input` shape.
 * @see {@link ListModelInvocationJobsCommandOutput} for command's `response` shape.
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
export declare class ListModelInvocationJobsCommand extends ListModelInvocationJobsCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListModelInvocationJobsRequest;
            output: ListModelInvocationJobsResponse;
        };
        sdk: {
            input: ListModelInvocationJobsCommandInput;
            output: ListModelInvocationJobsCommandOutput;
        };
    };
}
