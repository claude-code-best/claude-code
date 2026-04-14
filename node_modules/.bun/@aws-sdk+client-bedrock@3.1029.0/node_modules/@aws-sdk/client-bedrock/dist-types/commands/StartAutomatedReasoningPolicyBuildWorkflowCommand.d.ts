import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { StartAutomatedReasoningPolicyBuildWorkflowRequest, StartAutomatedReasoningPolicyBuildWorkflowResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link StartAutomatedReasoningPolicyBuildWorkflowCommand}.
 */
export interface StartAutomatedReasoningPolicyBuildWorkflowCommandInput extends StartAutomatedReasoningPolicyBuildWorkflowRequest {
}
/**
 * @public
 *
 * The output of {@link StartAutomatedReasoningPolicyBuildWorkflowCommand}.
 */
export interface StartAutomatedReasoningPolicyBuildWorkflowCommandOutput extends StartAutomatedReasoningPolicyBuildWorkflowResponse, __MetadataBearer {
}
declare const StartAutomatedReasoningPolicyBuildWorkflowCommand_base: {
    new (input: StartAutomatedReasoningPolicyBuildWorkflowCommandInput): import("@smithy/smithy-client").CommandImpl<StartAutomatedReasoningPolicyBuildWorkflowCommandInput, StartAutomatedReasoningPolicyBuildWorkflowCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: StartAutomatedReasoningPolicyBuildWorkflowCommandInput): import("@smithy/smithy-client").CommandImpl<StartAutomatedReasoningPolicyBuildWorkflowCommandInput, StartAutomatedReasoningPolicyBuildWorkflowCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Starts a new build workflow for an Automated Reasoning policy. This initiates the process of analyzing source documents and generating policy rules, variables, and types.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, StartAutomatedReasoningPolicyBuildWorkflowCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, StartAutomatedReasoningPolicyBuildWorkflowCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // StartAutomatedReasoningPolicyBuildWorkflowRequest
 *   policyArn: "STRING_VALUE", // required
 *   buildWorkflowType: "INGEST_CONTENT" || "REFINE_POLICY" || "IMPORT_POLICY" || "GENERATE_FIDELITY_REPORT" || "GENERATE_POLICY_SCENARIOS", // required
 *   clientRequestToken: "STRING_VALUE",
 *   sourceContent: { // AutomatedReasoningPolicyBuildWorkflowSource
 *     policyDefinition: { // AutomatedReasoningPolicyDefinition
 *       version: "STRING_VALUE",
 *       types: [ // AutomatedReasoningPolicyDefinitionTypeList
 *         { // AutomatedReasoningPolicyDefinitionType
 *           name: "STRING_VALUE", // required
 *           description: "STRING_VALUE",
 *           values: [ // AutomatedReasoningPolicyDefinitionTypeValueList // required
 *             { // AutomatedReasoningPolicyDefinitionTypeValue
 *               value: "STRING_VALUE", // required
 *               description: "STRING_VALUE",
 *             },
 *           ],
 *         },
 *       ],
 *       rules: [ // AutomatedReasoningPolicyDefinitionRuleList
 *         { // AutomatedReasoningPolicyDefinitionRule
 *           id: "STRING_VALUE", // required
 *           expression: "STRING_VALUE", // required
 *           alternateExpression: "STRING_VALUE",
 *         },
 *       ],
 *       variables: [ // AutomatedReasoningPolicyDefinitionVariableList
 *         { // AutomatedReasoningPolicyDefinitionVariable
 *           name: "STRING_VALUE", // required
 *           type: "STRING_VALUE", // required
 *           description: "STRING_VALUE", // required
 *         },
 *       ],
 *     },
 *     workflowContent: { // AutomatedReasoningPolicyWorkflowTypeContent Union: only one key present
 *       documents: [ // AutomatedReasoningPolicyBuildWorkflowDocumentList
 *         { // AutomatedReasoningPolicyBuildWorkflowDocument
 *           document: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")           // required
 *           documentContentType: "pdf" || "txt", // required
 *           documentName: "STRING_VALUE", // required
 *           documentDescription: "STRING_VALUE",
 *         },
 *       ],
 *       policyRepairAssets: { // AutomatedReasoningPolicyBuildWorkflowRepairContent
 *         annotations: [ // AutomatedReasoningPolicyAnnotationList // required
 *           { // AutomatedReasoningPolicyAnnotation Union: only one key present
 *             addType: { // AutomatedReasoningPolicyAddTypeAnnotation
 *               name: "STRING_VALUE", // required
 *               description: "STRING_VALUE", // required
 *               values: [ // required
 *                 {
 *                   value: "STRING_VALUE", // required
 *                   description: "STRING_VALUE",
 *                 },
 *               ],
 *             },
 *             updateType: { // AutomatedReasoningPolicyUpdateTypeAnnotation
 *               name: "STRING_VALUE", // required
 *               newName: "STRING_VALUE",
 *               description: "STRING_VALUE",
 *               values: [ // AutomatedReasoningPolicyTypeValueAnnotationList // required
 *                 { // AutomatedReasoningPolicyTypeValueAnnotation Union: only one key present
 *                   addTypeValue: { // AutomatedReasoningPolicyAddTypeValue
 *                     value: "STRING_VALUE", // required
 *                     description: "STRING_VALUE",
 *                   },
 *                   updateTypeValue: { // AutomatedReasoningPolicyUpdateTypeValue
 *                     value: "STRING_VALUE", // required
 *                     newValue: "STRING_VALUE",
 *                     description: "STRING_VALUE",
 *                   },
 *                   deleteTypeValue: { // AutomatedReasoningPolicyDeleteTypeValue
 *                     value: "STRING_VALUE", // required
 *                   },
 *                 },
 *               ],
 *             },
 *             deleteType: { // AutomatedReasoningPolicyDeleteTypeAnnotation
 *               name: "STRING_VALUE", // required
 *             },
 *             addVariable: { // AutomatedReasoningPolicyAddVariableAnnotation
 *               name: "STRING_VALUE", // required
 *               type: "STRING_VALUE", // required
 *               description: "STRING_VALUE", // required
 *             },
 *             updateVariable: { // AutomatedReasoningPolicyUpdateVariableAnnotation
 *               name: "STRING_VALUE", // required
 *               newName: "STRING_VALUE",
 *               description: "STRING_VALUE",
 *             },
 *             deleteVariable: { // AutomatedReasoningPolicyDeleteVariableAnnotation
 *               name: "STRING_VALUE", // required
 *             },
 *             addRule: { // AutomatedReasoningPolicyAddRuleAnnotation
 *               expression: "STRING_VALUE", // required
 *             },
 *             updateRule: { // AutomatedReasoningPolicyUpdateRuleAnnotation
 *               ruleId: "STRING_VALUE", // required
 *               expression: "STRING_VALUE", // required
 *             },
 *             deleteRule: { // AutomatedReasoningPolicyDeleteRuleAnnotation
 *               ruleId: "STRING_VALUE", // required
 *             },
 *             addRuleFromNaturalLanguage: { // AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation
 *               naturalLanguage: "STRING_VALUE", // required
 *             },
 *             updateFromRulesFeedback: { // AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation
 *               ruleIds: [ // AutomatedReasoningPolicyDefinitionRuleIdList
 *                 "STRING_VALUE",
 *               ],
 *               feedback: "STRING_VALUE", // required
 *             },
 *             updateFromScenarioFeedback: { // AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation
 *               ruleIds: [
 *                 "STRING_VALUE",
 *               ],
 *               scenarioExpression: "STRING_VALUE", // required
 *               feedback: "STRING_VALUE",
 *             },
 *             ingestContent: { // AutomatedReasoningPolicyIngestContentAnnotation
 *               content: "STRING_VALUE", // required
 *             },
 *           },
 *         ],
 *       },
 *       generateFidelityReportContent: { // AutomatedReasoningPolicyGenerateFidelityReportContent Union: only one key present
 *         documents: [ // AutomatedReasoningPolicyGenerateFidelityReportDocumentList
 *           {
 *             document: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")             // required
 *             documentContentType: "pdf" || "txt", // required
 *             documentName: "STRING_VALUE", // required
 *             documentDescription: "STRING_VALUE",
 *           },
 *         ],
 *       },
 *     },
 *   },
 * };
 * const command = new StartAutomatedReasoningPolicyBuildWorkflowCommand(input);
 * const response = await client.send(command);
 * // { // StartAutomatedReasoningPolicyBuildWorkflowResponse
 * //   policyArn: "STRING_VALUE", // required
 * //   buildWorkflowId: "STRING_VALUE", // required
 * // };
 *
 * ```
 *
 * @param StartAutomatedReasoningPolicyBuildWorkflowCommandInput - {@link StartAutomatedReasoningPolicyBuildWorkflowCommandInput}
 * @returns {@link StartAutomatedReasoningPolicyBuildWorkflowCommandOutput}
 * @see {@link StartAutomatedReasoningPolicyBuildWorkflowCommandInput} for command's `input` shape.
 * @see {@link StartAutomatedReasoningPolicyBuildWorkflowCommandOutput} for command's `response` shape.
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
 * @throws {@link ResourceInUseException} (client fault)
 *  <p>Thrown when attempting to delete or modify a resource that is currently being used by other resources or operations. For example, trying to delete an Automated Reasoning policy that is referenced by an active guardrail.</p>
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
 * @throws {@link ValidationException} (client fault)
 *  <p>Input validation failed. Check your request parameters and retry the request.</p>
 *
 * @throws {@link BedrockServiceException}
 * <p>Base exception class for all service exceptions from Bedrock service.</p>
 *
 *
 * @public
 */
export declare class StartAutomatedReasoningPolicyBuildWorkflowCommand extends StartAutomatedReasoningPolicyBuildWorkflowCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: StartAutomatedReasoningPolicyBuildWorkflowRequest;
            output: StartAutomatedReasoningPolicyBuildWorkflowResponse;
        };
        sdk: {
            input: StartAutomatedReasoningPolicyBuildWorkflowCommandInput;
            output: StartAutomatedReasoningPolicyBuildWorkflowCommandOutput;
        };
    };
}
