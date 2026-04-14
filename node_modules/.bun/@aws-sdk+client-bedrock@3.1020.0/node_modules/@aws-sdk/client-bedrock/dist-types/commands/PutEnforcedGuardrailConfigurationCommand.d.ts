import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { PutEnforcedGuardrailConfigurationRequest, PutEnforcedGuardrailConfigurationResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link PutEnforcedGuardrailConfigurationCommand}.
 */
export interface PutEnforcedGuardrailConfigurationCommandInput extends PutEnforcedGuardrailConfigurationRequest {
}
/**
 * @public
 *
 * The output of {@link PutEnforcedGuardrailConfigurationCommand}.
 */
export interface PutEnforcedGuardrailConfigurationCommandOutput extends PutEnforcedGuardrailConfigurationResponse, __MetadataBearer {
}
declare const PutEnforcedGuardrailConfigurationCommand_base: {
    new (input: PutEnforcedGuardrailConfigurationCommandInput): import("@smithy/smithy-client").CommandImpl<PutEnforcedGuardrailConfigurationCommandInput, PutEnforcedGuardrailConfigurationCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: PutEnforcedGuardrailConfigurationCommandInput): import("@smithy/smithy-client").CommandImpl<PutEnforcedGuardrailConfigurationCommandInput, PutEnforcedGuardrailConfigurationCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Sets the account-level enforced guardrail configuration.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, PutEnforcedGuardrailConfigurationCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, PutEnforcedGuardrailConfigurationCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // PutEnforcedGuardrailConfigurationRequest
 *   configId: "STRING_VALUE",
 *   guardrailInferenceConfig: { // AccountEnforcedGuardrailInferenceInputConfiguration
 *     guardrailIdentifier: "STRING_VALUE", // required
 *     guardrailVersion: "STRING_VALUE", // required
 *     inputTags: "HONOR" || "IGNORE", // required
 *     modelEnforcement: { // ModelEnforcement
 *       includedModels: [ // IncludedModelsList // required
 *         "STRING_VALUE",
 *       ],
 *       excludedModels: [ // ExcludedModelsList // required
 *         "STRING_VALUE",
 *       ],
 *     },
 *   },
 * };
 * const command = new PutEnforcedGuardrailConfigurationCommand(input);
 * const response = await client.send(command);
 * // { // PutEnforcedGuardrailConfigurationResponse
 * //   configId: "STRING_VALUE",
 * //   updatedAt: new Date("TIMESTAMP"),
 * //   updatedBy: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param PutEnforcedGuardrailConfigurationCommandInput - {@link PutEnforcedGuardrailConfigurationCommandInput}
 * @returns {@link PutEnforcedGuardrailConfigurationCommandOutput}
 * @see {@link PutEnforcedGuardrailConfigurationCommandInput} for command's `input` shape.
 * @see {@link PutEnforcedGuardrailConfigurationCommandOutput} for command's `response` shape.
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
export declare class PutEnforcedGuardrailConfigurationCommand extends PutEnforcedGuardrailConfigurationCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: PutEnforcedGuardrailConfigurationRequest;
            output: PutEnforcedGuardrailConfigurationResponse;
        };
        sdk: {
            input: PutEnforcedGuardrailConfigurationCommandInput;
            output: PutEnforcedGuardrailConfigurationCommandOutput;
        };
    };
}
