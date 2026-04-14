import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListAutomatedReasoningPolicyTestResultsRequest, ListAutomatedReasoningPolicyTestResultsResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListAutomatedReasoningPolicyTestResultsCommand}.
 */
export interface ListAutomatedReasoningPolicyTestResultsCommandInput extends ListAutomatedReasoningPolicyTestResultsRequest {
}
/**
 * @public
 *
 * The output of {@link ListAutomatedReasoningPolicyTestResultsCommand}.
 */
export interface ListAutomatedReasoningPolicyTestResultsCommandOutput extends ListAutomatedReasoningPolicyTestResultsResponse, __MetadataBearer {
}
declare const ListAutomatedReasoningPolicyTestResultsCommand_base: {
    new (input: ListAutomatedReasoningPolicyTestResultsCommandInput): import("@smithy/smithy-client").CommandImpl<ListAutomatedReasoningPolicyTestResultsCommandInput, ListAutomatedReasoningPolicyTestResultsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: ListAutomatedReasoningPolicyTestResultsCommandInput): import("@smithy/smithy-client").CommandImpl<ListAutomatedReasoningPolicyTestResultsCommandInput, ListAutomatedReasoningPolicyTestResultsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Lists test results for an Automated Reasoning policy, showing how the policy performed against various test scenarios and validation checks.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListAutomatedReasoningPolicyTestResultsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListAutomatedReasoningPolicyTestResultsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListAutomatedReasoningPolicyTestResultsRequest
 *   policyArn: "STRING_VALUE", // required
 *   buildWorkflowId: "STRING_VALUE", // required
 *   nextToken: "STRING_VALUE",
 *   maxResults: Number("int"),
 * };
 * const command = new ListAutomatedReasoningPolicyTestResultsCommand(input);
 * const response = await client.send(command);
 * // { // ListAutomatedReasoningPolicyTestResultsResponse
 * //   testResults: [ // AutomatedReasoningPolicyTestList // required
 * //     { // AutomatedReasoningPolicyTestResult
 * //       testCase: { // AutomatedReasoningPolicyTestCase
 * //         testCaseId: "STRING_VALUE", // required
 * //         guardContent: "STRING_VALUE", // required
 * //         queryContent: "STRING_VALUE",
 * //         expectedAggregatedFindingsResult: "VALID" || "INVALID" || "SATISFIABLE" || "IMPOSSIBLE" || "TRANSLATION_AMBIGUOUS" || "TOO_COMPLEX" || "NO_TRANSLATION",
 * //         createdAt: new Date("TIMESTAMP"), // required
 * //         updatedAt: new Date("TIMESTAMP"), // required
 * //         confidenceThreshold: Number("double"),
 * //       },
 * //       policyArn: "STRING_VALUE", // required
 * //       testRunStatus: "NOT_STARTED" || "SCHEDULED" || "IN_PROGRESS" || "COMPLETED" || "FAILED", // required
 * //       testFindings: [ // AutomatedReasoningCheckFindingList
 * //         { // AutomatedReasoningCheckFinding Union: only one key present
 * //           valid: { // AutomatedReasoningCheckValidFinding
 * //             translation: { // AutomatedReasoningCheckTranslation
 * //               premises: [ // AutomatedReasoningLogicStatementList
 * //                 { // AutomatedReasoningLogicStatement
 * //                   logic: "STRING_VALUE", // required
 * //                   naturalLanguage: "STRING_VALUE",
 * //                 },
 * //               ],
 * //               claims: [ // required
 * //                 {
 * //                   logic: "STRING_VALUE", // required
 * //                   naturalLanguage: "STRING_VALUE",
 * //                 },
 * //               ],
 * //               untranslatedPremises: [ // AutomatedReasoningCheckInputTextReferenceList
 * //                 { // AutomatedReasoningCheckInputTextReference
 * //                   text: "STRING_VALUE",
 * //                 },
 * //               ],
 * //               untranslatedClaims: [
 * //                 {
 * //                   text: "STRING_VALUE",
 * //                 },
 * //               ],
 * //               confidence: Number("double"), // required
 * //             },
 * //             claimsTrueScenario: { // AutomatedReasoningCheckScenario
 * //               statements: [
 * //                 {
 * //                   logic: "STRING_VALUE", // required
 * //                   naturalLanguage: "STRING_VALUE",
 * //                 },
 * //               ],
 * //             },
 * //             supportingRules: [ // AutomatedReasoningCheckRuleList
 * //               { // AutomatedReasoningCheckRule
 * //                 id: "STRING_VALUE",
 * //                 policyVersionArn: "STRING_VALUE",
 * //               },
 * //             ],
 * //             logicWarning: { // AutomatedReasoningCheckLogicWarning
 * //               type: "ALWAYS_TRUE" || "ALWAYS_FALSE",
 * //               premises: [
 * //                 {
 * //                   logic: "STRING_VALUE", // required
 * //                   naturalLanguage: "STRING_VALUE",
 * //                 },
 * //               ],
 * //               claims: [
 * //                 {
 * //                   logic: "STRING_VALUE", // required
 * //                   naturalLanguage: "STRING_VALUE",
 * //                 },
 * //               ],
 * //             },
 * //           },
 * //           invalid: { // AutomatedReasoningCheckInvalidFinding
 * //             translation: {
 * //               premises: "<AutomatedReasoningLogicStatementList>",
 * //               claims: "<AutomatedReasoningLogicStatementList>", // required
 * //               untranslatedPremises: [
 * //                 {
 * //                   text: "STRING_VALUE",
 * //                 },
 * //               ],
 * //               untranslatedClaims: [
 * //                 {
 * //                   text: "STRING_VALUE",
 * //                 },
 * //               ],
 * //               confidence: Number("double"), // required
 * //             },
 * //             contradictingRules: [
 * //               {
 * //                 id: "STRING_VALUE",
 * //                 policyVersionArn: "STRING_VALUE",
 * //               },
 * //             ],
 * //             logicWarning: {
 * //               type: "ALWAYS_TRUE" || "ALWAYS_FALSE",
 * //               premises: "<AutomatedReasoningLogicStatementList>",
 * //               claims: "<AutomatedReasoningLogicStatementList>",
 * //             },
 * //           },
 * //           satisfiable: { // AutomatedReasoningCheckSatisfiableFinding
 * //             translation: {
 * //               premises: "<AutomatedReasoningLogicStatementList>",
 * //               claims: "<AutomatedReasoningLogicStatementList>", // required
 * //               untranslatedPremises: [
 * //                 {
 * //                   text: "STRING_VALUE",
 * //                 },
 * //               ],
 * //               untranslatedClaims: "<AutomatedReasoningCheckInputTextReferenceList>",
 * //               confidence: Number("double"), // required
 * //             },
 * //             claimsTrueScenario: {
 * //               statements: "<AutomatedReasoningLogicStatementList>",
 * //             },
 * //             claimsFalseScenario: {
 * //               statements: "<AutomatedReasoningLogicStatementList>",
 * //             },
 * //             logicWarning: {
 * //               type: "ALWAYS_TRUE" || "ALWAYS_FALSE",
 * //               premises: "<AutomatedReasoningLogicStatementList>",
 * //               claims: "<AutomatedReasoningLogicStatementList>",
 * //             },
 * //           },
 * //           impossible: { // AutomatedReasoningCheckImpossibleFinding
 * //             translation: {
 * //               premises: "<AutomatedReasoningLogicStatementList>",
 * //               claims: "<AutomatedReasoningLogicStatementList>", // required
 * //               untranslatedPremises: "<AutomatedReasoningCheckInputTextReferenceList>",
 * //               untranslatedClaims: "<AutomatedReasoningCheckInputTextReferenceList>",
 * //               confidence: Number("double"), // required
 * //             },
 * //             contradictingRules: [
 * //               {
 * //                 id: "STRING_VALUE",
 * //                 policyVersionArn: "STRING_VALUE",
 * //               },
 * //             ],
 * //             logicWarning: {
 * //               type: "ALWAYS_TRUE" || "ALWAYS_FALSE",
 * //               premises: "<AutomatedReasoningLogicStatementList>",
 * //               claims: "<AutomatedReasoningLogicStatementList>",
 * //             },
 * //           },
 * //           translationAmbiguous: { // AutomatedReasoningCheckTranslationAmbiguousFinding
 * //             options: [ // AutomatedReasoningCheckTranslationOptionList
 * //               { // AutomatedReasoningCheckTranslationOption
 * //                 translations: [ // AutomatedReasoningCheckTranslationList
 * //                   {
 * //                     premises: "<AutomatedReasoningLogicStatementList>",
 * //                     claims: "<AutomatedReasoningLogicStatementList>", // required
 * //                     untranslatedPremises: "<AutomatedReasoningCheckInputTextReferenceList>",
 * //                     untranslatedClaims: "<AutomatedReasoningCheckInputTextReferenceList>",
 * //                     confidence: Number("double"), // required
 * //                   },
 * //                 ],
 * //               },
 * //             ],
 * //             differenceScenarios: [ // AutomatedReasoningCheckDifferenceScenarioList
 * //               {
 * //                 statements: "<AutomatedReasoningLogicStatementList>",
 * //               },
 * //             ],
 * //           },
 * //           tooComplex: {},
 * //           noTranslations: {},
 * //         },
 * //       ],
 * //       testRunResult: "PASSED" || "FAILED",
 * //       aggregatedTestFindingsResult: "VALID" || "INVALID" || "SATISFIABLE" || "IMPOSSIBLE" || "TRANSLATION_AMBIGUOUS" || "TOO_COMPLEX" || "NO_TRANSLATION",
 * //       updatedAt: new Date("TIMESTAMP"), // required
 * //     },
 * //   ],
 * //   nextToken: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param ListAutomatedReasoningPolicyTestResultsCommandInput - {@link ListAutomatedReasoningPolicyTestResultsCommandInput}
 * @returns {@link ListAutomatedReasoningPolicyTestResultsCommandOutput}
 * @see {@link ListAutomatedReasoningPolicyTestResultsCommandInput} for command's `input` shape.
 * @see {@link ListAutomatedReasoningPolicyTestResultsCommandOutput} for command's `response` shape.
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
 * @throws {@link ValidationException} (client fault)
 *  <p>Input validation failed. Check your request parameters and retry the request.</p>
 *
 * @throws {@link BedrockServiceException}
 * <p>Base exception class for all service exceptions from Bedrock service.</p>
 *
 *
 * @public
 */
export declare class ListAutomatedReasoningPolicyTestResultsCommand extends ListAutomatedReasoningPolicyTestResultsCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListAutomatedReasoningPolicyTestResultsRequest;
            output: ListAutomatedReasoningPolicyTestResultsResponse;
        };
        sdk: {
            input: ListAutomatedReasoningPolicyTestResultsCommandInput;
            output: ListAutomatedReasoningPolicyTestResultsCommandOutput;
        };
    };
}
