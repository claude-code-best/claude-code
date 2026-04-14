import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetAutomatedReasoningPolicyTestCaseRequest, GetAutomatedReasoningPolicyTestCaseResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetAutomatedReasoningPolicyTestCaseCommand}.
 */
export interface GetAutomatedReasoningPolicyTestCaseCommandInput extends GetAutomatedReasoningPolicyTestCaseRequest {
}
/**
 * @public
 *
 * The output of {@link GetAutomatedReasoningPolicyTestCaseCommand}.
 */
export interface GetAutomatedReasoningPolicyTestCaseCommandOutput extends GetAutomatedReasoningPolicyTestCaseResponse, __MetadataBearer {
}
declare const GetAutomatedReasoningPolicyTestCaseCommand_base: {
    new (input: GetAutomatedReasoningPolicyTestCaseCommandInput): import("@smithy/smithy-client").CommandImpl<GetAutomatedReasoningPolicyTestCaseCommandInput, GetAutomatedReasoningPolicyTestCaseCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetAutomatedReasoningPolicyTestCaseCommandInput): import("@smithy/smithy-client").CommandImpl<GetAutomatedReasoningPolicyTestCaseCommandInput, GetAutomatedReasoningPolicyTestCaseCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Retrieves details about a specific Automated Reasoning policy test.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetAutomatedReasoningPolicyTestCaseCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetAutomatedReasoningPolicyTestCaseCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetAutomatedReasoningPolicyTestCaseRequest
 *   policyArn: "STRING_VALUE", // required
 *   testCaseId: "STRING_VALUE", // required
 * };
 * const command = new GetAutomatedReasoningPolicyTestCaseCommand(input);
 * const response = await client.send(command);
 * // { // GetAutomatedReasoningPolicyTestCaseResponse
 * //   policyArn: "STRING_VALUE", // required
 * //   testCase: { // AutomatedReasoningPolicyTestCase
 * //     testCaseId: "STRING_VALUE", // required
 * //     guardContent: "STRING_VALUE", // required
 * //     queryContent: "STRING_VALUE",
 * //     expectedAggregatedFindingsResult: "VALID" || "INVALID" || "SATISFIABLE" || "IMPOSSIBLE" || "TRANSLATION_AMBIGUOUS" || "TOO_COMPLEX" || "NO_TRANSLATION",
 * //     createdAt: new Date("TIMESTAMP"), // required
 * //     updatedAt: new Date("TIMESTAMP"), // required
 * //     confidenceThreshold: Number("double"),
 * //   },
 * // };
 *
 * ```
 *
 * @param GetAutomatedReasoningPolicyTestCaseCommandInput - {@link GetAutomatedReasoningPolicyTestCaseCommandInput}
 * @returns {@link GetAutomatedReasoningPolicyTestCaseCommandOutput}
 * @see {@link GetAutomatedReasoningPolicyTestCaseCommandInput} for command's `input` shape.
 * @see {@link GetAutomatedReasoningPolicyTestCaseCommandOutput} for command's `response` shape.
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
export declare class GetAutomatedReasoningPolicyTestCaseCommand extends GetAutomatedReasoningPolicyTestCaseCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetAutomatedReasoningPolicyTestCaseRequest;
            output: GetAutomatedReasoningPolicyTestCaseResponse;
        };
        sdk: {
            input: GetAutomatedReasoningPolicyTestCaseCommandInput;
            output: GetAutomatedReasoningPolicyTestCaseCommandOutput;
        };
    };
}
