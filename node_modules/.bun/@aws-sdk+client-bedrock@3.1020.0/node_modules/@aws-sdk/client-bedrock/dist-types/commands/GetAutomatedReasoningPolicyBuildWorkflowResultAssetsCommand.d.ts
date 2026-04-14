import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetAutomatedReasoningPolicyBuildWorkflowResultAssetsRequest, GetAutomatedReasoningPolicyBuildWorkflowResultAssetsResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand}.
 */
export interface GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput extends GetAutomatedReasoningPolicyBuildWorkflowResultAssetsRequest {
}
/**
 * @public
 *
 * The output of {@link GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand}.
 */
export interface GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput extends GetAutomatedReasoningPolicyBuildWorkflowResultAssetsResponse, __MetadataBearer {
}
declare const GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand_base: {
    new (input: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput): import("@smithy/smithy-client").CommandImpl<GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput, GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput): import("@smithy/smithy-client").CommandImpl<GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput, GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Retrieves the resulting assets from a completed Automated Reasoning policy build workflow, including build logs, quality reports, and generated policy artifacts.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetAutomatedReasoningPolicyBuildWorkflowResultAssetsRequest
 *   policyArn: "STRING_VALUE", // required
 *   buildWorkflowId: "STRING_VALUE", // required
 *   assetType: "BUILD_LOG" || "QUALITY_REPORT" || "POLICY_DEFINITION" || "GENERATED_TEST_CASES" || "POLICY_SCENARIOS" || "FIDELITY_REPORT" || "ASSET_MANIFEST" || "SOURCE_DOCUMENT", // required
 *   assetId: "STRING_VALUE",
 * };
 * const command = new GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand(input);
 * const response = await client.send(command);
 * // { // GetAutomatedReasoningPolicyBuildWorkflowResultAssetsResponse
 * //   policyArn: "STRING_VALUE", // required
 * //   buildWorkflowId: "STRING_VALUE", // required
 * //   buildWorkflowAssets: { // AutomatedReasoningPolicyBuildResultAssets Union: only one key present
 * //     policyDefinition: { // AutomatedReasoningPolicyDefinition
 * //       version: "STRING_VALUE",
 * //       types: [ // AutomatedReasoningPolicyDefinitionTypeList
 * //         { // AutomatedReasoningPolicyDefinitionType
 * //           name: "STRING_VALUE", // required
 * //           description: "STRING_VALUE",
 * //           values: [ // AutomatedReasoningPolicyDefinitionTypeValueList // required
 * //             { // AutomatedReasoningPolicyDefinitionTypeValue
 * //               value: "STRING_VALUE", // required
 * //               description: "STRING_VALUE",
 * //             },
 * //           ],
 * //         },
 * //       ],
 * //       rules: [ // AutomatedReasoningPolicyDefinitionRuleList
 * //         { // AutomatedReasoningPolicyDefinitionRule
 * //           id: "STRING_VALUE", // required
 * //           expression: "STRING_VALUE", // required
 * //           alternateExpression: "STRING_VALUE",
 * //         },
 * //       ],
 * //       variables: [ // AutomatedReasoningPolicyDefinitionVariableList
 * //         { // AutomatedReasoningPolicyDefinitionVariable
 * //           name: "STRING_VALUE", // required
 * //           type: "STRING_VALUE", // required
 * //           description: "STRING_VALUE", // required
 * //         },
 * //       ],
 * //     },
 * //     qualityReport: { // AutomatedReasoningPolicyDefinitionQualityReport
 * //       typeCount: Number("int"), // required
 * //       variableCount: Number("int"), // required
 * //       ruleCount: Number("int"), // required
 * //       unusedTypes: [ // AutomatedReasoningPolicyDefinitionTypeNameList // required
 * //         "STRING_VALUE",
 * //       ],
 * //       unusedTypeValues: [ // AutomatedReasoningPolicyDefinitionTypeValuePairList // required
 * //         { // AutomatedReasoningPolicyDefinitionTypeValuePair
 * //           typeName: "STRING_VALUE", // required
 * //           valueName: "STRING_VALUE", // required
 * //         },
 * //       ],
 * //       unusedVariables: [ // AutomatedReasoningPolicyDefinitionVariableNameList // required
 * //         "STRING_VALUE",
 * //       ],
 * //       conflictingRules: [ // AutomatedReasoningPolicyConflictedRuleIdList // required
 * //         "STRING_VALUE",
 * //       ],
 * //       disjointRuleSets: [ // AutomatedReasoningPolicyDisjointRuleSetList // required
 * //         { // AutomatedReasoningPolicyDisjointRuleSet
 * //           variables: [ // required
 * //             "STRING_VALUE",
 * //           ],
 * //           rules: [ // AutomatedReasoningPolicyDisjointedRuleIdList // required
 * //             "STRING_VALUE",
 * //           ],
 * //         },
 * //       ],
 * //     },
 * //     buildLog: { // AutomatedReasoningPolicyBuildLog
 * //       entries: [ // AutomatedReasoningPolicyBuildLogEntryList // required
 * //         { // AutomatedReasoningPolicyBuildLogEntry
 * //           annotation: { // AutomatedReasoningPolicyAnnotation Union: only one key present
 * //             addType: { // AutomatedReasoningPolicyAddTypeAnnotation
 * //               name: "STRING_VALUE", // required
 * //               description: "STRING_VALUE", // required
 * //               values: [ // required
 * //                 {
 * //                   value: "STRING_VALUE", // required
 * //                   description: "STRING_VALUE",
 * //                 },
 * //               ],
 * //             },
 * //             updateType: { // AutomatedReasoningPolicyUpdateTypeAnnotation
 * //               name: "STRING_VALUE", // required
 * //               newName: "STRING_VALUE",
 * //               description: "STRING_VALUE",
 * //               values: [ // AutomatedReasoningPolicyTypeValueAnnotationList // required
 * //                 { // AutomatedReasoningPolicyTypeValueAnnotation Union: only one key present
 * //                   addTypeValue: { // AutomatedReasoningPolicyAddTypeValue
 * //                     value: "STRING_VALUE", // required
 * //                     description: "STRING_VALUE",
 * //                   },
 * //                   updateTypeValue: { // AutomatedReasoningPolicyUpdateTypeValue
 * //                     value: "STRING_VALUE", // required
 * //                     newValue: "STRING_VALUE",
 * //                     description: "STRING_VALUE",
 * //                   },
 * //                   deleteTypeValue: { // AutomatedReasoningPolicyDeleteTypeValue
 * //                     value: "STRING_VALUE", // required
 * //                   },
 * //                 },
 * //               ],
 * //             },
 * //             deleteType: { // AutomatedReasoningPolicyDeleteTypeAnnotation
 * //               name: "STRING_VALUE", // required
 * //             },
 * //             addVariable: { // AutomatedReasoningPolicyAddVariableAnnotation
 * //               name: "STRING_VALUE", // required
 * //               type: "STRING_VALUE", // required
 * //               description: "STRING_VALUE", // required
 * //             },
 * //             updateVariable: { // AutomatedReasoningPolicyUpdateVariableAnnotation
 * //               name: "STRING_VALUE", // required
 * //               newName: "STRING_VALUE",
 * //               description: "STRING_VALUE",
 * //             },
 * //             deleteVariable: { // AutomatedReasoningPolicyDeleteVariableAnnotation
 * //               name: "STRING_VALUE", // required
 * //             },
 * //             addRule: { // AutomatedReasoningPolicyAddRuleAnnotation
 * //               expression: "STRING_VALUE", // required
 * //             },
 * //             updateRule: { // AutomatedReasoningPolicyUpdateRuleAnnotation
 * //               ruleId: "STRING_VALUE", // required
 * //               expression: "STRING_VALUE", // required
 * //             },
 * //             deleteRule: { // AutomatedReasoningPolicyDeleteRuleAnnotation
 * //               ruleId: "STRING_VALUE", // required
 * //             },
 * //             addRuleFromNaturalLanguage: { // AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation
 * //               naturalLanguage: "STRING_VALUE", // required
 * //             },
 * //             updateFromRulesFeedback: { // AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation
 * //               ruleIds: [ // AutomatedReasoningPolicyDefinitionRuleIdList
 * //                 "STRING_VALUE",
 * //               ],
 * //               feedback: "STRING_VALUE", // required
 * //             },
 * //             updateFromScenarioFeedback: { // AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation
 * //               ruleIds: [
 * //                 "STRING_VALUE",
 * //               ],
 * //               scenarioExpression: "STRING_VALUE", // required
 * //               feedback: "STRING_VALUE",
 * //             },
 * //             ingestContent: { // AutomatedReasoningPolicyIngestContentAnnotation
 * //               content: "STRING_VALUE", // required
 * //             },
 * //           },
 * //           status: "APPLIED" || "FAILED", // required
 * //           buildSteps: [ // AutomatedReasoningPolicyBuildStepList // required
 * //             { // AutomatedReasoningPolicyBuildStep
 * //               context: { // AutomatedReasoningPolicyBuildStepContext Union: only one key present
 * //                 planning: {},
 * //                 mutation: { // AutomatedReasoningPolicyMutation Union: only one key present
 * //                   addType: { // AutomatedReasoningPolicyAddTypeMutation
 * //                     type: {
 * //                       name: "STRING_VALUE", // required
 * //                       description: "STRING_VALUE",
 * //                       values: "<AutomatedReasoningPolicyDefinitionTypeValueList>", // required
 * //                     },
 * //                   },
 * //                   updateType: { // AutomatedReasoningPolicyUpdateTypeMutation
 * //                     type: {
 * //                       name: "STRING_VALUE", // required
 * //                       description: "STRING_VALUE",
 * //                       values: "<AutomatedReasoningPolicyDefinitionTypeValueList>", // required
 * //                     },
 * //                   },
 * //                   deleteType: { // AutomatedReasoningPolicyDeleteTypeMutation
 * //                     name: "STRING_VALUE", // required
 * //                   },
 * //                   addVariable: { // AutomatedReasoningPolicyAddVariableMutation
 * //                     variable: {
 * //                       name: "STRING_VALUE", // required
 * //                       type: "STRING_VALUE", // required
 * //                       description: "STRING_VALUE", // required
 * //                     },
 * //                   },
 * //                   updateVariable: { // AutomatedReasoningPolicyUpdateVariableMutation
 * //                     variable: {
 * //                       name: "STRING_VALUE", // required
 * //                       type: "STRING_VALUE", // required
 * //                       description: "STRING_VALUE", // required
 * //                     },
 * //                   },
 * //                   deleteVariable: { // AutomatedReasoningPolicyDeleteVariableMutation
 * //                     name: "STRING_VALUE", // required
 * //                   },
 * //                   addRule: { // AutomatedReasoningPolicyAddRuleMutation
 * //                     rule: {
 * //                       id: "STRING_VALUE", // required
 * //                       expression: "STRING_VALUE", // required
 * //                       alternateExpression: "STRING_VALUE",
 * //                     },
 * //                   },
 * //                   updateRule: { // AutomatedReasoningPolicyUpdateRuleMutation
 * //                     rule: {
 * //                       id: "STRING_VALUE", // required
 * //                       expression: "STRING_VALUE", // required
 * //                       alternateExpression: "STRING_VALUE",
 * //                     },
 * //                   },
 * //                   deleteRule: { // AutomatedReasoningPolicyDeleteRuleMutation
 * //                     id: "STRING_VALUE", // required
 * //                   },
 * //                 },
 * //               },
 * //               priorElement: { // AutomatedReasoningPolicyDefinitionElement Union: only one key present
 * //                 policyDefinitionVariable: "<AutomatedReasoningPolicyDefinitionVariable>",
 * //                 policyDefinitionType: "<AutomatedReasoningPolicyDefinitionType>",
 * //                 policyDefinitionRule: "<AutomatedReasoningPolicyDefinitionRule>",
 * //               },
 * //               messages: [ // AutomatedReasoningPolicyBuildStepMessageList // required
 * //                 { // AutomatedReasoningPolicyBuildStepMessage
 * //                   message: "STRING_VALUE", // required
 * //                   messageType: "INFO" || "WARNING" || "ERROR", // required
 * //                 },
 * //               ],
 * //             },
 * //           ],
 * //         },
 * //       ],
 * //     },
 * //     generatedTestCases: { // AutomatedReasoningPolicyGeneratedTestCases
 * //       generatedTestCases: [ // AutomatedReasoningPolicyGeneratedTestCaseList // required
 * //         { // AutomatedReasoningPolicyGeneratedTestCase
 * //           queryContent: "STRING_VALUE", // required
 * //           guardContent: "STRING_VALUE", // required
 * //           expectedAggregatedFindingsResult: "VALID" || "INVALID" || "SATISFIABLE" || "IMPOSSIBLE" || "TRANSLATION_AMBIGUOUS" || "TOO_COMPLEX" || "NO_TRANSLATION", // required
 * //         },
 * //       ],
 * //     },
 * //     policyScenarios: { // AutomatedReasoningPolicyScenarios
 * //       policyScenarios: [ // AutomatedReasoningPolicyScenarioList // required
 * //         { // AutomatedReasoningPolicyScenario
 * //           expression: "STRING_VALUE", // required
 * //           alternateExpression: "STRING_VALUE", // required
 * //           expectedResult: "VALID" || "INVALID" || "SATISFIABLE" || "IMPOSSIBLE" || "TRANSLATION_AMBIGUOUS" || "TOO_COMPLEX" || "NO_TRANSLATION", // required
 * //           ruleIds: [ // required
 * //             "STRING_VALUE",
 * //           ],
 * //         },
 * //       ],
 * //     },
 * //     assetManifest: { // AutomatedReasoningPolicyBuildResultAssetManifest
 * //       entries: [ // AutomatedReasoningPolicyBuildResultAssetManifestList // required
 * //         { // AutomatedReasoningPolicyBuildResultAssetManifestEntry
 * //           assetType: "BUILD_LOG" || "QUALITY_REPORT" || "POLICY_DEFINITION" || "GENERATED_TEST_CASES" || "POLICY_SCENARIOS" || "FIDELITY_REPORT" || "ASSET_MANIFEST" || "SOURCE_DOCUMENT", // required
 * //           assetName: "STRING_VALUE",
 * //           assetId: "STRING_VALUE",
 * //         },
 * //       ],
 * //     },
 * //     document: { // AutomatedReasoningPolicySourceDocument
 * //       document: new Uint8Array(), // required
 * //       documentContentType: "pdf" || "txt", // required
 * //       documentName: "STRING_VALUE", // required
 * //       documentDescription: "STRING_VALUE",
 * //       documentHash: "STRING_VALUE", // required
 * //     },
 * //     fidelityReport: { // AutomatedReasoningPolicyFidelityReport
 * //       coverageScore: Number("double"), // required
 * //       accuracyScore: Number("double"), // required
 * //       ruleReports: { // AutomatedReasoningPolicyRuleReportMap // required
 * //         "<keys>": { // AutomatedReasoningPolicyRuleReport
 * //           rule: "STRING_VALUE", // required
 * //           groundingStatements: [ // AutomatedReasoningPolicyStatementReferenceList
 * //             { // AutomatedReasoningPolicyStatementReference
 * //               documentId: "STRING_VALUE", // required
 * //               statementId: "STRING_VALUE", // required
 * //             },
 * //           ],
 * //           groundingJustifications: [ // AutomatedReasoningPolicyJustificationList
 * //             "STRING_VALUE",
 * //           ],
 * //           accuracyScore: Number("double"),
 * //           accuracyJustification: "STRING_VALUE",
 * //         },
 * //       },
 * //       variableReports: { // AutomatedReasoningPolicyVariableReportMap // required
 * //         "<keys>": { // AutomatedReasoningPolicyVariableReport
 * //           policyVariable: "STRING_VALUE", // required
 * //           groundingStatements: [
 * //             {
 * //               documentId: "STRING_VALUE", // required
 * //               statementId: "STRING_VALUE", // required
 * //             },
 * //           ],
 * //           groundingJustifications: [
 * //             "STRING_VALUE",
 * //           ],
 * //           accuracyScore: Number("double"),
 * //           accuracyJustification: "STRING_VALUE",
 * //         },
 * //       },
 * //       documentSources: [ // AutomatedReasoningPolicyReportSourceDocumentList // required
 * //         { // AutomatedReasoningPolicyReportSourceDocument
 * //           documentName: "STRING_VALUE", // required
 * //           documentHash: "STRING_VALUE", // required
 * //           documentId: "STRING_VALUE", // required
 * //           atomicStatements: [ // AutomatedReasoningPolicyAtomicStatementList // required
 * //             { // AutomatedReasoningPolicyAtomicStatement
 * //               id: "STRING_VALUE", // required
 * //               text: "STRING_VALUE", // required
 * //               location: { // AutomatedReasoningPolicyStatementLocation
 * //                 lines: [ // AutomatedReasoningPolicyLineNumberList // required
 * //                   Number("int"),
 * //                 ],
 * //               },
 * //             },
 * //           ],
 * //           documentContent: [ // AutomatedReasoningPolicyAnnotatedChunkList // required
 * //             { // AutomatedReasoningPolicyAnnotatedChunk
 * //               pageNumber: Number("int"),
 * //               content: [ // AutomatedReasoningPolicyAnnotatedContentList // required
 * //                 { // AutomatedReasoningPolicyAnnotatedContent Union: only one key present
 * //                   line: { // AutomatedReasoningPolicyAnnotatedLine
 * //                     lineNumber: Number("int"),
 * //                     lineText: "STRING_VALUE",
 * //                   },
 * //                 },
 * //               ],
 * //             },
 * //           ],
 * //         },
 * //       ],
 * //     },
 * //   },
 * // };
 *
 * ```
 *
 * @param GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput - {@link GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput}
 * @returns {@link GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput}
 * @see {@link GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput} for command's `input` shape.
 * @see {@link GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput} for command's `response` shape.
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
export declare class GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand extends GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsRequest;
            output: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsResponse;
        };
        sdk: {
            input: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput;
            output: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput;
        };
    };
}
