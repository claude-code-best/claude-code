import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetCustomModelDeploymentRequest, GetCustomModelDeploymentResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetCustomModelDeploymentCommand}.
 */
export interface GetCustomModelDeploymentCommandInput extends GetCustomModelDeploymentRequest {
}
/**
 * @public
 *
 * The output of {@link GetCustomModelDeploymentCommand}.
 */
export interface GetCustomModelDeploymentCommandOutput extends GetCustomModelDeploymentResponse, __MetadataBearer {
}
declare const GetCustomModelDeploymentCommand_base: {
    new (input: GetCustomModelDeploymentCommandInput): import("@smithy/smithy-client").CommandImpl<GetCustomModelDeploymentCommandInput, GetCustomModelDeploymentCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetCustomModelDeploymentCommandInput): import("@smithy/smithy-client").CommandImpl<GetCustomModelDeploymentCommandInput, GetCustomModelDeploymentCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Retrieves information about a custom model deployment, including its status, configuration, and metadata. Use this operation to monitor the deployment status and retrieve details needed for inference requests.</p> <p>The following actions are related to the <code>GetCustomModelDeployment</code> operation:</p> <ul> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateCustomModelDeployment.html">CreateCustomModelDeployment</a> </p> </li> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListCustomModelDeployments.html">ListCustomModelDeployments</a> </p> </li> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_DeleteCustomModelDeployment.html">DeleteCustomModelDeployment</a> </p> </li> </ul>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetCustomModelDeploymentCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetCustomModelDeploymentCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetCustomModelDeploymentRequest
 *   customModelDeploymentIdentifier: "STRING_VALUE", // required
 * };
 * const command = new GetCustomModelDeploymentCommand(input);
 * const response = await client.send(command);
 * // { // GetCustomModelDeploymentResponse
 * //   customModelDeploymentArn: "STRING_VALUE", // required
 * //   modelDeploymentName: "STRING_VALUE", // required
 * //   modelArn: "STRING_VALUE", // required
 * //   createdAt: new Date("TIMESTAMP"), // required
 * //   status: "Creating" || "Active" || "Failed", // required
 * //   description: "STRING_VALUE",
 * //   updateDetails: { // CustomModelDeploymentUpdateDetails
 * //     modelArn: "STRING_VALUE", // required
 * //     updateStatus: "Updating" || "UpdateCompleted" || "UpdateFailed", // required
 * //   },
 * //   failureMessage: "STRING_VALUE",
 * //   lastUpdatedAt: new Date("TIMESTAMP"),
 * // };
 *
 * ```
 *
 * @param GetCustomModelDeploymentCommandInput - {@link GetCustomModelDeploymentCommandInput}
 * @returns {@link GetCustomModelDeploymentCommandOutput}
 * @see {@link GetCustomModelDeploymentCommandInput} for command's `input` shape.
 * @see {@link GetCustomModelDeploymentCommandOutput} for command's `response` shape.
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
export declare class GetCustomModelDeploymentCommand extends GetCustomModelDeploymentCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetCustomModelDeploymentRequest;
            output: GetCustomModelDeploymentResponse;
        };
        sdk: {
            input: GetCustomModelDeploymentCommandInput;
            output: GetCustomModelDeploymentCommandOutput;
        };
    };
}
