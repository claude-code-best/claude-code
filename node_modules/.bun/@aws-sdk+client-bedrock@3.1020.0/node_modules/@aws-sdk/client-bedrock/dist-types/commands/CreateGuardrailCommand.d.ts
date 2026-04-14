import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { CreateGuardrailRequest, CreateGuardrailResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link CreateGuardrailCommand}.
 */
export interface CreateGuardrailCommandInput extends CreateGuardrailRequest {
}
/**
 * @public
 *
 * The output of {@link CreateGuardrailCommand}.
 */
export interface CreateGuardrailCommandOutput extends CreateGuardrailResponse, __MetadataBearer {
}
declare const CreateGuardrailCommand_base: {
    new (input: CreateGuardrailCommandInput): import("@smithy/smithy-client").CommandImpl<CreateGuardrailCommandInput, CreateGuardrailCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: CreateGuardrailCommandInput): import("@smithy/smithy-client").CommandImpl<CreateGuardrailCommandInput, CreateGuardrailCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Creates a guardrail to block topics and to implement safeguards for your generative AI applications.</p> <p>You can configure the following policies in a guardrail to avoid undesirable and harmful content, filter out denied topics and words, and remove sensitive information for privacy protection.</p> <ul> <li> <p> <b>Content filters</b> - Adjust filter strengths to block input prompts or model responses containing harmful content.</p> </li> <li> <p> <b>Denied topics</b> - Define a set of topics that are undesirable in the context of your application. These topics will be blocked if detected in user queries or model responses.</p> </li> <li> <p> <b>Word filters</b> - Configure filters to block undesirable words, phrases, and profanity. Such words can include offensive terms, competitor names etc.</p> </li> <li> <p> <b>Sensitive information filters</b> - Block or mask sensitive information such as personally identifiable information (PII) or custom regex in user inputs and model responses.</p> </li> </ul> <p>In addition to the above policies, you can also configure the messages to be returned to the user if a user input or model response is in violation of the policies defined in the guardrail.</p> <p>For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html">Amazon Bedrock Guardrails</a> in the <i>Amazon Bedrock User Guide</i>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, CreateGuardrailCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, CreateGuardrailCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // CreateGuardrailRequest
 *   name: "STRING_VALUE", // required
 *   description: "STRING_VALUE",
 *   topicPolicyConfig: { // GuardrailTopicPolicyConfig
 *     topicsConfig: [ // GuardrailTopicsConfig // required
 *       { // GuardrailTopicConfig
 *         name: "STRING_VALUE", // required
 *         definition: "STRING_VALUE", // required
 *         examples: [ // GuardrailTopicExamples
 *           "STRING_VALUE",
 *         ],
 *         type: "DENY", // required
 *         inputAction: "BLOCK" || "NONE",
 *         outputAction: "BLOCK" || "NONE",
 *         inputEnabled: true || false,
 *         outputEnabled: true || false,
 *       },
 *     ],
 *     tierConfig: { // GuardrailTopicsTierConfig
 *       tierName: "CLASSIC" || "STANDARD", // required
 *     },
 *   },
 *   contentPolicyConfig: { // GuardrailContentPolicyConfig
 *     filtersConfig: [ // GuardrailContentFiltersConfig // required
 *       { // GuardrailContentFilterConfig
 *         type: "SEXUAL" || "VIOLENCE" || "HATE" || "INSULTS" || "MISCONDUCT" || "PROMPT_ATTACK", // required
 *         inputStrength: "NONE" || "LOW" || "MEDIUM" || "HIGH", // required
 *         outputStrength: "NONE" || "LOW" || "MEDIUM" || "HIGH", // required
 *         inputModalities: [ // GuardrailModalities
 *           "TEXT" || "IMAGE",
 *         ],
 *         outputModalities: [
 *           "TEXT" || "IMAGE",
 *         ],
 *         inputAction: "BLOCK" || "NONE",
 *         outputAction: "BLOCK" || "NONE",
 *         inputEnabled: true || false,
 *         outputEnabled: true || false,
 *       },
 *     ],
 *     tierConfig: { // GuardrailContentFiltersTierConfig
 *       tierName: "CLASSIC" || "STANDARD", // required
 *     },
 *   },
 *   wordPolicyConfig: { // GuardrailWordPolicyConfig
 *     wordsConfig: [ // GuardrailWordsConfig
 *       { // GuardrailWordConfig
 *         text: "STRING_VALUE", // required
 *         inputAction: "BLOCK" || "NONE",
 *         outputAction: "BLOCK" || "NONE",
 *         inputEnabled: true || false,
 *         outputEnabled: true || false,
 *       },
 *     ],
 *     managedWordListsConfig: [ // GuardrailManagedWordListsConfig
 *       { // GuardrailManagedWordsConfig
 *         type: "PROFANITY", // required
 *         inputAction: "BLOCK" || "NONE",
 *         outputAction: "BLOCK" || "NONE",
 *         inputEnabled: true || false,
 *         outputEnabled: true || false,
 *       },
 *     ],
 *   },
 *   sensitiveInformationPolicyConfig: { // GuardrailSensitiveInformationPolicyConfig
 *     piiEntitiesConfig: [ // GuardrailPiiEntitiesConfig
 *       { // GuardrailPiiEntityConfig
 *         type: "ADDRESS" || "AGE" || "AWS_ACCESS_KEY" || "AWS_SECRET_KEY" || "CA_HEALTH_NUMBER" || "CA_SOCIAL_INSURANCE_NUMBER" || "CREDIT_DEBIT_CARD_CVV" || "CREDIT_DEBIT_CARD_EXPIRY" || "CREDIT_DEBIT_CARD_NUMBER" || "DRIVER_ID" || "EMAIL" || "INTERNATIONAL_BANK_ACCOUNT_NUMBER" || "IP_ADDRESS" || "LICENSE_PLATE" || "MAC_ADDRESS" || "NAME" || "PASSWORD" || "PHONE" || "PIN" || "SWIFT_CODE" || "UK_NATIONAL_HEALTH_SERVICE_NUMBER" || "UK_NATIONAL_INSURANCE_NUMBER" || "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER" || "URL" || "USERNAME" || "US_BANK_ACCOUNT_NUMBER" || "US_BANK_ROUTING_NUMBER" || "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER" || "US_PASSPORT_NUMBER" || "US_SOCIAL_SECURITY_NUMBER" || "VEHICLE_IDENTIFICATION_NUMBER", // required
 *         action: "BLOCK" || "ANONYMIZE" || "NONE", // required
 *         inputAction: "BLOCK" || "ANONYMIZE" || "NONE",
 *         outputAction: "BLOCK" || "ANONYMIZE" || "NONE",
 *         inputEnabled: true || false,
 *         outputEnabled: true || false,
 *       },
 *     ],
 *     regexesConfig: [ // GuardrailRegexesConfig
 *       { // GuardrailRegexConfig
 *         name: "STRING_VALUE", // required
 *         description: "STRING_VALUE",
 *         pattern: "STRING_VALUE", // required
 *         action: "BLOCK" || "ANONYMIZE" || "NONE", // required
 *         inputAction: "BLOCK" || "ANONYMIZE" || "NONE",
 *         outputAction: "BLOCK" || "ANONYMIZE" || "NONE",
 *         inputEnabled: true || false,
 *         outputEnabled: true || false,
 *       },
 *     ],
 *   },
 *   contextualGroundingPolicyConfig: { // GuardrailContextualGroundingPolicyConfig
 *     filtersConfig: [ // GuardrailContextualGroundingFiltersConfig // required
 *       { // GuardrailContextualGroundingFilterConfig
 *         type: "GROUNDING" || "RELEVANCE", // required
 *         threshold: Number("double"), // required
 *         action: "BLOCK" || "NONE",
 *         enabled: true || false,
 *       },
 *     ],
 *   },
 *   automatedReasoningPolicyConfig: { // GuardrailAutomatedReasoningPolicyConfig
 *     policies: [ // AutomatedReasoningPolicyArnList // required
 *       "STRING_VALUE",
 *     ],
 *     confidenceThreshold: Number("double"),
 *   },
 *   crossRegionConfig: { // GuardrailCrossRegionConfig
 *     guardrailProfileIdentifier: "STRING_VALUE", // required
 *   },
 *   blockedInputMessaging: "STRING_VALUE", // required
 *   blockedOutputsMessaging: "STRING_VALUE", // required
 *   kmsKeyId: "STRING_VALUE",
 *   tags: [ // TagList
 *     { // Tag
 *       key: "STRING_VALUE", // required
 *       value: "STRING_VALUE", // required
 *     },
 *   ],
 *   clientRequestToken: "STRING_VALUE",
 * };
 * const command = new CreateGuardrailCommand(input);
 * const response = await client.send(command);
 * // { // CreateGuardrailResponse
 * //   guardrailId: "STRING_VALUE", // required
 * //   guardrailArn: "STRING_VALUE", // required
 * //   version: "STRING_VALUE", // required
 * //   createdAt: new Date("TIMESTAMP"), // required
 * // };
 *
 * ```
 *
 * @param CreateGuardrailCommandInput - {@link CreateGuardrailCommandInput}
 * @returns {@link CreateGuardrailCommandOutput}
 * @see {@link CreateGuardrailCommandInput} for command's `input` shape.
 * @see {@link CreateGuardrailCommandOutput} for command's `response` shape.
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
 * @throws {@link ServiceQuotaExceededException} (client fault)
 *  <p>The number of requests exceeds the service quota. Resubmit your request later.</p>
 *
 * @throws {@link ThrottlingException} (client fault)
 *  <p>The number of requests exceeds the limit. Resubmit your request later.</p>
 *
 * @throws {@link TooManyTagsException} (client fault)
 *  <p>The request contains more tags than can be associated with a resource (50 tags per resource). The maximum number of tags includes both existing tags and those included in your current request. </p>
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
export declare class CreateGuardrailCommand extends CreateGuardrailCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: CreateGuardrailRequest;
            output: CreateGuardrailResponse;
        };
        sdk: {
            input: CreateGuardrailCommandInput;
            output: CreateGuardrailCommandOutput;
        };
    };
}
