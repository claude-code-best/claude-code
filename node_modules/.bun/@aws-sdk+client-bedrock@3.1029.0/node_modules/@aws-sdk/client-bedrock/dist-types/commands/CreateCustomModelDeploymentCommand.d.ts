import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { CreateCustomModelDeploymentRequest, CreateCustomModelDeploymentResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link CreateCustomModelDeploymentCommand}.
 */
export interface CreateCustomModelDeploymentCommandInput extends CreateCustomModelDeploymentRequest {
}
/**
 * @public
 *
 * The output of {@link CreateCustomModelDeploymentCommand}.
 */
export interface CreateCustomModelDeploymentCommandOutput extends CreateCustomModelDeploymentResponse, __MetadataBearer {
}
declare const CreateCustomModelDeploymentCommand_base: {
    new (input: CreateCustomModelDeploymentCommandInput): import("@smithy/smithy-client").CommandImpl<CreateCustomModelDeploymentCommandInput, CreateCustomModelDeploymentCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: CreateCustomModelDeploymentCommandInput): import("@smithy/smithy-client").CommandImpl<CreateCustomModelDeploymentCommandInput, CreateCustomModelDeploymentCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deploys a custom model for on-demand inference in Amazon Bedrock. After you deploy your custom model, you use the deployment's Amazon Resource Name (ARN) as the <code>modelId</code> parameter when you submit prompts and generate responses with model inference.</p> <p> For more information about setting up on-demand inference for custom models, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-use.html">Set up inference for a custom model</a>. </p> <p>The following actions are related to the <code>CreateCustomModelDeployment</code> operation:</p> <ul> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_GetCustomModelDeployment.html">GetCustomModelDeployment</a> </p> </li> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListCustomModelDeployments.html">ListCustomModelDeployments</a> </p> </li> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_DeleteCustomModelDeployment.html">DeleteCustomModelDeployment</a> </p> </li> </ul>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, CreateCustomModelDeploymentCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, CreateCustomModelDeploymentCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // CreateCustomModelDeploymentRequest
 *   modelDeploymentName: "STRING_VALUE", // required
 *   modelArn: "STRING_VALUE", // required
 *   description: "STRING_VALUE",
 *   tags: [ // TagList
 *     { // Tag
 *       key: "STRING_VALUE", // required
 *       value: "STRING_VALUE", // required
 *     },
 *   ],
 *   clientRequestToken: "STRING_VALUE",
 * };
 * const command = new CreateCustomModelDeploymentCommand(input);
 * const response = await client.send(command);
 * // { // CreateCustomModelDeploymentResponse
 * //   customModelDeploymentArn: "STRING_VALUE", // required
 * // };
 *
 * ```
 *
 * @param CreateCustomModelDeploymentCommandInput - {@link CreateCustomModelDeploymentCommandInput}
 * @returns {@link CreateCustomModelDeploymentCommandOutput}
 * @see {@link CreateCustomModelDeploymentCommandInput} for command's `input` shape.
 * @see {@link CreateCustomModelDeploymentCommandOutput} for command's `response` shape.
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
 * @throws {@link ServiceQuotaExceededException} (client fault)
 *  <p>The number of requests exceeds the service quota. Resubmit your request later.</p>
 *
 * @throws {@link ThrottlingException} (client fault)
 *  <p>The number of requests exceeds the limit. Resubmit your request later.</p>
 *
 * @throws {@link TooManyTagsException} (client fault)
 *  <p>The request contains more tags than can be associated with a resource (50 tags per resource). The maximum number of tags includes both existing tags and those included in your current request. </p>
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
export declare class CreateCustomModelDeploymentCommand extends CreateCustomModelDeploymentCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: CreateCustomModelDeploymentRequest;
            output: CreateCustomModelDeploymentResponse;
        };
        sdk: {
            input: CreateCustomModelDeploymentCommandInput;
            output: CreateCustomModelDeploymentCommandOutput;
        };
    };
}
