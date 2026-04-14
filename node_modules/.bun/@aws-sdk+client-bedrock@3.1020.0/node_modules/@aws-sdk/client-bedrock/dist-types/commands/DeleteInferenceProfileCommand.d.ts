import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteInferenceProfileRequest, DeleteInferenceProfileResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteInferenceProfileCommand}.
 */
export interface DeleteInferenceProfileCommandInput extends DeleteInferenceProfileRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteInferenceProfileCommand}.
 */
export interface DeleteInferenceProfileCommandOutput extends DeleteInferenceProfileResponse, __MetadataBearer {
}
declare const DeleteInferenceProfileCommand_base: {
    new (input: DeleteInferenceProfileCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteInferenceProfileCommandInput, DeleteInferenceProfileCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteInferenceProfileCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteInferenceProfileCommandInput, DeleteInferenceProfileCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes an application inference profile. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html">Increase throughput and resilience with cross-region inference in Amazon Bedrock</a>. in the Amazon Bedrock User Guide.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteInferenceProfileCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteInferenceProfileCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteInferenceProfileRequest
 *   inferenceProfileIdentifier: "STRING_VALUE", // required
 * };
 * const command = new DeleteInferenceProfileCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteInferenceProfileCommandInput - {@link DeleteInferenceProfileCommandInput}
 * @returns {@link DeleteInferenceProfileCommandOutput}
 * @see {@link DeleteInferenceProfileCommandInput} for command's `input` shape.
 * @see {@link DeleteInferenceProfileCommandOutput} for command's `response` shape.
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
 * @public
 */
export declare class DeleteInferenceProfileCommand extends DeleteInferenceProfileCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeleteInferenceProfileRequest;
            output: {};
        };
        sdk: {
            input: DeleteInferenceProfileCommandInput;
            output: DeleteInferenceProfileCommandOutput;
        };
    };
}
