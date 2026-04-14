import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteAutomatedReasoningPolicyRequest, DeleteAutomatedReasoningPolicyResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteAutomatedReasoningPolicyCommand}.
 */
export interface DeleteAutomatedReasoningPolicyCommandInput extends DeleteAutomatedReasoningPolicyRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteAutomatedReasoningPolicyCommand}.
 */
export interface DeleteAutomatedReasoningPolicyCommandOutput extends DeleteAutomatedReasoningPolicyResponse, __MetadataBearer {
}
declare const DeleteAutomatedReasoningPolicyCommand_base: {
    new (input: DeleteAutomatedReasoningPolicyCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteAutomatedReasoningPolicyCommandInput, DeleteAutomatedReasoningPolicyCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteAutomatedReasoningPolicyCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteAutomatedReasoningPolicyCommandInput, DeleteAutomatedReasoningPolicyCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes an Automated Reasoning policy or policy version. This operation is idempotent. If you delete a policy more than once, each call succeeds. Deleting a policy removes it permanently and cannot be undone.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteAutomatedReasoningPolicyCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteAutomatedReasoningPolicyCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteAutomatedReasoningPolicyRequest
 *   policyArn: "STRING_VALUE", // required
 *   force: true || false,
 * };
 * const command = new DeleteAutomatedReasoningPolicyCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteAutomatedReasoningPolicyCommandInput - {@link DeleteAutomatedReasoningPolicyCommandInput}
 * @returns {@link DeleteAutomatedReasoningPolicyCommandOutput}
 * @see {@link DeleteAutomatedReasoningPolicyCommandInput} for command's `input` shape.
 * @see {@link DeleteAutomatedReasoningPolicyCommandOutput} for command's `response` shape.
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
export declare class DeleteAutomatedReasoningPolicyCommand extends DeleteAutomatedReasoningPolicyCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeleteAutomatedReasoningPolicyRequest;
            output: {};
        };
        sdk: {
            input: DeleteAutomatedReasoningPolicyCommandInput;
            output: DeleteAutomatedReasoningPolicyCommandOutput;
        };
    };
}
