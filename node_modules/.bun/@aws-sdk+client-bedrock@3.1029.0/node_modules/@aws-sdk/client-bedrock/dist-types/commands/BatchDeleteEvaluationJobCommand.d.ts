import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { BatchDeleteEvaluationJobRequest, BatchDeleteEvaluationJobResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link BatchDeleteEvaluationJobCommand}.
 */
export interface BatchDeleteEvaluationJobCommandInput extends BatchDeleteEvaluationJobRequest {
}
/**
 * @public
 *
 * The output of {@link BatchDeleteEvaluationJobCommand}.
 */
export interface BatchDeleteEvaluationJobCommandOutput extends BatchDeleteEvaluationJobResponse, __MetadataBearer {
}
declare const BatchDeleteEvaluationJobCommand_base: {
    new (input: BatchDeleteEvaluationJobCommandInput): import("@smithy/smithy-client").CommandImpl<BatchDeleteEvaluationJobCommandInput, BatchDeleteEvaluationJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: BatchDeleteEvaluationJobCommandInput): import("@smithy/smithy-client").CommandImpl<BatchDeleteEvaluationJobCommandInput, BatchDeleteEvaluationJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes a batch of evaluation jobs. An evaluation job can only be deleted if it has following status <code>FAILED</code>, <code>COMPLETED</code>, and <code>STOPPED</code>. You can request up to 25 model evaluation jobs be deleted in a single request.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, BatchDeleteEvaluationJobCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, BatchDeleteEvaluationJobCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // BatchDeleteEvaluationJobRequest
 *   jobIdentifiers: [ // EvaluationJobIdentifiers // required
 *     "STRING_VALUE",
 *   ],
 * };
 * const command = new BatchDeleteEvaluationJobCommand(input);
 * const response = await client.send(command);
 * // { // BatchDeleteEvaluationJobResponse
 * //   errors: [ // BatchDeleteEvaluationJobErrors // required
 * //     { // BatchDeleteEvaluationJobError
 * //       jobIdentifier: "STRING_VALUE", // required
 * //       code: "STRING_VALUE", // required
 * //       message: "STRING_VALUE",
 * //     },
 * //   ],
 * //   evaluationJobs: [ // BatchDeleteEvaluationJobItems // required
 * //     { // BatchDeleteEvaluationJobItem
 * //       jobIdentifier: "STRING_VALUE", // required
 * //       jobStatus: "InProgress" || "Completed" || "Failed" || "Stopping" || "Stopped" || "Deleting", // required
 * //     },
 * //   ],
 * // };
 *
 * ```
 *
 * @param BatchDeleteEvaluationJobCommandInput - {@link BatchDeleteEvaluationJobCommandInput}
 * @returns {@link BatchDeleteEvaluationJobCommandOutput}
 * @see {@link BatchDeleteEvaluationJobCommandInput} for command's `input` shape.
 * @see {@link BatchDeleteEvaluationJobCommandOutput} for command's `response` shape.
 * @see {@link BedrockClientResolvedConfig | config} for BedrockClient's `config` shape.
 *
 * @throws {@link AccessDeniedException} (client fault)
 *  <p>The request is denied because of missing access permissions.</p>
 *
 * @throws {@link ConflictException} (client fault)
 *  <p>Error occurred because of a conflict while performing an operation.</p>
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
 * @example Delete evaluation jobs
 * ```javascript
 * // The following example shows a request to delete two model evaluation jobs, where one of the jobs is not found.
 * const input = {
 *   jobIdentifiers: [
 *     "arn:aws:bedrock:us-east-2:123456789012:evaluation-job/12rnxmplqv0v",
 *     "arn:aws:bedrock:us-east-2:123456789012:evaluation-job/rispxmpl12rn"
 *   ]
 * };
 * const command = new BatchDeleteEvaluationJobCommand(input);
 * const response = await client.send(command);
 * /* response is
 * {
 *   errors: [
 *     {
 *       code: "404",
 *       jobIdentifier: "arn:aws:bedrock:us-east-2:123456789012:evaluation-job/rispxmpl12rn",
 *       message: "Unable to locate this job to delete."
 *     }
 *   ],
 *   evaluationJobs: [
 *     {
 *       jobIdentifier: "arn:aws:bedrock:us-east-2:123456789012:evaluation-job/12rnxmplqv0v",
 *       jobStatus: "Deleting"
 *     }
 *   ]
 * }
 * *\/
 * ```
 *
 * @public
 */
export declare class BatchDeleteEvaluationJobCommand extends BatchDeleteEvaluationJobCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: BatchDeleteEvaluationJobRequest;
            output: BatchDeleteEvaluationJobResponse;
        };
        sdk: {
            input: BatchDeleteEvaluationJobCommandInput;
            output: BatchDeleteEvaluationJobCommandOutput;
        };
    };
}
