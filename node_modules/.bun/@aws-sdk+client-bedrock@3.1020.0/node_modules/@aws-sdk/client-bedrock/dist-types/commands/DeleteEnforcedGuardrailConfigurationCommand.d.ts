import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteEnforcedGuardrailConfigurationRequest, DeleteEnforcedGuardrailConfigurationResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteEnforcedGuardrailConfigurationCommand}.
 */
export interface DeleteEnforcedGuardrailConfigurationCommandInput extends DeleteEnforcedGuardrailConfigurationRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteEnforcedGuardrailConfigurationCommand}.
 */
export interface DeleteEnforcedGuardrailConfigurationCommandOutput extends DeleteEnforcedGuardrailConfigurationResponse, __MetadataBearer {
}
declare const DeleteEnforcedGuardrailConfigurationCommand_base: {
    new (input: DeleteEnforcedGuardrailConfigurationCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteEnforcedGuardrailConfigurationCommandInput, DeleteEnforcedGuardrailConfigurationCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteEnforcedGuardrailConfigurationCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteEnforcedGuardrailConfigurationCommandInput, DeleteEnforcedGuardrailConfigurationCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes the account-level enforced guardrail configuration.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteEnforcedGuardrailConfigurationCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteEnforcedGuardrailConfigurationCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteEnforcedGuardrailConfigurationRequest
 *   configId: "STRING_VALUE", // required
 * };
 * const command = new DeleteEnforcedGuardrailConfigurationCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteEnforcedGuardrailConfigurationCommandInput - {@link DeleteEnforcedGuardrailConfigurationCommandInput}
 * @returns {@link DeleteEnforcedGuardrailConfigurationCommandOutput}
 * @see {@link DeleteEnforcedGuardrailConfigurationCommandInput} for command's `input` shape.
 * @see {@link DeleteEnforcedGuardrailConfigurationCommandOutput} for command's `response` shape.
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
export declare class DeleteEnforcedGuardrailConfigurationCommand extends DeleteEnforcedGuardrailConfigurationCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeleteEnforcedGuardrailConfigurationRequest;
            output: {};
        };
        sdk: {
            input: DeleteEnforcedGuardrailConfigurationCommandInput;
            output: DeleteEnforcedGuardrailConfigurationCommandOutput;
        };
    };
}
