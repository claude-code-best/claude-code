import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetAutomatedReasoningPolicyNextScenarioRequest, GetAutomatedReasoningPolicyNextScenarioResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetAutomatedReasoningPolicyNextScenarioCommand}.
 */
export interface GetAutomatedReasoningPolicyNextScenarioCommandInput extends GetAutomatedReasoningPolicyNextScenarioRequest {
}
/**
 * @public
 *
 * The output of {@link GetAutomatedReasoningPolicyNextScenarioCommand}.
 */
export interface GetAutomatedReasoningPolicyNextScenarioCommandOutput extends GetAutomatedReasoningPolicyNextScenarioResponse, __MetadataBearer {
}
declare const GetAutomatedReasoningPolicyNextScenarioCommand_base: {
    new (input: GetAutomatedReasoningPolicyNextScenarioCommandInput): import("@smithy/smithy-client").CommandImpl<GetAutomatedReasoningPolicyNextScenarioCommandInput, GetAutomatedReasoningPolicyNextScenarioCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetAutomatedReasoningPolicyNextScenarioCommandInput): import("@smithy/smithy-client").CommandImpl<GetAutomatedReasoningPolicyNextScenarioCommandInput, GetAutomatedReasoningPolicyNextScenarioCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Retrieves the next test scenario for validating an Automated Reasoning policy. This is used during the interactive policy refinement process to test policy behavior.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetAutomatedReasoningPolicyNextScenarioCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetAutomatedReasoningPolicyNextScenarioCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetAutomatedReasoningPolicyNextScenarioRequest
 *   policyArn: "STRING_VALUE", // required
 *   buildWorkflowId: "STRING_VALUE", // required
 * };
 * const command = new GetAutomatedReasoningPolicyNextScenarioCommand(input);
 * const response = await client.send(command);
 * // { // GetAutomatedReasoningPolicyNextScenarioResponse
 * //   policyArn: "STRING_VALUE", // required
 * //   scenario: { // AutomatedReasoningPolicyScenario
 * //     expression: "STRING_VALUE", // required
 * //     alternateExpression: "STRING_VALUE", // required
 * //     expectedResult: "VALID" || "INVALID" || "SATISFIABLE" || "IMPOSSIBLE" || "TRANSLATION_AMBIGUOUS" || "TOO_COMPLEX" || "NO_TRANSLATION", // required
 * //     ruleIds: [ // AutomatedReasoningPolicyDefinitionRuleIdList // required
 * //       "STRING_VALUE",
 * //     ],
 * //   },
 * // };
 *
 * ```
 *
 * @param GetAutomatedReasoningPolicyNextScenarioCommandInput - {@link GetAutomatedReasoningPolicyNextScenarioCommandInput}
 * @returns {@link GetAutomatedReasoningPolicyNextScenarioCommandOutput}
 * @see {@link GetAutomatedReasoningPolicyNextScenarioCommandInput} for command's `input` shape.
 * @see {@link GetAutomatedReasoningPolicyNextScenarioCommandOutput} for command's `response` shape.
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
export declare class GetAutomatedReasoningPolicyNextScenarioCommand extends GetAutomatedReasoningPolicyNextScenarioCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetAutomatedReasoningPolicyNextScenarioRequest;
            output: GetAutomatedReasoningPolicyNextScenarioResponse;
        };
        sdk: {
            input: GetAutomatedReasoningPolicyNextScenarioCommandInput;
            output: GetAutomatedReasoningPolicyNextScenarioCommandOutput;
        };
    };
}
