import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { UpdateAutomatedReasoningPolicyAnnotationsRequest, UpdateAutomatedReasoningPolicyAnnotationsResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link UpdateAutomatedReasoningPolicyAnnotationsCommand}.
 */
export interface UpdateAutomatedReasoningPolicyAnnotationsCommandInput extends UpdateAutomatedReasoningPolicyAnnotationsRequest {
}
/**
 * @public
 *
 * The output of {@link UpdateAutomatedReasoningPolicyAnnotationsCommand}.
 */
export interface UpdateAutomatedReasoningPolicyAnnotationsCommandOutput extends UpdateAutomatedReasoningPolicyAnnotationsResponse, __MetadataBearer {
}
declare const UpdateAutomatedReasoningPolicyAnnotationsCommand_base: {
    new (input: UpdateAutomatedReasoningPolicyAnnotationsCommandInput): import("@smithy/smithy-client").CommandImpl<UpdateAutomatedReasoningPolicyAnnotationsCommandInput, UpdateAutomatedReasoningPolicyAnnotationsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: UpdateAutomatedReasoningPolicyAnnotationsCommandInput): import("@smithy/smithy-client").CommandImpl<UpdateAutomatedReasoningPolicyAnnotationsCommandInput, UpdateAutomatedReasoningPolicyAnnotationsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Updates the annotations for an Automated Reasoning policy build workflow. This allows you to modify extracted rules, variables, and types before finalizing the policy.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, UpdateAutomatedReasoningPolicyAnnotationsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, UpdateAutomatedReasoningPolicyAnnotationsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // UpdateAutomatedReasoningPolicyAnnotationsRequest
 *   policyArn: "STRING_VALUE", // required
 *   buildWorkflowId: "STRING_VALUE", // required
 *   annotations: [ // AutomatedReasoningPolicyAnnotationList // required
 *     { // AutomatedReasoningPolicyAnnotation Union: only one key present
 *       addType: { // AutomatedReasoningPolicyAddTypeAnnotation
 *         name: "STRING_VALUE", // required
 *         description: "STRING_VALUE", // required
 *         values: [ // AutomatedReasoningPolicyDefinitionTypeValueList // required
 *           { // AutomatedReasoningPolicyDefinitionTypeValue
 *             value: "STRING_VALUE", // required
 *             description: "STRING_VALUE",
 *           },
 *         ],
 *       },
 *       updateType: { // AutomatedReasoningPolicyUpdateTypeAnnotation
 *         name: "STRING_VALUE", // required
 *         newName: "STRING_VALUE",
 *         description: "STRING_VALUE",
 *         values: [ // AutomatedReasoningPolicyTypeValueAnnotationList // required
 *           { // AutomatedReasoningPolicyTypeValueAnnotation Union: only one key present
 *             addTypeValue: { // AutomatedReasoningPolicyAddTypeValue
 *               value: "STRING_VALUE", // required
 *               description: "STRING_VALUE",
 *             },
 *             updateTypeValue: { // AutomatedReasoningPolicyUpdateTypeValue
 *               value: "STRING_VALUE", // required
 *               newValue: "STRING_VALUE",
 *               description: "STRING_VALUE",
 *             },
 *             deleteTypeValue: { // AutomatedReasoningPolicyDeleteTypeValue
 *               value: "STRING_VALUE", // required
 *             },
 *           },
 *         ],
 *       },
 *       deleteType: { // AutomatedReasoningPolicyDeleteTypeAnnotation
 *         name: "STRING_VALUE", // required
 *       },
 *       addVariable: { // AutomatedReasoningPolicyAddVariableAnnotation
 *         name: "STRING_VALUE", // required
 *         type: "STRING_VALUE", // required
 *         description: "STRING_VALUE", // required
 *       },
 *       updateVariable: { // AutomatedReasoningPolicyUpdateVariableAnnotation
 *         name: "STRING_VALUE", // required
 *         newName: "STRING_VALUE",
 *         description: "STRING_VALUE",
 *       },
 *       deleteVariable: { // AutomatedReasoningPolicyDeleteVariableAnnotation
 *         name: "STRING_VALUE", // required
 *       },
 *       addRule: { // AutomatedReasoningPolicyAddRuleAnnotation
 *         expression: "STRING_VALUE", // required
 *       },
 *       updateRule: { // AutomatedReasoningPolicyUpdateRuleAnnotation
 *         ruleId: "STRING_VALUE", // required
 *         expression: "STRING_VALUE", // required
 *       },
 *       deleteRule: { // AutomatedReasoningPolicyDeleteRuleAnnotation
 *         ruleId: "STRING_VALUE", // required
 *       },
 *       addRuleFromNaturalLanguage: { // AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation
 *         naturalLanguage: "STRING_VALUE", // required
 *       },
 *       updateFromRulesFeedback: { // AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation
 *         ruleIds: [ // AutomatedReasoningPolicyDefinitionRuleIdList
 *           "STRING_VALUE",
 *         ],
 *         feedback: "STRING_VALUE", // required
 *       },
 *       updateFromScenarioFeedback: { // AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation
 *         ruleIds: [
 *           "STRING_VALUE",
 *         ],
 *         scenarioExpression: "STRING_VALUE", // required
 *         feedback: "STRING_VALUE",
 *       },
 *       ingestContent: { // AutomatedReasoningPolicyIngestContentAnnotation
 *         content: "STRING_VALUE", // required
 *       },
 *     },
 *   ],
 *   lastUpdatedAnnotationSetHash: "STRING_VALUE", // required
 * };
 * const command = new UpdateAutomatedReasoningPolicyAnnotationsCommand(input);
 * const response = await client.send(command);
 * // { // UpdateAutomatedReasoningPolicyAnnotationsResponse
 * //   policyArn: "STRING_VALUE", // required
 * //   buildWorkflowId: "STRING_VALUE", // required
 * //   annotationSetHash: "STRING_VALUE", // required
 * //   updatedAt: new Date("TIMESTAMP"), // required
 * // };
 *
 * ```
 *
 * @param UpdateAutomatedReasoningPolicyAnnotationsCommandInput - {@link UpdateAutomatedReasoningPolicyAnnotationsCommandInput}
 * @returns {@link UpdateAutomatedReasoningPolicyAnnotationsCommandOutput}
 * @see {@link UpdateAutomatedReasoningPolicyAnnotationsCommandInput} for command's `input` shape.
 * @see {@link UpdateAutomatedReasoningPolicyAnnotationsCommandOutput} for command's `response` shape.
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
export declare class UpdateAutomatedReasoningPolicyAnnotationsCommand extends UpdateAutomatedReasoningPolicyAnnotationsCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: UpdateAutomatedReasoningPolicyAnnotationsRequest;
            output: UpdateAutomatedReasoningPolicyAnnotationsResponse;
        };
        sdk: {
            input: UpdateAutomatedReasoningPolicyAnnotationsCommandInput;
            output: UpdateAutomatedReasoningPolicyAnnotationsCommandOutput;
        };
    };
}
