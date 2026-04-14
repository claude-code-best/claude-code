import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListAutomatedReasoningPolicyBuildWorkflowsRequest, ListAutomatedReasoningPolicyBuildWorkflowsResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListAutomatedReasoningPolicyBuildWorkflowsCommand}.
 */
export interface ListAutomatedReasoningPolicyBuildWorkflowsCommandInput extends ListAutomatedReasoningPolicyBuildWorkflowsRequest {
}
/**
 * @public
 *
 * The output of {@link ListAutomatedReasoningPolicyBuildWorkflowsCommand}.
 */
export interface ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput extends ListAutomatedReasoningPolicyBuildWorkflowsResponse, __MetadataBearer {
}
declare const ListAutomatedReasoningPolicyBuildWorkflowsCommand_base: {
    new (input: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput): import("@smithy/smithy-client").CommandImpl<ListAutomatedReasoningPolicyBuildWorkflowsCommandInput, ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput): import("@smithy/smithy-client").CommandImpl<ListAutomatedReasoningPolicyBuildWorkflowsCommandInput, ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Lists all build workflows for an Automated Reasoning policy, showing the history of policy creation and modification attempts.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListAutomatedReasoningPolicyBuildWorkflowsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListAutomatedReasoningPolicyBuildWorkflowsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListAutomatedReasoningPolicyBuildWorkflowsRequest
 *   policyArn: "STRING_VALUE", // required
 *   nextToken: "STRING_VALUE",
 *   maxResults: Number("int"),
 * };
 * const command = new ListAutomatedReasoningPolicyBuildWorkflowsCommand(input);
 * const response = await client.send(command);
 * // { // ListAutomatedReasoningPolicyBuildWorkflowsResponse
 * //   automatedReasoningPolicyBuildWorkflowSummaries: [ // AutomatedReasoningPolicyBuildWorkflowSummaries // required
 * //     { // AutomatedReasoningPolicyBuildWorkflowSummary
 * //       policyArn: "STRING_VALUE", // required
 * //       buildWorkflowId: "STRING_VALUE", // required
 * //       status: "SCHEDULED" || "CANCEL_REQUESTED" || "PREPROCESSING" || "BUILDING" || "TESTING" || "COMPLETED" || "FAILED" || "CANCELLED", // required
 * //       buildWorkflowType: "INGEST_CONTENT" || "REFINE_POLICY" || "IMPORT_POLICY" || "GENERATE_FIDELITY_REPORT" || "GENERATE_POLICY_SCENARIOS", // required
 * //       createdAt: new Date("TIMESTAMP"), // required
 * //       updatedAt: new Date("TIMESTAMP"), // required
 * //     },
 * //   ],
 * //   nextToken: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param ListAutomatedReasoningPolicyBuildWorkflowsCommandInput - {@link ListAutomatedReasoningPolicyBuildWorkflowsCommandInput}
 * @returns {@link ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput}
 * @see {@link ListAutomatedReasoningPolicyBuildWorkflowsCommandInput} for command's `input` shape.
 * @see {@link ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput} for command's `response` shape.
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
export declare class ListAutomatedReasoningPolicyBuildWorkflowsCommand extends ListAutomatedReasoningPolicyBuildWorkflowsCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListAutomatedReasoningPolicyBuildWorkflowsRequest;
            output: ListAutomatedReasoningPolicyBuildWorkflowsResponse;
        };
        sdk: {
            input: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput;
            output: ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput;
        };
    };
}
