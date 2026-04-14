import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { StopModelCustomizationJobRequest, StopModelCustomizationJobResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link StopModelCustomizationJobCommand}.
 */
export interface StopModelCustomizationJobCommandInput extends StopModelCustomizationJobRequest {
}
/**
 * @public
 *
 * The output of {@link StopModelCustomizationJobCommand}.
 */
export interface StopModelCustomizationJobCommandOutput extends StopModelCustomizationJobResponse, __MetadataBearer {
}
declare const StopModelCustomizationJobCommand_base: {
    new (input: StopModelCustomizationJobCommandInput): import("@smithy/smithy-client").CommandImpl<StopModelCustomizationJobCommandInput, StopModelCustomizationJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: StopModelCustomizationJobCommandInput): import("@smithy/smithy-client").CommandImpl<StopModelCustomizationJobCommandInput, StopModelCustomizationJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Stops an active model customization job. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models.html">Custom models</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, StopModelCustomizationJobCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, StopModelCustomizationJobCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // StopModelCustomizationJobRequest
 *   jobIdentifier: "STRING_VALUE", // required
 * };
 * const command = new StopModelCustomizationJobCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param StopModelCustomizationJobCommandInput - {@link StopModelCustomizationJobCommandInput}
 * @returns {@link StopModelCustomizationJobCommandOutput}
 * @see {@link StopModelCustomizationJobCommandInput} for command's `input` shape.
 * @see {@link StopModelCustomizationJobCommandOutput} for command's `response` shape.
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
export declare class StopModelCustomizationJobCommand extends StopModelCustomizationJobCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: StopModelCustomizationJobRequest;
            output: {};
        };
        sdk: {
            input: StopModelCustomizationJobCommandInput;
            output: StopModelCustomizationJobCommandOutput;
        };
    };
}
