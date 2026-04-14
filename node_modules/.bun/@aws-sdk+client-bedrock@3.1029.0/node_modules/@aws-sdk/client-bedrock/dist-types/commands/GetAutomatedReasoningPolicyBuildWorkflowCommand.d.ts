import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetAutomatedReasoningPolicyBuildWorkflowRequest, GetAutomatedReasoningPolicyBuildWorkflowResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetAutomatedReasoningPolicyBuildWorkflowCommand}.
 */
export interface GetAutomatedReasoningPolicyBuildWorkflowCommandInput extends GetAutomatedReasoningPolicyBuildWorkflowRequest {
}
/**
 * @public
 *
 * The output of {@link GetAutomatedReasoningPolicyBuildWorkflowCommand}.
 */
export interface GetAutomatedReasoningPolicyBuildWorkflowCommandOutput extends GetAutomatedReasoningPolicyBuildWorkflowResponse, __MetadataBearer {
}
declare const GetAutomatedReasoningPolicyBuildWorkflowCommand_base: {
    new (input: GetAutomatedReasoningPolicyBuildWorkflowCommandInput): import("@smithy/smithy-client").CommandImpl<GetAutomatedReasoningPolicyBuildWorkflowCommandInput, GetAutomatedReasoningPolicyBuildWorkflowCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetAutomatedReasoningPolicyBuildWorkflowCommandInput): import("@smithy/smithy-client").CommandImpl<GetAutomatedReasoningPolicyBuildWorkflowCommandInput, GetAutomatedReasoningPolicyBuildWorkflowCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Retrieves detailed information about an Automated Reasoning policy build workflow, including its status, configuration, and metadata.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetAutomatedReasoningPolicyBuildWorkflowCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetAutomatedReasoningPolicyBuildWorkflowCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetAutomatedReasoningPolicyBuildWorkflowRequest
 *   policyArn: "STRING_VALUE", // required
 *   buildWorkflowId: "STRING_VALUE", // required
 * };
 * const command = new GetAutomatedReasoningPolicyBuildWorkflowCommand(input);
 * const response = await client.send(command);
 * // { // GetAutomatedReasoningPolicyBuildWorkflowResponse
 * //   policyArn: "STRING_VALUE", // required
 * //   buildWorkflowId: "STRING_VALUE", // required
 * //   status: "SCHEDULED" || "CANCEL_REQUESTED" || "PREPROCESSING" || "BUILDING" || "TESTING" || "COMPLETED" || "FAILED" || "CANCELLED", // required
 * //   buildWorkflowType: "INGEST_CONTENT" || "REFINE_POLICY" || "IMPORT_POLICY" || "GENERATE_FIDELITY_REPORT" || "GENERATE_POLICY_SCENARIOS", // required
 * //   documentName: "STRING_VALUE",
 * //   documentContentType: "pdf" || "txt",
 * //   documentDescription: "STRING_VALUE",
 * //   createdAt: new Date("TIMESTAMP"), // required
 * //   updatedAt: new Date("TIMESTAMP"), // required
 * // };
 *
 * ```
 *
 * @param GetAutomatedReasoningPolicyBuildWorkflowCommandInput - {@link GetAutomatedReasoningPolicyBuildWorkflowCommandInput}
 * @returns {@link GetAutomatedReasoningPolicyBuildWorkflowCommandOutput}
 * @see {@link GetAutomatedReasoningPolicyBuildWorkflowCommandInput} for command's `input` shape.
 * @see {@link GetAutomatedReasoningPolicyBuildWorkflowCommandOutput} for command's `response` shape.
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
export declare class GetAutomatedReasoningPolicyBuildWorkflowCommand extends GetAutomatedReasoningPolicyBuildWorkflowCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetAutomatedReasoningPolicyBuildWorkflowRequest;
            output: GetAutomatedReasoningPolicyBuildWorkflowResponse;
        };
        sdk: {
            input: GetAutomatedReasoningPolicyBuildWorkflowCommandInput;
            output: GetAutomatedReasoningPolicyBuildWorkflowCommandOutput;
        };
    };
}
