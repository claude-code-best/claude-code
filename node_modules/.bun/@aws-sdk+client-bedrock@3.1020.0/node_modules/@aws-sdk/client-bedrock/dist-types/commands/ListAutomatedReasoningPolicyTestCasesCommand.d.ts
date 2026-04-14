import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListAutomatedReasoningPolicyTestCasesRequest, ListAutomatedReasoningPolicyTestCasesResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListAutomatedReasoningPolicyTestCasesCommand}.
 */
export interface ListAutomatedReasoningPolicyTestCasesCommandInput extends ListAutomatedReasoningPolicyTestCasesRequest {
}
/**
 * @public
 *
 * The output of {@link ListAutomatedReasoningPolicyTestCasesCommand}.
 */
export interface ListAutomatedReasoningPolicyTestCasesCommandOutput extends ListAutomatedReasoningPolicyTestCasesResponse, __MetadataBearer {
}
declare const ListAutomatedReasoningPolicyTestCasesCommand_base: {
    new (input: ListAutomatedReasoningPolicyTestCasesCommandInput): import("@smithy/smithy-client").CommandImpl<ListAutomatedReasoningPolicyTestCasesCommandInput, ListAutomatedReasoningPolicyTestCasesCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: ListAutomatedReasoningPolicyTestCasesCommandInput): import("@smithy/smithy-client").CommandImpl<ListAutomatedReasoningPolicyTestCasesCommandInput, ListAutomatedReasoningPolicyTestCasesCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Lists tests for an Automated Reasoning policy. We recommend using pagination to ensure that the operation returns quickly and successfully.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListAutomatedReasoningPolicyTestCasesCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListAutomatedReasoningPolicyTestCasesCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListAutomatedReasoningPolicyTestCasesRequest
 *   policyArn: "STRING_VALUE", // required
 *   nextToken: "STRING_VALUE",
 *   maxResults: Number("int"),
 * };
 * const command = new ListAutomatedReasoningPolicyTestCasesCommand(input);
 * const response = await client.send(command);
 * // { // ListAutomatedReasoningPolicyTestCasesResponse
 * //   testCases: [ // AutomatedReasoningPolicyTestCaseList // required
 * //     { // AutomatedReasoningPolicyTestCase
 * //       testCaseId: "STRING_VALUE", // required
 * //       guardContent: "STRING_VALUE", // required
 * //       queryContent: "STRING_VALUE",
 * //       expectedAggregatedFindingsResult: "VALID" || "INVALID" || "SATISFIABLE" || "IMPOSSIBLE" || "TRANSLATION_AMBIGUOUS" || "TOO_COMPLEX" || "NO_TRANSLATION",
 * //       createdAt: new Date("TIMESTAMP"), // required
 * //       updatedAt: new Date("TIMESTAMP"), // required
 * //       confidenceThreshold: Number("double"),
 * //     },
 * //   ],
 * //   nextToken: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param ListAutomatedReasoningPolicyTestCasesCommandInput - {@link ListAutomatedReasoningPolicyTestCasesCommandInput}
 * @returns {@link ListAutomatedReasoningPolicyTestCasesCommandOutput}
 * @see {@link ListAutomatedReasoningPolicyTestCasesCommandInput} for command's `input` shape.
 * @see {@link ListAutomatedReasoningPolicyTestCasesCommandOutput} for command's `response` shape.
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
export declare class ListAutomatedReasoningPolicyTestCasesCommand extends ListAutomatedReasoningPolicyTestCasesCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListAutomatedReasoningPolicyTestCasesRequest;
            output: ListAutomatedReasoningPolicyTestCasesResponse;
        };
        sdk: {
            input: ListAutomatedReasoningPolicyTestCasesCommandInput;
            output: ListAutomatedReasoningPolicyTestCasesCommandOutput;
        };
    };
}
