import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { CancelAutomatedReasoningPolicyBuildWorkflowRequest, CancelAutomatedReasoningPolicyBuildWorkflowResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link CancelAutomatedReasoningPolicyBuildWorkflowCommand}.
 */
export interface CancelAutomatedReasoningPolicyBuildWorkflowCommandInput extends CancelAutomatedReasoningPolicyBuildWorkflowRequest {
}
/**
 * @public
 *
 * The output of {@link CancelAutomatedReasoningPolicyBuildWorkflowCommand}.
 */
export interface CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput extends CancelAutomatedReasoningPolicyBuildWorkflowResponse, __MetadataBearer {
}
declare const CancelAutomatedReasoningPolicyBuildWorkflowCommand_base: {
    new (input: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput): import("@smithy/smithy-client").CommandImpl<CancelAutomatedReasoningPolicyBuildWorkflowCommandInput, CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput): import("@smithy/smithy-client").CommandImpl<CancelAutomatedReasoningPolicyBuildWorkflowCommandInput, CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Cancels a running Automated Reasoning policy build workflow. This stops the policy generation process and prevents further processing of the source documents.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, CancelAutomatedReasoningPolicyBuildWorkflowCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, CancelAutomatedReasoningPolicyBuildWorkflowCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // CancelAutomatedReasoningPolicyBuildWorkflowRequest
 *   policyArn: "STRING_VALUE", // required
 *   buildWorkflowId: "STRING_VALUE", // required
 * };
 * const command = new CancelAutomatedReasoningPolicyBuildWorkflowCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param CancelAutomatedReasoningPolicyBuildWorkflowCommandInput - {@link CancelAutomatedReasoningPolicyBuildWorkflowCommandInput}
 * @returns {@link CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput}
 * @see {@link CancelAutomatedReasoningPolicyBuildWorkflowCommandInput} for command's `input` shape.
 * @see {@link CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput} for command's `response` shape.
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
export declare class CancelAutomatedReasoningPolicyBuildWorkflowCommand extends CancelAutomatedReasoningPolicyBuildWorkflowCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: CancelAutomatedReasoningPolicyBuildWorkflowRequest;
            output: {};
        };
        sdk: {
            input: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput;
            output: CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput;
        };
    };
}
