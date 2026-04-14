import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteAutomatedReasoningPolicyBuildWorkflowRequest, DeleteAutomatedReasoningPolicyBuildWorkflowResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteAutomatedReasoningPolicyBuildWorkflowCommand}.
 */
export interface DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput extends DeleteAutomatedReasoningPolicyBuildWorkflowRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteAutomatedReasoningPolicyBuildWorkflowCommand}.
 */
export interface DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput extends DeleteAutomatedReasoningPolicyBuildWorkflowResponse, __MetadataBearer {
}
declare const DeleteAutomatedReasoningPolicyBuildWorkflowCommand_base: {
    new (input: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput, DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput, DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes an Automated Reasoning policy build workflow and its associated artifacts. This permanently removes the workflow history and any generated assets.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteAutomatedReasoningPolicyBuildWorkflowCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteAutomatedReasoningPolicyBuildWorkflowCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteAutomatedReasoningPolicyBuildWorkflowRequest
 *   policyArn: "STRING_VALUE", // required
 *   buildWorkflowId: "STRING_VALUE", // required
 *   lastUpdatedAt: new Date("TIMESTAMP"), // required
 * };
 * const command = new DeleteAutomatedReasoningPolicyBuildWorkflowCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput - {@link DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput}
 * @returns {@link DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput}
 * @see {@link DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput} for command's `input` shape.
 * @see {@link DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput} for command's `response` shape.
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
 * @throws {@link ResourceInUseException} (client fault)
 *  <p>Thrown when attempting to delete or modify a resource that is currently being used by other resources or operations. For example, trying to delete an Automated Reasoning policy that is referenced by an active guardrail.</p>
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
export declare class DeleteAutomatedReasoningPolicyBuildWorkflowCommand extends DeleteAutomatedReasoningPolicyBuildWorkflowCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeleteAutomatedReasoningPolicyBuildWorkflowRequest;
            output: {};
        };
        sdk: {
            input: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput;
            output: DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput;
        };
    };
}
