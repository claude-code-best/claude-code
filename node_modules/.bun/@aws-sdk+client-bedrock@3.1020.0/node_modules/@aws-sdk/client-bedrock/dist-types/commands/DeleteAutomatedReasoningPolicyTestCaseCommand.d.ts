import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteAutomatedReasoningPolicyTestCaseRequest, DeleteAutomatedReasoningPolicyTestCaseResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteAutomatedReasoningPolicyTestCaseCommand}.
 */
export interface DeleteAutomatedReasoningPolicyTestCaseCommandInput extends DeleteAutomatedReasoningPolicyTestCaseRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteAutomatedReasoningPolicyTestCaseCommand}.
 */
export interface DeleteAutomatedReasoningPolicyTestCaseCommandOutput extends DeleteAutomatedReasoningPolicyTestCaseResponse, __MetadataBearer {
}
declare const DeleteAutomatedReasoningPolicyTestCaseCommand_base: {
    new (input: DeleteAutomatedReasoningPolicyTestCaseCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteAutomatedReasoningPolicyTestCaseCommandInput, DeleteAutomatedReasoningPolicyTestCaseCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteAutomatedReasoningPolicyTestCaseCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteAutomatedReasoningPolicyTestCaseCommandInput, DeleteAutomatedReasoningPolicyTestCaseCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes an Automated Reasoning policy test. This operation is idempotent; if you delete a test more than once, each call succeeds.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteAutomatedReasoningPolicyTestCaseCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteAutomatedReasoningPolicyTestCaseCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteAutomatedReasoningPolicyTestCaseRequest
 *   policyArn: "STRING_VALUE", // required
 *   testCaseId: "STRING_VALUE", // required
 *   lastUpdatedAt: new Date("TIMESTAMP"), // required
 * };
 * const command = new DeleteAutomatedReasoningPolicyTestCaseCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteAutomatedReasoningPolicyTestCaseCommandInput - {@link DeleteAutomatedReasoningPolicyTestCaseCommandInput}
 * @returns {@link DeleteAutomatedReasoningPolicyTestCaseCommandOutput}
 * @see {@link DeleteAutomatedReasoningPolicyTestCaseCommandInput} for command's `input` shape.
 * @see {@link DeleteAutomatedReasoningPolicyTestCaseCommandOutput} for command's `response` shape.
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
export declare class DeleteAutomatedReasoningPolicyTestCaseCommand extends DeleteAutomatedReasoningPolicyTestCaseCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeleteAutomatedReasoningPolicyTestCaseRequest;
            output: {};
        };
        sdk: {
            input: DeleteAutomatedReasoningPolicyTestCaseCommandInput;
            output: DeleteAutomatedReasoningPolicyTestCaseCommandOutput;
        };
    };
}
