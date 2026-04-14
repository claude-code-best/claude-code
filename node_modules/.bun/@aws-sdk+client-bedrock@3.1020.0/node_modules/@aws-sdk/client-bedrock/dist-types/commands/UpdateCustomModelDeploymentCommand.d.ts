import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { UpdateCustomModelDeploymentRequest, UpdateCustomModelDeploymentResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link UpdateCustomModelDeploymentCommand}.
 */
export interface UpdateCustomModelDeploymentCommandInput extends UpdateCustomModelDeploymentRequest {
}
/**
 * @public
 *
 * The output of {@link UpdateCustomModelDeploymentCommand}.
 */
export interface UpdateCustomModelDeploymentCommandOutput extends UpdateCustomModelDeploymentResponse, __MetadataBearer {
}
declare const UpdateCustomModelDeploymentCommand_base: {
    new (input: UpdateCustomModelDeploymentCommandInput): import("@smithy/smithy-client").CommandImpl<UpdateCustomModelDeploymentCommandInput, UpdateCustomModelDeploymentCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: UpdateCustomModelDeploymentCommandInput): import("@smithy/smithy-client").CommandImpl<UpdateCustomModelDeploymentCommandInput, UpdateCustomModelDeploymentCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p> Updates a custom model deployment with a new custom model. This allows you to deploy updated models without creating new deployment endpoints. </p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, UpdateCustomModelDeploymentCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, UpdateCustomModelDeploymentCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // UpdateCustomModelDeploymentRequest
 *   modelArn: "STRING_VALUE", // required
 *   customModelDeploymentIdentifier: "STRING_VALUE", // required
 * };
 * const command = new UpdateCustomModelDeploymentCommand(input);
 * const response = await client.send(command);
 * // { // UpdateCustomModelDeploymentResponse
 * //   customModelDeploymentArn: "STRING_VALUE", // required
 * // };
 *
 * ```
 *
 * @param UpdateCustomModelDeploymentCommandInput - {@link UpdateCustomModelDeploymentCommandInput}
 * @returns {@link UpdateCustomModelDeploymentCommandOutput}
 * @see {@link UpdateCustomModelDeploymentCommandInput} for command's `input` shape.
 * @see {@link UpdateCustomModelDeploymentCommandOutput} for command's `response` shape.
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
export declare class UpdateCustomModelDeploymentCommand extends UpdateCustomModelDeploymentCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: UpdateCustomModelDeploymentRequest;
            output: UpdateCustomModelDeploymentResponse;
        };
        sdk: {
            input: UpdateCustomModelDeploymentCommandInput;
            output: UpdateCustomModelDeploymentCommandOutput;
        };
    };
}
