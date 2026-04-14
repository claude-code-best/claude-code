import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteCustomModelDeploymentRequest, DeleteCustomModelDeploymentResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteCustomModelDeploymentCommand}.
 */
export interface DeleteCustomModelDeploymentCommandInput extends DeleteCustomModelDeploymentRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteCustomModelDeploymentCommand}.
 */
export interface DeleteCustomModelDeploymentCommandOutput extends DeleteCustomModelDeploymentResponse, __MetadataBearer {
}
declare const DeleteCustomModelDeploymentCommand_base: {
    new (input: DeleteCustomModelDeploymentCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteCustomModelDeploymentCommandInput, DeleteCustomModelDeploymentCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteCustomModelDeploymentCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteCustomModelDeploymentCommandInput, DeleteCustomModelDeploymentCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes a custom model deployment. This operation stops the deployment and removes it from your account. After deletion, the deployment ARN can no longer be used for inference requests.</p> <p>The following actions are related to the <code>DeleteCustomModelDeployment</code> operation:</p> <ul> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateCustomModelDeployment.html">CreateCustomModelDeployment</a> </p> </li> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_GetCustomModelDeployment.html">GetCustomModelDeployment</a> </p> </li> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListCustomModelDeployments.html">ListCustomModelDeployments</a> </p> </li> </ul>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteCustomModelDeploymentCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteCustomModelDeploymentCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteCustomModelDeploymentRequest
 *   customModelDeploymentIdentifier: "STRING_VALUE", // required
 * };
 * const command = new DeleteCustomModelDeploymentCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteCustomModelDeploymentCommandInput - {@link DeleteCustomModelDeploymentCommandInput}
 * @returns {@link DeleteCustomModelDeploymentCommandOutput}
 * @see {@link DeleteCustomModelDeploymentCommandInput} for command's `input` shape.
 * @see {@link DeleteCustomModelDeploymentCommandOutput} for command's `response` shape.
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
export declare class DeleteCustomModelDeploymentCommand extends DeleteCustomModelDeploymentCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeleteCustomModelDeploymentRequest;
            output: {};
        };
        sdk: {
            input: DeleteCustomModelDeploymentCommandInput;
            output: DeleteCustomModelDeploymentCommandOutput;
        };
    };
}
