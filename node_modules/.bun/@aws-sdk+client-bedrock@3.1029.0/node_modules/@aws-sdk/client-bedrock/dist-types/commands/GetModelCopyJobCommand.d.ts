import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetModelCopyJobRequest, GetModelCopyJobResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetModelCopyJobCommand}.
 */
export interface GetModelCopyJobCommandInput extends GetModelCopyJobRequest {
}
/**
 * @public
 *
 * The output of {@link GetModelCopyJobCommand}.
 */
export interface GetModelCopyJobCommandOutput extends GetModelCopyJobResponse, __MetadataBearer {
}
declare const GetModelCopyJobCommand_base: {
    new (input: GetModelCopyJobCommandInput): import("@smithy/smithy-client").CommandImpl<GetModelCopyJobCommandInput, GetModelCopyJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetModelCopyJobCommandInput): import("@smithy/smithy-client").CommandImpl<GetModelCopyJobCommandInput, GetModelCopyJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Retrieves information about a model copy job. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/copy-model.html">Copy models to be used in other regions</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetModelCopyJobCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetModelCopyJobCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetModelCopyJobRequest
 *   jobArn: "STRING_VALUE", // required
 * };
 * const command = new GetModelCopyJobCommand(input);
 * const response = await client.send(command);
 * // { // GetModelCopyJobResponse
 * //   jobArn: "STRING_VALUE", // required
 * //   status: "InProgress" || "Completed" || "Failed", // required
 * //   creationTime: new Date("TIMESTAMP"), // required
 * //   targetModelArn: "STRING_VALUE", // required
 * //   targetModelName: "STRING_VALUE",
 * //   sourceAccountId: "STRING_VALUE", // required
 * //   sourceModelArn: "STRING_VALUE", // required
 * //   targetModelKmsKeyArn: "STRING_VALUE",
 * //   targetModelTags: [ // TagList
 * //     { // Tag
 * //       key: "STRING_VALUE", // required
 * //       value: "STRING_VALUE", // required
 * //     },
 * //   ],
 * //   failureMessage: "STRING_VALUE",
 * //   sourceModelName: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param GetModelCopyJobCommandInput - {@link GetModelCopyJobCommandInput}
 * @returns {@link GetModelCopyJobCommandOutput}
 * @see {@link GetModelCopyJobCommandInput} for command's `input` shape.
 * @see {@link GetModelCopyJobCommandOutput} for command's `response` shape.
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
export declare class GetModelCopyJobCommand extends GetModelCopyJobCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetModelCopyJobRequest;
            output: GetModelCopyJobResponse;
        };
        sdk: {
            input: GetModelCopyJobCommandInput;
            output: GetModelCopyJobCommandOutput;
        };
    };
}
