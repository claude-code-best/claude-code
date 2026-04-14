import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteGuardrailRequest, DeleteGuardrailResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteGuardrailCommand}.
 */
export interface DeleteGuardrailCommandInput extends DeleteGuardrailRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteGuardrailCommand}.
 */
export interface DeleteGuardrailCommandOutput extends DeleteGuardrailResponse, __MetadataBearer {
}
declare const DeleteGuardrailCommand_base: {
    new (input: DeleteGuardrailCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteGuardrailCommandInput, DeleteGuardrailCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteGuardrailCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteGuardrailCommandInput, DeleteGuardrailCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes a guardrail.</p> <ul> <li> <p>To delete a guardrail, only specify the ARN of the guardrail in the <code>guardrailIdentifier</code> field. If you delete a guardrail, all of its versions will be deleted.</p> </li> <li> <p>To delete a version of a guardrail, specify the ARN of the guardrail in the <code>guardrailIdentifier</code> field and the version in the <code>guardrailVersion</code> field.</p> </li> </ul>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteGuardrailCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteGuardrailCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteGuardrailRequest
 *   guardrailIdentifier: "STRING_VALUE", // required
 *   guardrailVersion: "STRING_VALUE",
 * };
 * const command = new DeleteGuardrailCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteGuardrailCommandInput - {@link DeleteGuardrailCommandInput}
 * @returns {@link DeleteGuardrailCommandOutput}
 * @see {@link DeleteGuardrailCommandInput} for command's `input` shape.
 * @see {@link DeleteGuardrailCommandOutput} for command's `response` shape.
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
export declare class DeleteGuardrailCommand extends DeleteGuardrailCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeleteGuardrailRequest;
            output: {};
        };
        sdk: {
            input: DeleteGuardrailCommandInput;
            output: DeleteGuardrailCommandOutput;
        };
    };
}
