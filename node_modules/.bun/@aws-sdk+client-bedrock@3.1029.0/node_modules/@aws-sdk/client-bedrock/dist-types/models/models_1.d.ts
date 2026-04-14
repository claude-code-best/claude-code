import type { ApplicationType, AuthorizationStatus, CommitmentDuration, CustomizationType, EntitlementAvailability, EvaluationJobStatus, EvaluationJobType, FineTuningJobStatus, FoundationModelLifecycleStatus, GuardrailManagedWordsType, GuardrailStatus, GuardrailTopicAction, GuardrailTopicsTierName, GuardrailTopicType, GuardrailWordAction, InferenceProfileStatus, InferenceProfileType, InferenceType, JobStatusDetails, ModelCopyJobStatus, ModelCustomization, ModelCustomizationJobStatus, ModelImportJobStatus, ModelInvocationJobStatus, ModelInvocationType, ModelModality, OfferType, PromptRouterStatus, PromptRouterType, ProvisionedModelStatus, RegionAvailability, RetrieveAndGenerateType, S3InputFormat, SearchType, SortByProvisionedModels, SortJobsBy, SortModelsBy, SortOrder } from "./enums";
import type { AgreementAvailability, CustomizationConfig, EvaluationConfig, EvaluationModelConfig, EvaluationOutputDataConfig, EvaluationPrecomputedRagSourceConfig, ExternalSourcesRetrieveAndGenerateConfiguration, FilterAttribute, GenerationConfiguration, GuardrailAutomatedReasoningPolicy, GuardrailAutomatedReasoningPolicyConfig, GuardrailContentPolicy, GuardrailContentPolicyConfig, GuardrailContextualGroundingPolicy, GuardrailContextualGroundingPolicyConfig, GuardrailCrossRegionConfig, GuardrailCrossRegionDetails, GuardrailPiiEntity, GuardrailRegex, GuardrailSensitiveInformationPolicyConfig, GuardrailTopicPolicyConfig, GuardrailWordPolicyConfig, ImplicitFilterConfiguration, ModelDataSource, OrchestrationConfiguration, OutputDataConfig, Tag, TrainingDataConfig, TrainingMetrics, ValidationDataConfig, ValidatorMetric, VectorSearchRerankingConfiguration, VpcConfig } from "./models_0";
/**
 * <p>Contains details about PII entities and regular expressions configured for the guardrail.</p>
 * @public
 */
export interface GuardrailSensitiveInformationPolicy {
    /**
     * <p>The list of PII entities configured for the guardrail.</p>
     * @public
     */
    piiEntities?: GuardrailPiiEntity[] | undefined;
    /**
     * <p>The list of regular expressions configured for the guardrail.</p>
     * @public
     */
    regexes?: GuardrailRegex[] | undefined;
}
/**
 * <p>The tier that your guardrail uses for denied topic filters.</p>
 * @public
 */
export interface GuardrailTopicsTier {
    /**
     * <p>The tier that your guardrail uses for denied topic filters. Valid values include:</p> <ul> <li> <p> <code>CLASSIC</code> tier – Provides established guardrails functionality supporting English, French, and Spanish languages.</p> </li> <li> <p> <code>STANDARD</code> tier – Provides a more robust solution than the <code>CLASSIC</code> tier and has more comprehensive language support. This tier requires that your guardrail use <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-cross-region.html">cross-Region inference</a>.</p> </li> </ul>
     * @public
     */
    tierName: GuardrailTopicsTierName | undefined;
}
/**
 * <p>Details about topics for the guardrail to identify and deny.</p> <p>This data type is used in the following API operations:</p> <ul> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_GetGuardrail.html#API_GetGuardrail_ResponseSyntax">GetGuardrail response body</a> </p> </li> </ul>
 * @public
 */
export interface GuardrailTopic {
    /**
     * <p>The name of the topic to deny.</p>
     * @public
     */
    name: string | undefined;
    /**
     * <p>A definition of the topic to deny.</p>
     * @public
     */
    definition: string | undefined;
    /**
     * <p>A list of prompts, each of which is an example of a prompt that can be categorized as belonging to the topic.</p>
     * @public
     */
    examples?: string[] | undefined;
    /**
     * <p>Specifies to deny the topic.</p>
     * @public
     */
    type?: GuardrailTopicType | undefined;
    /**
     * <p>The action to take when harmful content is detected in the input. Supported values include:</p> <ul> <li> <p> <code>BLOCK</code> – Block the content and replace it with blocked messaging.</p> </li> <li> <p> <code>NONE</code> – Take no action but return detection information in the trace response.</p> </li> </ul>
     * @public
     */
    inputAction?: GuardrailTopicAction | undefined;
    /**
     * <p>The action to take when harmful content is detected in the output. Supported values include:</p> <ul> <li> <p> <code>BLOCK</code> – Block the content and replace it with blocked messaging.</p> </li> <li> <p> <code>NONE</code> – Take no action but return detection information in the trace response.</p> </li> </ul>
     * @public
     */
    outputAction?: GuardrailTopicAction | undefined;
    /**
     * <p>Indicates whether guardrail evaluation is enabled on the input. When disabled, you aren't charged for the evaluation. The evaluation doesn't appear in the response.</p>
     * @public
     */
    inputEnabled?: boolean | undefined;
    /**
     * <p>Indicates whether guardrail evaluation is enabled on the output. When disabled, you aren't charged for the evaluation. The evaluation doesn't appear in the response.</p>
     * @public
     */
    outputEnabled?: boolean | undefined;
}
/**
 * <p>Contains details about topics that the guardrail should identify and deny.</p> <p>This data type is used in the following API operations:</p> <ul> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_GetGuardrail.html#API_GetGuardrail_ResponseSyntax">GetGuardrail response body</a> </p> </li> </ul>
 * @public
 */
export interface GuardrailTopicPolicy {
    /**
     * <p>A list of policies related to topics that the guardrail should deny.</p>
     * @public
     */
    topics: GuardrailTopic[] | undefined;
    /**
     * <p>The tier that your guardrail uses for denied topic filters.</p>
     * @public
     */
    tier?: GuardrailTopicsTier | undefined;
}
/**
 * <p>The managed word list that was configured for the guardrail. (This is a list of words that are pre-defined and managed by guardrails only.)</p>
 * @public
 */
export interface GuardrailManagedWords {
    /**
     * <p>ManagedWords$type The managed word type that was configured for the guardrail. (For now, we only offer profanity word list)</p>
     * @public
     */
    type: GuardrailManagedWordsType | undefined;
    /**
     * <p>The action to take when harmful content is detected in the input. Supported values include:</p> <ul> <li> <p> <code>BLOCK</code> – Block the content and replace it with blocked messaging.</p> </li> <li> <p> <code>NONE</code> – Take no action but return detection information in the trace response.</p> </li> </ul>
     * @public
     */
    inputAction?: GuardrailWordAction | undefined;
    /**
     * <p>The action to take when harmful content is detected in the output. Supported values include:</p> <ul> <li> <p> <code>BLOCK</code> – Block the content and replace it with blocked messaging.</p> </li> <li> <p> <code>NONE</code> – Take no action but return detection information in the trace response.</p> </li> </ul>
     * @public
     */
    outputAction?: GuardrailWordAction | undefined;
    /**
     * <p>Indicates whether guardrail evaluation is enabled on the input. When disabled, you aren't charged for the evaluation. The evaluation doesn't appear in the response.</p>
     * @public
     */
    inputEnabled?: boolean | undefined;
    /**
     * <p>Indicates whether guardrail evaluation is enabled on the output. When disabled, you aren't charged for the evaluation. The evaluation doesn't appear in the response.</p>
     * @public
     */
    outputEnabled?: boolean | undefined;
}
/**
 * <p>A word configured for the guardrail.</p>
 * @public
 */
export interface GuardrailWord {
    /**
     * <p>Text of the word configured for the guardrail to block.</p>
     * @public
     */
    text: string | undefined;
    /**
     * <p>The action to take when harmful content is detected in the input. Supported values include:</p> <ul> <li> <p> <code>BLOCK</code> – Block the content and replace it with blocked messaging.</p> </li> <li> <p> <code>NONE</code> – Take no action but return detection information in the trace response.</p> </li> </ul>
     * @public
     */
    inputAction?: GuardrailWordAction | undefined;
    /**
     * <p>The action to take when harmful content is detected in the output. Supported values include:</p> <ul> <li> <p> <code>BLOCK</code> – Block the content and replace it with blocked messaging.</p> </li> <li> <p> <code>NONE</code> – Take no action but return detection information in the trace response.</p> </li> </ul>
     * @public
     */
    outputAction?: GuardrailWordAction | undefined;
    /**
     * <p>Indicates whether guardrail evaluation is enabled on the input. When disabled, you aren't charged for the evaluation. The evaluation doesn't appear in the response.</p>
     * @public
     */
    inputEnabled?: boolean | undefined;
    /**
     * <p>Indicates whether guardrail evaluation is enabled on the output. When disabled, you aren't charged for the evaluation. The evaluation doesn't appear in the response.</p>
     * @public
     */
    outputEnabled?: boolean | undefined;
}
/**
 * <p>Contains details about the word policy configured for the guardrail.</p>
 * @public
 */
export interface GuardrailWordPolicy {
    /**
     * <p>A list of words configured for the guardrail.</p>
     * @public
     */
    words?: GuardrailWord[] | undefined;
    /**
     * <p>A list of managed words configured for the guardrail.</p>
     * @public
     */
    managedWordLists?: GuardrailManagedWords[] | undefined;
}
/**
 * @public
 */
export interface GetGuardrailResponse {
    /**
     * <p>The name of the guardrail.</p>
     * @public
     */
    name: string | undefined;
    /**
     * <p>The description of the guardrail.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>The unique identifier of the guardrail.</p>
     * @public
     */
    guardrailId: string | undefined;
    /**
     * <p>The ARN of the guardrail.</p>
     * @public
     */
    guardrailArn: string | undefined;
    /**
     * <p>The version of the guardrail.</p>
     * @public
     */
    version: string | undefined;
    /**
     * <p>The status of the guardrail.</p>
     * @public
     */
    status: GuardrailStatus | undefined;
    /**
     * <p>The topic policy that was configured for the guardrail.</p>
     * @public
     */
    topicPolicy?: GuardrailTopicPolicy | undefined;
    /**
     * <p>The content policy that was configured for the guardrail.</p>
     * @public
     */
    contentPolicy?: GuardrailContentPolicy | undefined;
    /**
     * <p>The word policy that was configured for the guardrail.</p>
     * @public
     */
    wordPolicy?: GuardrailWordPolicy | undefined;
    /**
     * <p>The sensitive information policy that was configured for the guardrail.</p>
     * @public
     */
    sensitiveInformationPolicy?: GuardrailSensitiveInformationPolicy | undefined;
    /**
     * <p>The contextual grounding policy used in the guardrail.</p>
     * @public
     */
    contextualGroundingPolicy?: GuardrailContextualGroundingPolicy | undefined;
    /**
     * <p>The current Automated Reasoning policy configuration for the guardrail, if any is configured.</p>
     * @public
     */
    automatedReasoningPolicy?: GuardrailAutomatedReasoningPolicy | undefined;
    /**
     * <p>Details about the system-defined guardrail profile that you're using with your guardrail, including the guardrail profile ID and Amazon Resource Name (ARN).</p>
     * @public
     */
    crossRegionDetails?: GuardrailCrossRegionDetails | undefined;
    /**
     * <p>The date and time at which the guardrail was created.</p>
     * @public
     */
    createdAt: Date | undefined;
    /**
     * <p>The date and time at which the guardrail was updated.</p>
     * @public
     */
    updatedAt: Date | undefined;
    /**
     * <p>Appears if the <code>status</code> is <code>FAILED</code>. A list of reasons for why the guardrail failed to be created, updated, versioned, or deleted.</p>
     * @public
     */
    statusReasons?: string[] | undefined;
    /**
     * <p>Appears if the <code>status</code> of the guardrail is <code>FAILED</code>. A list of recommendations to carry out before retrying the request.</p>
     * @public
     */
    failureRecommendations?: string[] | undefined;
    /**
     * <p>The message that the guardrail returns when it blocks a prompt.</p>
     * @public
     */
    blockedInputMessaging: string | undefined;
    /**
     * <p>The message that the guardrail returns when it blocks a model response.</p>
     * @public
     */
    blockedOutputsMessaging: string | undefined;
    /**
     * <p>The ARN of the KMS key that encrypts the guardrail.</p>
     * @public
     */
    kmsKeyArn?: string | undefined;
}
/**
 * @public
 */
export interface ListGuardrailsRequest {
    /**
     * <p>The unique identifier of the guardrail. This can be an ID or the ARN.</p>
     * @public
     */
    guardrailIdentifier?: string | undefined;
    /**
     * <p>The maximum number of results to return in the response.</p>
     * @public
     */
    maxResults?: number | undefined;
    /**
     * <p>If there are more results than were returned in the response, the response returns a <code>nextToken</code> that you can send in another <code>ListGuardrails</code> request to see the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
}
/**
 * <p>Contains details about a guardrail.</p> <p>This data type is used in the following API operations:</p> <ul> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListGuardrails.html#API_ListGuardrails_ResponseSyntax">ListGuardrails response body</a> </p> </li> </ul>
 * @public
 */
export interface GuardrailSummary {
    /**
     * <p>The unique identifier of the guardrail.</p>
     * @public
     */
    id: string | undefined;
    /**
     * <p>The ARN of the guardrail.</p>
     * @public
     */
    arn: string | undefined;
    /**
     * <p>The status of the guardrail.</p>
     * @public
     */
    status: GuardrailStatus | undefined;
    /**
     * <p>The name of the guardrail.</p>
     * @public
     */
    name: string | undefined;
    /**
     * <p>A description of the guardrail.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>The version of the guardrail.</p>
     * @public
     */
    version: string | undefined;
    /**
     * <p>The date and time at which the guardrail was created.</p>
     * @public
     */
    createdAt: Date | undefined;
    /**
     * <p>The date and time at which the guardrail was last updated.</p>
     * @public
     */
    updatedAt: Date | undefined;
    /**
     * <p>Details about the system-defined guardrail profile that you're using with your guardrail, including the guardrail profile ID and Amazon Resource Name (ARN).</p>
     * @public
     */
    crossRegionDetails?: GuardrailCrossRegionDetails | undefined;
}
/**
 * @public
 */
export interface ListGuardrailsResponse {
    /**
     * <p>A list of objects, each of which contains details about a guardrail.</p>
     * @public
     */
    guardrails: GuardrailSummary[] | undefined;
    /**
     * <p>If there are more results than were returned in the response, the response returns a <code>nextToken</code> that you can send in another <code>ListGuardrails</code> request to see the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
}
/**
 * @public
 */
export interface UpdateGuardrailRequest {
    /**
     * <p>The unique identifier of the guardrail. This can be an ID or the ARN.</p>
     * @public
     */
    guardrailIdentifier: string | undefined;
    /**
     * <p>A name for the guardrail.</p>
     * @public
     */
    name: string | undefined;
    /**
     * <p>A description of the guardrail.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>The topic policy to configure for the guardrail.</p>
     * @public
     */
    topicPolicyConfig?: GuardrailTopicPolicyConfig | undefined;
    /**
     * <p>The content policy to configure for the guardrail.</p>
     * @public
     */
    contentPolicyConfig?: GuardrailContentPolicyConfig | undefined;
    /**
     * <p>The word policy to configure for the guardrail.</p>
     * @public
     */
    wordPolicyConfig?: GuardrailWordPolicyConfig | undefined;
    /**
     * <p>The sensitive information policy to configure for the guardrail.</p>
     * @public
     */
    sensitiveInformationPolicyConfig?: GuardrailSensitiveInformationPolicyConfig | undefined;
    /**
     * <p>The contextual grounding policy configuration used to update a guardrail.</p>
     * @public
     */
    contextualGroundingPolicyConfig?: GuardrailContextualGroundingPolicyConfig | undefined;
    /**
     * <p>Updated configuration for Automated Reasoning policies associated with the guardrail.</p>
     * @public
     */
    automatedReasoningPolicyConfig?: GuardrailAutomatedReasoningPolicyConfig | undefined;
    /**
     * <p>The system-defined guardrail profile that you're using with your guardrail. Guardrail profiles define the destination Amazon Web Services Regions where guardrail inference requests can be automatically routed.</p> <p>For more information, see the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails-cross-region.html">Amazon Bedrock User Guide</a>.</p>
     * @public
     */
    crossRegionConfig?: GuardrailCrossRegionConfig | undefined;
    /**
     * <p>The message to return when the guardrail blocks a prompt.</p>
     * @public
     */
    blockedInputMessaging: string | undefined;
    /**
     * <p>The message to return when the guardrail blocks a model response.</p>
     * @public
     */
    blockedOutputsMessaging: string | undefined;
    /**
     * <p>The ARN of the KMS key with which to encrypt the guardrail.</p>
     * @public
     */
    kmsKeyId?: string | undefined;
}
/**
 * @public
 */
export interface UpdateGuardrailResponse {
    /**
     * <p>The unique identifier of the guardrail</p>
     * @public
     */
    guardrailId: string | undefined;
    /**
     * <p>The ARN of the guardrail.</p>
     * @public
     */
    guardrailArn: string | undefined;
    /**
     * <p>The version of the guardrail.</p>
     * @public
     */
    version: string | undefined;
    /**
     * <p>The date and time at which the guardrail was updated.</p>
     * @public
     */
    updatedAt: Date | undefined;
}
/**
 * <p>Contains information about the model or system-defined inference profile that is the source for an inference profile..</p>
 * @public
 */
export type InferenceProfileModelSource = InferenceProfileModelSource.CopyFromMember | InferenceProfileModelSource.$UnknownMember;
/**
 * @public
 */
export declare namespace InferenceProfileModelSource {
    /**
     * <p>The ARN of the model or system-defined inference profile that is the source for the inference profile.</p>
     * @public
     */
    interface CopyFromMember {
        copyFrom: string;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        copyFrom?: never;
        $unknown: [string, any];
    }
    /**
     * @deprecated unused in schema-serde mode.
     *
     */
    interface Visitor<T> {
        copyFrom: (value: string) => T;
        _: (name: string, value: any) => T;
    }
}
/**
 * @public
 */
export interface CreateInferenceProfileRequest {
    /**
     * <p>A name for the inference profile.</p>
     * @public
     */
    inferenceProfileName: string | undefined;
    /**
     * <p>A description for the inference profile.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>A unique, case-sensitive identifier to ensure that the API request completes no more than one time. If this token matches a previous request, Amazon Bedrock ignores the request, but does not return an error. For more information, see <a href="https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Run_Instance_Idempotency.html">Ensuring idempotency</a>.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>The foundation model or system-defined inference profile that the inference profile will track metrics and costs for.</p>
     * @public
     */
    modelSource: InferenceProfileModelSource | undefined;
    /**
     * <p>An array of objects, each of which contains a tag and its value. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Tagging resources</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
     * @public
     */
    tags?: Tag[] | undefined;
}
/**
 * @public
 */
export interface CreateInferenceProfileResponse {
    /**
     * <p>The ARN of the inference profile that you created.</p>
     * @public
     */
    inferenceProfileArn: string | undefined;
    /**
     * <p>The status of the inference profile. <code>ACTIVE</code> means that the inference profile is ready to be used.</p>
     * @public
     */
    status?: InferenceProfileStatus | undefined;
}
/**
 * @public
 */
export interface DeleteInferenceProfileRequest {
    /**
     * <p>The Amazon Resource Name (ARN) or ID of the application inference profile to delete.</p>
     * @public
     */
    inferenceProfileIdentifier: string | undefined;
}
/**
 * @public
 */
export interface DeleteInferenceProfileResponse {
}
/**
 * @public
 */
export interface GetInferenceProfileRequest {
    /**
     * <p>The ID or Amazon Resource Name (ARN) of the inference profile.</p>
     * @public
     */
    inferenceProfileIdentifier: string | undefined;
}
/**
 * <p>Contains information about a model.</p>
 * @public
 */
export interface InferenceProfileModel {
    /**
     * <p>The Amazon Resource Name (ARN) of the model.</p>
     * @public
     */
    modelArn?: string | undefined;
}
/**
 * @public
 */
export interface GetInferenceProfileResponse {
    /**
     * <p>The name of the inference profile.</p>
     * @public
     */
    inferenceProfileName: string | undefined;
    /**
     * <p>The description of the inference profile.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>The time at which the inference profile was created.</p>
     * @public
     */
    createdAt?: Date | undefined;
    /**
     * <p>The time at which the inference profile was last updated.</p>
     * @public
     */
    updatedAt?: Date | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the inference profile.</p>
     * @public
     */
    inferenceProfileArn: string | undefined;
    /**
     * <p>A list of information about each model in the inference profile.</p>
     * @public
     */
    models: InferenceProfileModel[] | undefined;
    /**
     * <p>The unique identifier of the inference profile.</p>
     * @public
     */
    inferenceProfileId: string | undefined;
    /**
     * <p>The status of the inference profile. <code>ACTIVE</code> means that the inference profile is ready to be used.</p>
     * @public
     */
    status: InferenceProfileStatus | undefined;
    /**
     * <p>The type of the inference profile. The following types are possible:</p> <ul> <li> <p> <code>SYSTEM_DEFINED</code> – The inference profile is defined by Amazon Bedrock. You can route inference requests across regions with these inference profiles.</p> </li> <li> <p> <code>APPLICATION</code> – The inference profile was created by a user. This type of inference profile can track metrics and costs when invoking the model in it. The inference profile may route requests to one or multiple regions.</p> </li> </ul>
     * @public
     */
    type: InferenceProfileType | undefined;
}
/**
 * @public
 */
export interface ListInferenceProfilesRequest {
    /**
     * <p>The maximum number of results to return in the response. If the total number of results is greater than this value, use the token returned in the response in the <code>nextToken</code> field when making another request to return the next batch of results.</p>
     * @public
     */
    maxResults?: number | undefined;
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, enter the token returned in the <code>nextToken</code> field in the response in this field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>Filters for inference profiles that match the type you specify.</p> <ul> <li> <p> <code>SYSTEM_DEFINED</code> – The inference profile is defined by Amazon Bedrock. You can route inference requests across regions with these inference profiles.</p> </li> <li> <p> <code>APPLICATION</code> – The inference profile was created by a user. This type of inference profile can track metrics and costs when invoking the model in it. The inference profile may route requests to one or multiple regions.</p> </li> </ul>
     * @public
     */
    typeEquals?: InferenceProfileType | undefined;
}
/**
 * <p>Contains information about an inference profile.</p>
 * @public
 */
export interface InferenceProfileSummary {
    /**
     * <p>The name of the inference profile.</p>
     * @public
     */
    inferenceProfileName: string | undefined;
    /**
     * <p>The description of the inference profile.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>The time at which the inference profile was created.</p>
     * @public
     */
    createdAt?: Date | undefined;
    /**
     * <p>The time at which the inference profile was last updated.</p>
     * @public
     */
    updatedAt?: Date | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the inference profile.</p>
     * @public
     */
    inferenceProfileArn: string | undefined;
    /**
     * <p>A list of information about each model in the inference profile.</p>
     * @public
     */
    models: InferenceProfileModel[] | undefined;
    /**
     * <p>The unique identifier of the inference profile.</p>
     * @public
     */
    inferenceProfileId: string | undefined;
    /**
     * <p>The status of the inference profile. <code>ACTIVE</code> means that the inference profile is ready to be used.</p>
     * @public
     */
    status: InferenceProfileStatus | undefined;
    /**
     * <p>The type of the inference profile. The following types are possible:</p> <ul> <li> <p> <code>SYSTEM_DEFINED</code> – The inference profile is defined by Amazon Bedrock. You can route inference requests across regions with these inference profiles.</p> </li> <li> <p> <code>APPLICATION</code> – The inference profile was created by a user. This type of inference profile can track metrics and costs when invoking the model in it. The inference profile may route requests to one or multiple regions.</p> </li> </ul>
     * @public
     */
    type: InferenceProfileType | undefined;
}
/**
 * @public
 */
export interface ListInferenceProfilesResponse {
    /**
     * <p>A list of information about each inference profile that you can use.</p>
     * @public
     */
    inferenceProfileSummaries?: InferenceProfileSummary[] | undefined;
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, use this token when making another request in the <code>nextToken</code> field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
}
/**
 * @public
 */
export interface DeleteModelInvocationLoggingConfigurationRequest {
}
/**
 * @public
 */
export interface DeleteModelInvocationLoggingConfigurationResponse {
}
/**
 * @public
 */
export interface GetModelInvocationLoggingConfigurationRequest {
}
/**
 * <p>S3 configuration for storing log data.</p>
 * @public
 */
export interface S3Config {
    /**
     * <p>S3 bucket name.</p>
     * @public
     */
    bucketName: string | undefined;
    /**
     * <p>S3 prefix. </p>
     * @public
     */
    keyPrefix?: string | undefined;
}
/**
 * <p>CloudWatch logging configuration.</p>
 * @public
 */
export interface CloudWatchConfig {
    /**
     * <p>The log group name.</p>
     * @public
     */
    logGroupName: string | undefined;
    /**
     * <p>The role Amazon Resource Name (ARN).</p>
     * @public
     */
    roleArn: string | undefined;
    /**
     * <p>S3 configuration for delivering a large amount of data.</p>
     * @public
     */
    largeDataDeliveryS3Config?: S3Config | undefined;
}
/**
 * <p>Configuration fields for invocation logging.</p>
 * @public
 */
export interface LoggingConfig {
    /**
     * <p>CloudWatch logging configuration.</p>
     * @public
     */
    cloudWatchConfig?: CloudWatchConfig | undefined;
    /**
     * <p>S3 configuration for storing log data.</p>
     * @public
     */
    s3Config?: S3Config | undefined;
    /**
     * <p>Set to include text data in the log delivery.</p>
     * @public
     */
    textDataDeliveryEnabled?: boolean | undefined;
    /**
     * <p>Set to include image data in the log delivery.</p>
     * @public
     */
    imageDataDeliveryEnabled?: boolean | undefined;
    /**
     * <p>Set to include embeddings data in the log delivery.</p>
     * @public
     */
    embeddingDataDeliveryEnabled?: boolean | undefined;
    /**
     * <p>Set to include video data in the log delivery.</p>
     * @public
     */
    videoDataDeliveryEnabled?: boolean | undefined;
    /**
     * <p>Set to include audio data in the log delivery.</p>
     * @public
     */
    audioDataDeliveryEnabled?: boolean | undefined;
}
/**
 * @public
 */
export interface GetModelInvocationLoggingConfigurationResponse {
    /**
     * <p>The current configuration values.</p>
     * @public
     */
    loggingConfig?: LoggingConfig | undefined;
}
/**
 * @public
 */
export interface PutModelInvocationLoggingConfigurationRequest {
    /**
     * <p>The logging configuration values to set.</p>
     * @public
     */
    loggingConfig: LoggingConfig | undefined;
}
/**
 * @public
 */
export interface PutModelInvocationLoggingConfigurationResponse {
}
/**
 * @public
 */
export interface CreateModelCopyJobRequest {
    /**
     * <p>The Amazon Resource Name (ARN) of the model to be copied.</p>
     * @public
     */
    sourceModelArn: string | undefined;
    /**
     * <p>A name for the copied model.</p>
     * @public
     */
    targetModelName: string | undefined;
    /**
     * <p>The ARN of the KMS key that you use to encrypt the model copy.</p>
     * @public
     */
    modelKmsKeyId?: string | undefined;
    /**
     * <p>Tags to associate with the target model. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/tagging.html">Tag resources</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
     * @public
     */
    targetModelTags?: Tag[] | undefined;
    /**
     * <p>A unique, case-sensitive identifier to ensure that the API request completes no more than one time. If this token matches a previous request, Amazon Bedrock ignores the request, but does not return an error. For more information, see <a href="https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Run_Instance_Idempotency.html">Ensuring idempotency</a>.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
}
/**
 * @public
 */
export interface CreateModelCopyJobResponse {
    /**
     * <p>The Amazon Resource Name (ARN) of the model copy job.</p>
     * @public
     */
    jobArn: string | undefined;
}
/**
 * @public
 */
export interface GetModelCopyJobRequest {
    /**
     * <p>The Amazon Resource Name (ARN) of the model copy job.</p>
     * @public
     */
    jobArn: string | undefined;
}
/**
 * @public
 */
export interface GetModelCopyJobResponse {
    /**
     * <p>The Amazon Resource Name (ARN) of the model copy job.</p>
     * @public
     */
    jobArn: string | undefined;
    /**
     * <p>The status of the model copy job.</p>
     * @public
     */
    status: ModelCopyJobStatus | undefined;
    /**
     * <p>The time at which the model copy job was created.</p>
     * @public
     */
    creationTime: Date | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the copied model.</p>
     * @public
     */
    targetModelArn: string | undefined;
    /**
     * <p>The name of the copied model.</p>
     * @public
     */
    targetModelName?: string | undefined;
    /**
     * <p>The unique identifier of the account that the model being copied originated from.</p>
     * @public
     */
    sourceAccountId: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the original model being copied.</p>
     * @public
     */
    sourceModelArn: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the KMS key encrypting the copied model.</p>
     * @public
     */
    targetModelKmsKeyArn?: string | undefined;
    /**
     * <p>The tags associated with the copied model.</p>
     * @public
     */
    targetModelTags?: Tag[] | undefined;
    /**
     * <p>An error message for why the model copy job failed.</p>
     * @public
     */
    failureMessage?: string | undefined;
    /**
     * <p>The name of the original model being copied.</p>
     * @public
     */
    sourceModelName?: string | undefined;
}
/**
 * @public
 */
export interface ListModelCopyJobsRequest {
    /**
     * <p>Filters for model copy jobs created after the specified time.</p>
     * @public
     */
    creationTimeAfter?: Date | undefined;
    /**
     * <p>Filters for model copy jobs created before the specified time. </p>
     * @public
     */
    creationTimeBefore?: Date | undefined;
    /**
     * <p>Filters for model copy jobs whose status matches the value that you specify.</p>
     * @public
     */
    statusEquals?: ModelCopyJobStatus | undefined;
    /**
     * <p>Filters for model copy jobs in which the account that the source model belongs to is equal to the value that you specify.</p>
     * @public
     */
    sourceAccountEquals?: string | undefined;
    /**
     * <p>Filters for model copy jobs in which the Amazon Resource Name (ARN) of the source model to is equal to the value that you specify.</p>
     * @public
     */
    sourceModelArnEquals?: string | undefined;
    /**
     * <p>Filters for model copy jobs in which the name of the copied model contains the string that you specify.</p>
     * @public
     */
    targetModelNameContains?: string | undefined;
    /**
     * <p>The maximum number of results to return in the response. If the total number of results is greater than this value, use the token returned in the response in the <code>nextToken</code> field when making another request to return the next batch of results.</p>
     * @public
     */
    maxResults?: number | undefined;
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, enter the token returned in the <code>nextToken</code> field in the response in this field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>The field to sort by in the returned list of model copy jobs.</p>
     * @public
     */
    sortBy?: SortJobsBy | undefined;
    /**
     * <p>Specifies whether to sort the results in ascending or descending order.</p>
     * @public
     */
    sortOrder?: SortOrder | undefined;
}
/**
 * <p>Contains details about each model copy job.</p> <p>This data type is used in the following API operations:</p> <ul> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListModelCopyJobs.html#API_ListModelCopyJobs_ResponseSyntax">ListModelCopyJobs response</a> </p> </li> </ul>
 * @public
 */
export interface ModelCopyJobSummary {
    /**
     * <p>The Amazon Resoource Name (ARN) of the model copy job.</p>
     * @public
     */
    jobArn: string | undefined;
    /**
     * <p>The status of the model copy job.</p>
     * @public
     */
    status: ModelCopyJobStatus | undefined;
    /**
     * <p>The time that the model copy job was created.</p>
     * @public
     */
    creationTime: Date | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the copied model.</p>
     * @public
     */
    targetModelArn: string | undefined;
    /**
     * <p>The name of the copied model.</p>
     * @public
     */
    targetModelName?: string | undefined;
    /**
     * <p>The unique identifier of the account that the model being copied originated from.</p>
     * @public
     */
    sourceAccountId: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the original model being copied.</p>
     * @public
     */
    sourceModelArn: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the KMS key used to encrypt the copied model.</p>
     * @public
     */
    targetModelKmsKeyArn?: string | undefined;
    /**
     * <p>Tags associated with the copied model.</p>
     * @public
     */
    targetModelTags?: Tag[] | undefined;
    /**
     * <p>If a model fails to be copied, a message describing why the job failed is included here.</p>
     * @public
     */
    failureMessage?: string | undefined;
    /**
     * <p>The name of the original model being copied.</p>
     * @public
     */
    sourceModelName?: string | undefined;
}
/**
 * @public
 */
export interface ListModelCopyJobsResponse {
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, use this token when making another request in the <code>nextToken</code> field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>A list of information about each model copy job.</p>
     * @public
     */
    modelCopyJobSummaries?: ModelCopyJobSummary[] | undefined;
}
/**
 * @public
 */
export interface CreateModelImportJobRequest {
    /**
     * <p>The name of the import job.</p>
     * @public
     */
    jobName: string | undefined;
    /**
     * <p>The name of the imported model.</p>
     * @public
     */
    importedModelName: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the model import job.</p>
     * @public
     */
    roleArn: string | undefined;
    /**
     * <p>The data source for the imported model.</p>
     * @public
     */
    modelDataSource: ModelDataSource | undefined;
    /**
     * <p>Tags to attach to this import job. </p>
     * @public
     */
    jobTags?: Tag[] | undefined;
    /**
     * <p>Tags to attach to the imported model.</p>
     * @public
     */
    importedModelTags?: Tag[] | undefined;
    /**
     * <p>A unique, case-sensitive identifier to ensure that the API request completes no more than one time. If this token matches a previous request, Amazon Bedrock ignores the request, but does not return an error. For more information, see <a href="https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Run_Instance_Idempotency.html">Ensuring idempotency</a>.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>VPC configuration parameters for the private Virtual Private Cloud (VPC) that contains the resources you are using for the import job.</p>
     * @public
     */
    vpcConfig?: VpcConfig | undefined;
    /**
     * <p>The imported model is encrypted at rest using this key.</p>
     * @public
     */
    importedModelKmsKeyId?: string | undefined;
}
/**
 * @public
 */
export interface CreateModelImportJobResponse {
    /**
     * <p>The Amazon Resource Name (ARN) of the model import job.</p>
     * @public
     */
    jobArn: string | undefined;
}
/**
 * @public
 */
export interface DeleteImportedModelRequest {
    /**
     * <p>Name of the imported model to delete.</p>
     * @public
     */
    modelIdentifier: string | undefined;
}
/**
 * @public
 */
export interface DeleteImportedModelResponse {
}
/**
 * @public
 */
export interface GetImportedModelRequest {
    /**
     * <p>Name or Amazon Resource Name (ARN) of the imported model.</p>
     * @public
     */
    modelIdentifier: string | undefined;
}
/**
 * <p>A <code>CustomModelUnit</code> (CMU) is an abstract view of the hardware utilization that Amazon Bedrock needs to host a single copy of your custom model. A model copy represents a single instance of your imported model that is ready to serve inference requests. Amazon Bedrock determines the number of custom model units that a model copy needs when you import the custom model. </p> <p>You can use <code>CustomModelUnits</code> to estimate the cost of running your custom model. For more information, see Calculate the cost of running a custom model in the Amazon Bedrock user guide. </p>
 * @public
 */
export interface CustomModelUnits {
    /**
     * <p>The number of custom model units used to host a model copy. </p>
     * @public
     */
    customModelUnitsPerModelCopy?: number | undefined;
    /**
     * <p>The version of the custom model unit. Use to determine the billing rate for the custom model unit.</p>
     * @public
     */
    customModelUnitsVersion?: string | undefined;
}
/**
 * @public
 */
export interface GetImportedModelResponse {
    /**
     * <p>The Amazon Resource Name (ARN) associated with this imported model.</p>
     * @public
     */
    modelArn?: string | undefined;
    /**
     * <p>The name of the imported model.</p>
     * @public
     */
    modelName?: string | undefined;
    /**
     * <p>Job name associated with the imported model.</p>
     * @public
     */
    jobName?: string | undefined;
    /**
     * <p>Job Amazon Resource Name (ARN) associated with the imported model.</p>
     * @public
     */
    jobArn?: string | undefined;
    /**
     * <p>The data source for this imported model.</p>
     * @public
     */
    modelDataSource?: ModelDataSource | undefined;
    /**
     * <p>Creation time of the imported model.</p>
     * @public
     */
    creationTime?: Date | undefined;
    /**
     * <p>The architecture of the imported model.</p>
     * @public
     */
    modelArchitecture?: string | undefined;
    /**
     * <p>The imported model is encrypted at rest using this key.</p>
     * @public
     */
    modelKmsKeyArn?: string | undefined;
    /**
     * <p>Specifies if the imported model supports converse.</p>
     * @public
     */
    instructSupported?: boolean | undefined;
    /**
     * <p>Information about the hardware utilization for a single copy of the model.</p>
     * @public
     */
    customModelUnits?: CustomModelUnits | undefined;
}
/**
 * @public
 */
export interface GetModelImportJobRequest {
    /**
     * <p>The identifier of the import job.</p>
     * @public
     */
    jobIdentifier: string | undefined;
}
/**
 * @public
 */
export interface GetModelImportJobResponse {
    /**
     * <p>The Amazon Resource Name (ARN) of the import job.</p>
     * @public
     */
    jobArn?: string | undefined;
    /**
     * <p>The name of the import job.</p>
     * @public
     */
    jobName?: string | undefined;
    /**
     * <p>The name of the imported model.</p>
     * @public
     */
    importedModelName?: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the imported model.</p>
     * @public
     */
    importedModelArn?: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the IAM role associated with this job.</p>
     * @public
     */
    roleArn?: string | undefined;
    /**
     * <p>The data source for the imported model.</p>
     * @public
     */
    modelDataSource?: ModelDataSource | undefined;
    /**
     * <p>The status of the job. A successful job transitions from in-progress to completed when the imported model is ready to use. If the job failed, the failure message contains information about why the job failed.</p>
     * @public
     */
    status?: ModelImportJobStatus | undefined;
    /**
     * <p>Information about why the import job failed.</p>
     * @public
     */
    failureMessage?: string | undefined;
    /**
     * <p>The time the resource was created.</p>
     * @public
     */
    creationTime?: Date | undefined;
    /**
     * <p>Time the resource was last modified.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
    /**
     * <p>Time that the resource transitioned to terminal state.</p>
     * @public
     */
    endTime?: Date | undefined;
    /**
     * <p>The Virtual Private Cloud (VPC) configuration of the import model job.</p>
     * @public
     */
    vpcConfig?: VpcConfig | undefined;
    /**
     * <p>The imported model is encrypted at rest using this key.</p>
     * @public
     */
    importedModelKmsKeyArn?: string | undefined;
}
/**
 * @public
 */
export interface ListImportedModelsRequest {
    /**
     * <p>Return imported models that created before the specified time.</p>
     * @public
     */
    creationTimeBefore?: Date | undefined;
    /**
     * <p>Return imported models that were created after the specified time.</p>
     * @public
     */
    creationTimeAfter?: Date | undefined;
    /**
     * <p>Return imported models only if the model name contains these characters.</p>
     * @public
     */
    nameContains?: string | undefined;
    /**
     * <p>The maximum number of results to return in the response. If the total number of results is greater than this value, use the token returned in the response in the <code>nextToken</code> field when making another request to return the next batch of results.</p>
     * @public
     */
    maxResults?: number | undefined;
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, enter the token returned in the <code>nextToken</code> field in the response in this field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>The field to sort by in the returned list of imported models.</p>
     * @public
     */
    sortBy?: SortModelsBy | undefined;
    /**
     * <p>Specifies whetehr to sort the results in ascending or descending order.</p>
     * @public
     */
    sortOrder?: SortOrder | undefined;
}
/**
 * <p>Information about the imported model.</p>
 * @public
 */
export interface ImportedModelSummary {
    /**
     * <p>The Amazon Resource Name (ARN) of the imported model.</p>
     * @public
     */
    modelArn: string | undefined;
    /**
     * <p>Name of the imported model.</p>
     * @public
     */
    modelName: string | undefined;
    /**
     * <p>Creation time of the imported model.</p>
     * @public
     */
    creationTime: Date | undefined;
    /**
     * <p>Specifies if the imported model supports converse.</p>
     * @public
     */
    instructSupported?: boolean | undefined;
    /**
     * <p>The architecture of the imported model.</p>
     * @public
     */
    modelArchitecture?: string | undefined;
}
/**
 * @public
 */
export interface ListImportedModelsResponse {
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, use this token when making another request in the <code>nextToken</code> field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>Model summaries.</p>
     * @public
     */
    modelSummaries?: ImportedModelSummary[] | undefined;
}
/**
 * @public
 */
export interface ListModelImportJobsRequest {
    /**
     * <p>Return import jobs that were created after the specified time.</p>
     * @public
     */
    creationTimeAfter?: Date | undefined;
    /**
     * <p>Return import jobs that were created before the specified time.</p>
     * @public
     */
    creationTimeBefore?: Date | undefined;
    /**
     * <p>Return imported jobs with the specified status.</p>
     * @public
     */
    statusEquals?: ModelImportJobStatus | undefined;
    /**
     * <p>Return imported jobs only if the job name contains these characters.</p>
     * @public
     */
    nameContains?: string | undefined;
    /**
     * <p>The maximum number of results to return in the response. If the total number of results is greater than this value, use the token returned in the response in the <code>nextToken</code> field when making another request to return the next batch of results.</p>
     * @public
     */
    maxResults?: number | undefined;
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, enter the token returned in the <code>nextToken</code> field in the response in this field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>The field to sort by in the returned list of imported jobs.</p>
     * @public
     */
    sortBy?: SortJobsBy | undefined;
    /**
     * <p>Specifies whether to sort the results in ascending or descending order.</p>
     * @public
     */
    sortOrder?: SortOrder | undefined;
}
/**
 * <p>Information about the import job.</p>
 * @public
 */
export interface ModelImportJobSummary {
    /**
     * <p>The Amazon Resource Name (ARN) of the import job.</p>
     * @public
     */
    jobArn: string | undefined;
    /**
     * <p>The name of the import job.</p>
     * @public
     */
    jobName: string | undefined;
    /**
     * <p>The status of the imported job. </p>
     * @public
     */
    status: ModelImportJobStatus | undefined;
    /**
     * <p>The time when the import job was last modified.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
    /**
     * <p>The time import job was created.</p>
     * @public
     */
    creationTime: Date | undefined;
    /**
     * <p>The time when import job ended.</p>
     * @public
     */
    endTime?: Date | undefined;
    /**
     * <p>The Amazon resource Name (ARN) of the imported model.</p>
     * @public
     */
    importedModelArn?: string | undefined;
    /**
     * <p>The name of the imported model.</p>
     * @public
     */
    importedModelName?: string | undefined;
}
/**
 * @public
 */
export interface ListModelImportJobsResponse {
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, enter the token returned in the <code>nextToken</code> field in the response in this field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>Import job summaries.</p>
     * @public
     */
    modelImportJobSummaries?: ModelImportJobSummary[] | undefined;
}
/**
 * <p>Contains the configuration of the S3 location of the input data.</p>
 * @public
 */
export interface ModelInvocationJobS3InputDataConfig {
    /**
     * <p>The format of the input data.</p>
     * @public
     */
    s3InputFormat?: S3InputFormat | undefined;
    /**
     * <p>The S3 location of the input data.</p>
     * @public
     */
    s3Uri: string | undefined;
    /**
     * <p>The ID of the Amazon Web Services account that owns the S3 bucket containing the input data.</p>
     * @public
     */
    s3BucketOwner?: string | undefined;
}
/**
 * <p>Details about the location of the input to the batch inference job.</p>
 * @public
 */
export type ModelInvocationJobInputDataConfig = ModelInvocationJobInputDataConfig.S3InputDataConfigMember | ModelInvocationJobInputDataConfig.$UnknownMember;
/**
 * @public
 */
export declare namespace ModelInvocationJobInputDataConfig {
    /**
     * <p>Contains the configuration of the S3 location of the input data.</p>
     * @public
     */
    interface S3InputDataConfigMember {
        s3InputDataConfig: ModelInvocationJobS3InputDataConfig;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        s3InputDataConfig?: never;
        $unknown: [string, any];
    }
    /**
     * @deprecated unused in schema-serde mode.
     *
     */
    interface Visitor<T> {
        s3InputDataConfig: (value: ModelInvocationJobS3InputDataConfig) => T;
        _: (name: string, value: any) => T;
    }
}
/**
 * <p>Contains the configuration of the S3 location of the output data.</p>
 * @public
 */
export interface ModelInvocationJobS3OutputDataConfig {
    /**
     * <p>The S3 location of the output data.</p>
     * @public
     */
    s3Uri: string | undefined;
    /**
     * <p>The unique identifier of the key that encrypts the S3 location of the output data.</p>
     * @public
     */
    s3EncryptionKeyId?: string | undefined;
    /**
     * <p>The ID of the Amazon Web Services account that owns the S3 bucket containing the output data.</p>
     * @public
     */
    s3BucketOwner?: string | undefined;
}
/**
 * <p>Contains the configuration of the S3 location of the output data.</p>
 * @public
 */
export type ModelInvocationJobOutputDataConfig = ModelInvocationJobOutputDataConfig.S3OutputDataConfigMember | ModelInvocationJobOutputDataConfig.$UnknownMember;
/**
 * @public
 */
export declare namespace ModelInvocationJobOutputDataConfig {
    /**
     * <p>Contains the configuration of the S3 location of the output data.</p>
     * @public
     */
    interface S3OutputDataConfigMember {
        s3OutputDataConfig: ModelInvocationJobS3OutputDataConfig;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        s3OutputDataConfig?: never;
        $unknown: [string, any];
    }
    /**
     * @deprecated unused in schema-serde mode.
     *
     */
    interface Visitor<T> {
        s3OutputDataConfig: (value: ModelInvocationJobS3OutputDataConfig) => T;
        _: (name: string, value: any) => T;
    }
}
/**
 * @public
 */
export interface CreateModelInvocationJobRequest {
    /**
     * <p>A name to give the batch inference job.</p>
     * @public
     */
    jobName: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the service role with permissions to carry out and manage batch inference. You can use the console to create a default service role or follow the steps at <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-iam-sr.html">Create a service role for batch inference</a>.</p>
     * @public
     */
    roleArn: string | undefined;
    /**
     * <p>A unique, case-sensitive identifier to ensure that the API request completes no more than one time. If this token matches a previous request, Amazon Bedrock ignores the request, but does not return an error. For more information, see <a href="https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Run_Instance_Idempotency.html">Ensuring idempotency</a>.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>The unique identifier of the foundation model to use for the batch inference job.</p>
     * @public
     */
    modelId: string | undefined;
    /**
     * <p>Details about the location of the input to the batch inference job.</p>
     * @public
     */
    inputDataConfig: ModelInvocationJobInputDataConfig | undefined;
    /**
     * <p>Details about the location of the output of the batch inference job.</p>
     * @public
     */
    outputDataConfig: ModelInvocationJobOutputDataConfig | undefined;
    /**
     * <p>The configuration of the Virtual Private Cloud (VPC) for the data in the batch inference job. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-vpc">Protect batch inference jobs using a VPC</a>.</p>
     * @public
     */
    vpcConfig?: VpcConfig | undefined;
    /**
     * <p>The number of hours after which to force the batch inference job to time out.</p>
     * @public
     */
    timeoutDurationInHours?: number | undefined;
    /**
     * <p>Any tags to associate with the batch inference job. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/tagging.html">Tagging Amazon Bedrock resources</a>.</p>
     * @public
     */
    tags?: Tag[] | undefined;
    /**
     * <p>The invocation endpoint for ModelInvocationJob</p>
     * @public
     */
    modelInvocationType?: ModelInvocationType | undefined;
}
/**
 * @public
 */
export interface CreateModelInvocationJobResponse {
    /**
     * <p>The Amazon Resource Name (ARN) of the batch inference job.</p>
     * @public
     */
    jobArn: string | undefined;
}
/**
 * @public
 */
export interface GetModelInvocationJobRequest {
    /**
     * <p>The Amazon Resource Name (ARN) of the batch inference job.</p>
     * @public
     */
    jobIdentifier: string | undefined;
}
/**
 * @public
 */
export interface GetModelInvocationJobResponse {
    /**
     * <p>The Amazon Resource Name (ARN) of the batch inference job.</p>
     * @public
     */
    jobArn: string | undefined;
    /**
     * <p>The name of the batch inference job.</p>
     * @public
     */
    jobName?: string | undefined;
    /**
     * <p>The unique identifier of the foundation model used for model inference.</p>
     * @public
     */
    modelId: string | undefined;
    /**
     * <p>A unique, case-sensitive identifier to ensure that the API request completes no more than one time. If this token matches a previous request, Amazon Bedrock ignores the request, but does not return an error. For more information, see <a href="https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Run_Instance_Idempotency.html">Ensuring idempotency</a>.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the service role with permissions to carry out and manage batch inference. You can use the console to create a default service role or follow the steps at <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-iam-sr.html">Create a service role for batch inference</a>.</p>
     * @public
     */
    roleArn: string | undefined;
    /**
     * <p>The status of the batch inference job.</p> <p>The following statuses are possible:</p> <ul> <li> <p>Submitted – This job has been submitted to a queue for validation.</p> </li> <li> <p>Validating – This job is being validated for the requirements described in <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference-data.html">Format and upload your batch inference data</a>. The criteria include the following:</p> <ul> <li> <p>Your IAM service role has access to the Amazon S3 buckets containing your files.</p> </li> <li> <p>Your files are .jsonl files and each individual record is a JSON object in the correct format. Note that validation doesn't check if the <code>modelInput</code> value matches the request body for the model.</p> </li> <li> <p>Your files fulfill the requirements for file size and number of records. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/quotas.html">Quotas for Amazon Bedrock</a>.</p> </li> </ul> </li> <li> <p>Scheduled – This job has been validated and is now in a queue. The job will automatically start when it reaches its turn.</p> </li> <li> <p>Expired – This job timed out because it was scheduled but didn't begin before the set timeout duration. Submit a new job request.</p> </li> <li> <p>InProgress – This job has begun. You can start viewing the results in the output S3 location.</p> </li> <li> <p>Completed – This job has successfully completed. View the output files in the output S3 location.</p> </li> <li> <p>PartiallyCompleted – This job has partially completed. Not all of your records could be processed in time. View the output files in the output S3 location.</p> </li> <li> <p>Failed – This job has failed. Check the failure message for any further details. For further assistance, reach out to the <a href="https://console.aws.amazon.com/support/home/">Amazon Web Services Support Center</a>.</p> </li> <li> <p>Stopped – This job was stopped by a user.</p> </li> <li> <p>Stopping – This job is being stopped by a user.</p> </li> </ul>
     * @public
     */
    status?: ModelInvocationJobStatus | undefined;
    /**
     * <p>If the batch inference job failed, this field contains a message describing why the job failed.</p>
     * @public
     */
    message?: string | undefined;
    /**
     * <p>The time at which the batch inference job was submitted.</p>
     * @public
     */
    submitTime: Date | undefined;
    /**
     * <p>The time at which the batch inference job was last modified.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
    /**
     * <p>The time at which the batch inference job ended.</p>
     * @public
     */
    endTime?: Date | undefined;
    /**
     * <p>Details about the location of the input to the batch inference job.</p>
     * @public
     */
    inputDataConfig: ModelInvocationJobInputDataConfig | undefined;
    /**
     * <p>Details about the location of the output of the batch inference job.</p>
     * @public
     */
    outputDataConfig: ModelInvocationJobOutputDataConfig | undefined;
    /**
     * <p>The configuration of the Virtual Private Cloud (VPC) for the data in the batch inference job. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-vpc">Protect batch inference jobs using a VPC</a>.</p>
     * @public
     */
    vpcConfig?: VpcConfig | undefined;
    /**
     * <p>The number of hours after which batch inference job was set to time out.</p>
     * @public
     */
    timeoutDurationInHours?: number | undefined;
    /**
     * <p>The time at which the batch inference job times or timed out.</p>
     * @public
     */
    jobExpirationTime?: Date | undefined;
    /**
     * <p>The invocation endpoint for ModelInvocationJob</p>
     * @public
     */
    modelInvocationType?: ModelInvocationType | undefined;
    /**
     * <p>The total number of records in the batch inference job.</p>
     * @public
     */
    totalRecordCount?: number | undefined;
    /**
     * <p>The number of records that have been processed in the batch inference job.</p>
     * @public
     */
    processedRecordCount?: number | undefined;
    /**
     * <p>The number of records that were successfully processed in the batch inference job.</p>
     * @public
     */
    successRecordCount?: number | undefined;
    /**
     * <p>The number of records that failed to process in the batch inference job.</p>
     * @public
     */
    errorRecordCount?: number | undefined;
}
/**
 * @public
 */
export interface ListModelInvocationJobsRequest {
    /**
     * <p>Specify a time to filter for batch inference jobs that were submitted after the time you specify.</p>
     * @public
     */
    submitTimeAfter?: Date | undefined;
    /**
     * <p>Specify a time to filter for batch inference jobs that were submitted before the time you specify.</p>
     * @public
     */
    submitTimeBefore?: Date | undefined;
    /**
     * <p>Specify a status to filter for batch inference jobs whose statuses match the string you specify.</p> <p>The following statuses are possible:</p> <ul> <li> <p>Submitted – This job has been submitted to a queue for validation.</p> </li> <li> <p>Validating – This job is being validated for the requirements described in <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference-data.html">Format and upload your batch inference data</a>. The criteria include the following:</p> <ul> <li> <p>Your IAM service role has access to the Amazon S3 buckets containing your files.</p> </li> <li> <p>Your files are .jsonl files and each individual record is a JSON object in the correct format. Note that validation doesn't check if the <code>modelInput</code> value matches the request body for the model.</p> </li> <li> <p>Your files fulfill the requirements for file size and number of records. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/quotas.html">Quotas for Amazon Bedrock</a>.</p> </li> </ul> </li> <li> <p>Scheduled – This job has been validated and is now in a queue. The job will automatically start when it reaches its turn.</p> </li> <li> <p>Expired – This job timed out because it was scheduled but didn't begin before the set timeout duration. Submit a new job request.</p> </li> <li> <p>InProgress – This job has begun. You can start viewing the results in the output S3 location.</p> </li> <li> <p>Completed – This job has successfully completed. View the output files in the output S3 location.</p> </li> <li> <p>PartiallyCompleted – This job has partially completed. Not all of your records could be processed in time. View the output files in the output S3 location.</p> </li> <li> <p>Failed – This job has failed. Check the failure message for any further details. For further assistance, reach out to the <a href="https://console.aws.amazon.com/support/home/">Amazon Web Services Support Center</a>.</p> </li> <li> <p>Stopped – This job was stopped by a user.</p> </li> <li> <p>Stopping – This job is being stopped by a user.</p> </li> </ul>
     * @public
     */
    statusEquals?: ModelInvocationJobStatus | undefined;
    /**
     * <p>Specify a string to filter for batch inference jobs whose names contain the string.</p>
     * @public
     */
    nameContains?: string | undefined;
    /**
     * <p>The maximum number of results to return. If there are more results than the number that you specify, a <code>nextToken</code> value is returned. Use the <code>nextToken</code> in a request to return the next batch of results.</p>
     * @public
     */
    maxResults?: number | undefined;
    /**
     * <p>If there were more results than the value you specified in the <code>maxResults</code> field in a previous <code>ListModelInvocationJobs</code> request, the response would have returned a <code>nextToken</code> value. To see the next batch of results, send the <code>nextToken</code> value in another request.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>An attribute by which to sort the results.</p>
     * @public
     */
    sortBy?: SortJobsBy | undefined;
    /**
     * <p>Specifies whether to sort the results by ascending or descending order.</p>
     * @public
     */
    sortOrder?: SortOrder | undefined;
}
/**
 * <p>A summary of a batch inference job.</p>
 * @public
 */
export interface ModelInvocationJobSummary {
    /**
     * <p>The Amazon Resource Name (ARN) of the batch inference job.</p>
     * @public
     */
    jobArn: string | undefined;
    /**
     * <p>The name of the batch inference job.</p>
     * @public
     */
    jobName: string | undefined;
    /**
     * <p>The unique identifier of the foundation model used for model inference.</p>
     * @public
     */
    modelId: string | undefined;
    /**
     * <p>A unique, case-sensitive identifier to ensure that the API request completes no more than one time. If this token matches a previous request, Amazon Bedrock ignores the request, but does not return an error. For more information, see <a href="https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Run_Instance_Idempotency.html">Ensuring idempotency</a>.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the service role with permissions to carry out and manage batch inference. You can use the console to create a default service role or follow the steps at <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-iam-sr.html">Create a service role for batch inference</a>.</p>
     * @public
     */
    roleArn: string | undefined;
    /**
     * <p>The status of the batch inference job.</p> <p>The following statuses are possible:</p> <ul> <li> <p>Submitted – This job has been submitted to a queue for validation.</p> </li> <li> <p>Validating – This job is being validated for the requirements described in <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference-data.html">Format and upload your batch inference data</a>. The criteria include the following:</p> <ul> <li> <p>Your IAM service role has access to the Amazon S3 buckets containing your files.</p> </li> <li> <p>Your files are .jsonl files and each individual record is a JSON object in the correct format. Note that validation doesn't check if the <code>modelInput</code> value matches the request body for the model.</p> </li> <li> <p>Your files fulfill the requirements for file size and number of records. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/quotas.html">Quotas for Amazon Bedrock</a>.</p> </li> </ul> </li> <li> <p>Scheduled – This job has been validated and is now in a queue. The job will automatically start when it reaches its turn.</p> </li> <li> <p>Expired – This job timed out because it was scheduled but didn't begin before the set timeout duration. Submit a new job request.</p> </li> <li> <p>InProgress – This job has begun. You can start viewing the results in the output S3 location.</p> </li> <li> <p>Completed – This job has successfully completed. View the output files in the output S3 location.</p> </li> <li> <p>PartiallyCompleted – This job has partially completed. Not all of your records could be processed in time. View the output files in the output S3 location.</p> </li> <li> <p>Failed – This job has failed. Check the failure message for any further details. For further assistance, reach out to the <a href="https://console.aws.amazon.com/support/home/">Amazon Web Services Support Center</a>.</p> </li> <li> <p>Stopped – This job was stopped by a user.</p> </li> <li> <p>Stopping – This job is being stopped by a user.</p> </li> </ul>
     * @public
     */
    status?: ModelInvocationJobStatus | undefined;
    /**
     * <p>If the batch inference job failed, this field contains a message describing why the job failed.</p>
     * @public
     */
    message?: string | undefined;
    /**
     * <p>The time at which the batch inference job was submitted.</p>
     * @public
     */
    submitTime: Date | undefined;
    /**
     * <p>The time at which the batch inference job was last modified.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
    /**
     * <p>The time at which the batch inference job ended.</p>
     * @public
     */
    endTime?: Date | undefined;
    /**
     * <p>Details about the location of the input to the batch inference job.</p>
     * @public
     */
    inputDataConfig: ModelInvocationJobInputDataConfig | undefined;
    /**
     * <p>Details about the location of the output of the batch inference job.</p>
     * @public
     */
    outputDataConfig: ModelInvocationJobOutputDataConfig | undefined;
    /**
     * <p>The configuration of the Virtual Private Cloud (VPC) for the data in the batch inference job. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/batch-vpc">Protect batch inference jobs using a VPC</a>.</p>
     * @public
     */
    vpcConfig?: VpcConfig | undefined;
    /**
     * <p>The number of hours after which the batch inference job was set to time out.</p>
     * @public
     */
    timeoutDurationInHours?: number | undefined;
    /**
     * <p>The time at which the batch inference job times or timed out.</p>
     * @public
     */
    jobExpirationTime?: Date | undefined;
    /**
     * <p>The invocation endpoint for ModelInvocationJob</p>
     * @public
     */
    modelInvocationType?: ModelInvocationType | undefined;
    /**
     * <p>The total number of records in the batch inference job.</p>
     * @public
     */
    totalRecordCount?: number | undefined;
    /**
     * <p>The number of records that have been processed in the batch inference job.</p>
     * @public
     */
    processedRecordCount?: number | undefined;
    /**
     * <p>The number of records that were successfully processed in the batch inference job.</p>
     * @public
     */
    successRecordCount?: number | undefined;
    /**
     * <p>The number of records that failed to process in the batch inference job.</p>
     * @public
     */
    errorRecordCount?: number | undefined;
}
/**
 * @public
 */
export interface ListModelInvocationJobsResponse {
    /**
     * <p>If there are more results than can fit in the response, a <code>nextToken</code> is returned. Use the <code>nextToken</code> in a request to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>A list of items, each of which contains a summary about a batch inference job.</p>
     * @public
     */
    invocationJobSummaries?: ModelInvocationJobSummary[] | undefined;
}
/**
 * @public
 */
export interface StopModelInvocationJobRequest {
    /**
     * <p>The Amazon Resource Name (ARN) of the batch inference job to stop.</p>
     * @public
     */
    jobIdentifier: string | undefined;
}
/**
 * @public
 */
export interface StopModelInvocationJobResponse {
}
/**
 * @public
 */
export interface GetFoundationModelRequest {
    /**
     * <p>The model identifier. </p>
     * @public
     */
    modelIdentifier: string | undefined;
}
/**
 * <p>Details about whether a model version is available or deprecated.</p>
 * @public
 */
export interface FoundationModelLifecycle {
    /**
     * <p>Specifies whether a model version is available (<code>ACTIVE</code>) or deprecated (<code>LEGACY</code>.</p>
     * @public
     */
    status: FoundationModelLifecycleStatus | undefined;
    /**
     * <p>Launch time when the model first becomes available</p>
     * @public
     */
    startOfLifeTime?: Date | undefined;
    /**
     * <p>Time when the model is no longer available for use</p>
     * @public
     */
    endOfLifeTime?: Date | undefined;
    /**
     * <p>Time when the model enters legacy state. Models in legacy state can still be used, but users should plan to transition to an Active model before the end of life time</p>
     * @public
     */
    legacyTime?: Date | undefined;
    /**
     * <p>Public extended access portion of the legacy period, when users should expect higher pricing</p>
     * @public
     */
    publicExtendedAccessTime?: Date | undefined;
}
/**
 * <p>Information about a foundation model.</p>
 * @public
 */
export interface FoundationModelDetails {
    /**
     * <p>The model Amazon Resource Name (ARN).</p>
     * @public
     */
    modelArn: string | undefined;
    /**
     * <p>The model identifier.</p>
     * @public
     */
    modelId: string | undefined;
    /**
     * <p>The model name.</p>
     * @public
     */
    modelName?: string | undefined;
    /**
     * <p>The model's provider name.</p>
     * @public
     */
    providerName?: string | undefined;
    /**
     * <p>The input modalities that the model supports.</p>
     * @public
     */
    inputModalities?: ModelModality[] | undefined;
    /**
     * <p>The output modalities that the model supports.</p>
     * @public
     */
    outputModalities?: ModelModality[] | undefined;
    /**
     * <p>Indicates whether the model supports streaming.</p>
     * @public
     */
    responseStreamingSupported?: boolean | undefined;
    /**
     * <p>The customization that the model supports.</p>
     * @public
     */
    customizationsSupported?: ModelCustomization[] | undefined;
    /**
     * <p>The inference types that the model supports.</p>
     * @public
     */
    inferenceTypesSupported?: InferenceType[] | undefined;
    /**
     * <p>Contains details about whether a model version is available or deprecated</p>
     * @public
     */
    modelLifecycle?: FoundationModelLifecycle | undefined;
}
/**
 * @public
 */
export interface GetFoundationModelResponse {
    /**
     * <p>Information about the foundation model.</p>
     * @public
     */
    modelDetails?: FoundationModelDetails | undefined;
}
/**
 * @public
 */
export interface ListFoundationModelsRequest {
    /**
     * <p>Return models belonging to the model provider that you specify.</p>
     * @public
     */
    byProvider?: string | undefined;
    /**
     * <p>Return models that support the customization type that you specify. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models.html">Custom models</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
     * @public
     */
    byCustomizationType?: ModelCustomization | undefined;
    /**
     * <p>Return models that support the output modality that you specify.</p>
     * @public
     */
    byOutputModality?: ModelModality | undefined;
    /**
     * <p>Return models that support the inference type that you specify. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html">Provisioned Throughput</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
     * @public
     */
    byInferenceType?: InferenceType | undefined;
}
/**
 * <p>Summary information for a foundation model.</p>
 * @public
 */
export interface FoundationModelSummary {
    /**
     * <p>The Amazon Resource Name (ARN) of the foundation model.</p>
     * @public
     */
    modelArn: string | undefined;
    /**
     * <p>The model ID of the foundation model.</p>
     * @public
     */
    modelId: string | undefined;
    /**
     * <p>The name of the model.</p>
     * @public
     */
    modelName?: string | undefined;
    /**
     * <p>The model's provider name.</p>
     * @public
     */
    providerName?: string | undefined;
    /**
     * <p>The input modalities that the model supports.</p>
     * @public
     */
    inputModalities?: ModelModality[] | undefined;
    /**
     * <p>The output modalities that the model supports.</p>
     * @public
     */
    outputModalities?: ModelModality[] | undefined;
    /**
     * <p>Indicates whether the model supports streaming.</p>
     * @public
     */
    responseStreamingSupported?: boolean | undefined;
    /**
     * <p>Whether the model supports fine-tuning or continual pre-training.</p>
     * @public
     */
    customizationsSupported?: ModelCustomization[] | undefined;
    /**
     * <p>The inference types that the model supports.</p>
     * @public
     */
    inferenceTypesSupported?: InferenceType[] | undefined;
    /**
     * <p>Contains details about whether a model version is available or deprecated.</p>
     * @public
     */
    modelLifecycle?: FoundationModelLifecycle | undefined;
}
/**
 * @public
 */
export interface ListFoundationModelsResponse {
    /**
     * <p>A list of Amazon Bedrock foundation models.</p>
     * @public
     */
    modelSummaries?: FoundationModelSummary[] | undefined;
}
/**
 * <p>The target model for a prompt router.</p>
 * @public
 */
export interface PromptRouterTargetModel {
    /**
     * <p>The target model's ARN.</p>
     * @public
     */
    modelArn: string | undefined;
}
/**
 * <p>Routing criteria for a prompt router.</p>
 * @public
 */
export interface RoutingCriteria {
    /**
     * <p>The criteria's response quality difference.</p>
     * @public
     */
    responseQualityDifference: number | undefined;
}
/**
 * @public
 */
export interface CreatePromptRouterRequest {
    /**
     * <p>A unique, case-sensitive identifier that you provide to ensure idempotency of your requests. If not specified, the Amazon Web Services SDK automatically generates one for you.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>The name of the prompt router. The name must be unique within your Amazon Web Services account in the current region.</p>
     * @public
     */
    promptRouterName: string | undefined;
    /**
     * <p>A list of foundation models that the prompt router can route requests to. At least one model must be specified.</p>
     * @public
     */
    models: PromptRouterTargetModel[] | undefined;
    /**
     * <p>An optional description of the prompt router to help identify its purpose.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>The criteria, which is the response quality difference, used to determine how incoming requests are routed to different models.</p>
     * @public
     */
    routingCriteria: RoutingCriteria | undefined;
    /**
     * <p>The default model to use when the routing criteria is not met.</p>
     * @public
     */
    fallbackModel: PromptRouterTargetModel | undefined;
    /**
     * <p>An array of key-value pairs to apply to this resource as tags. You can use tags to categorize and manage your Amazon Web Services resources.</p>
     * @public
     */
    tags?: Tag[] | undefined;
}
/**
 * @public
 */
export interface CreatePromptRouterResponse {
    /**
     * <p>The Amazon Resource Name (ARN) that uniquely identifies the prompt router.</p>
     * @public
     */
    promptRouterArn?: string | undefined;
}
/**
 * @public
 */
export interface DeletePromptRouterRequest {
    /**
     * <p>The Amazon Resource Name (ARN) of the prompt router to delete.</p>
     * @public
     */
    promptRouterArn: string | undefined;
}
/**
 * @public
 */
export interface DeletePromptRouterResponse {
}
/**
 * @public
 */
export interface GetPromptRouterRequest {
    /**
     * <p>The prompt router's ARN</p>
     * @public
     */
    promptRouterArn: string | undefined;
}
/**
 * @public
 */
export interface GetPromptRouterResponse {
    /**
     * <p>The router's name.</p>
     * @public
     */
    promptRouterName: string | undefined;
    /**
     * <p>The router's routing criteria.</p>
     * @public
     */
    routingCriteria: RoutingCriteria | undefined;
    /**
     * <p>The router's description.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>When the router was created.</p>
     * @public
     */
    createdAt?: Date | undefined;
    /**
     * <p>When the router was updated.</p>
     * @public
     */
    updatedAt?: Date | undefined;
    /**
     * <p>The prompt router's ARN</p>
     * @public
     */
    promptRouterArn: string | undefined;
    /**
     * <p>The router's models.</p>
     * @public
     */
    models: PromptRouterTargetModel[] | undefined;
    /**
     * <p>The router's fallback model.</p>
     * @public
     */
    fallbackModel: PromptRouterTargetModel | undefined;
    /**
     * <p>The router's status.</p>
     * @public
     */
    status: PromptRouterStatus | undefined;
    /**
     * <p>The router's type.</p>
     * @public
     */
    type: PromptRouterType | undefined;
}
/**
 * @public
 */
export interface ListPromptRoutersRequest {
    /**
     * <p>The maximum number of prompt routers to return in one page of results.</p>
     * @public
     */
    maxResults?: number | undefined;
    /**
     * <p>Specify the pagination token from a previous request to retrieve the next page of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>The type of the prompt routers, such as whether it's default or custom.</p>
     * @public
     */
    type?: PromptRouterType | undefined;
}
/**
 * <p>Details about a prompt router.</p>
 * @public
 */
export interface PromptRouterSummary {
    /**
     * <p>The router's name.</p>
     * @public
     */
    promptRouterName: string | undefined;
    /**
     * <p>The router's routing criteria.</p>
     * @public
     */
    routingCriteria: RoutingCriteria | undefined;
    /**
     * <p>The router's description.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>When the router was created.</p>
     * @public
     */
    createdAt?: Date | undefined;
    /**
     * <p>When the router was updated.</p>
     * @public
     */
    updatedAt?: Date | undefined;
    /**
     * <p>The router's ARN.</p>
     * @public
     */
    promptRouterArn: string | undefined;
    /**
     * <p>The router's models.</p>
     * @public
     */
    models: PromptRouterTargetModel[] | undefined;
    /**
     * <p>The router's fallback model.</p>
     * @public
     */
    fallbackModel: PromptRouterTargetModel | undefined;
    /**
     * <p>The router's status.</p>
     * @public
     */
    status: PromptRouterStatus | undefined;
    /**
     * <p>The summary's type.</p>
     * @public
     */
    type: PromptRouterType | undefined;
}
/**
 * @public
 */
export interface ListPromptRoutersResponse {
    /**
     * <p>A list of prompt router summaries.</p>
     * @public
     */
    promptRouterSummaries?: PromptRouterSummary[] | undefined;
    /**
     * <p>Specify the pagination token from a previous request to retrieve the next page of results.</p>
     * @public
     */
    nextToken?: string | undefined;
}
/**
 * @public
 */
export interface CreateProvisionedModelThroughputRequest {
    /**
     * <p>A unique, case-sensitive identifier to ensure that the API request completes no more than one time. If this token matches a previous request, Amazon Bedrock ignores the request, but does not return an error. For more information, see <a href="https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Run_Instance_Idempotency.html">Ensuring idempotency</a> in the Amazon S3 User Guide.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>Number of model units to allocate. A model unit delivers a specific throughput level for the specified model. The throughput level of a model unit specifies the total number of input and output tokens that it can process and generate within a span of one minute. By default, your account has no model units for purchasing Provisioned Throughputs with commitment. You must first visit the <a href="https://console.aws.amazon.com/support/home#/case/create?issueType=service-limit-increase">Amazon Web Services support center</a> to request MUs.</p> <p>For model unit quotas, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/quotas.html#prov-thru-quotas">Provisioned Throughput quotas</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p> <p>For more information about what an MU specifies, contact your Amazon Web Services account manager.</p>
     * @public
     */
    modelUnits: number | undefined;
    /**
     * <p>The name for this Provisioned Throughput.</p>
     * @public
     */
    provisionedModelName: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) or name of the model to associate with this Provisioned Throughput. For a list of models for which you can purchase Provisioned Throughput, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/model-ids.html#prov-throughput-models">Amazon Bedrock model IDs for purchasing Provisioned Throughput</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
     * @public
     */
    modelId: string | undefined;
    /**
     * <p>The commitment duration requested for the Provisioned Throughput. Billing occurs hourly and is discounted for longer commitment terms. To request a no-commit Provisioned Throughput, omit this field.</p> <p>Custom models support all levels of commitment. To see which base models support no commitment, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/pt-supported.html">Supported regions and models for Provisioned Throughput</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a> </p>
     * @public
     */
    commitmentDuration?: CommitmentDuration | undefined;
    /**
     * <p>Tags to associate with this Provisioned Throughput.</p>
     * @public
     */
    tags?: Tag[] | undefined;
}
/**
 * @public
 */
export interface CreateProvisionedModelThroughputResponse {
    /**
     * <p>The Amazon Resource Name (ARN) for this Provisioned Throughput.</p>
     * @public
     */
    provisionedModelArn: string | undefined;
}
/**
 * @public
 */
export interface DeleteProvisionedModelThroughputRequest {
    /**
     * <p>The Amazon Resource Name (ARN) or name of the Provisioned Throughput.</p>
     * @public
     */
    provisionedModelId: string | undefined;
}
/**
 * @public
 */
export interface DeleteProvisionedModelThroughputResponse {
}
/**
 * @public
 */
export interface GetProvisionedModelThroughputRequest {
    /**
     * <p>The Amazon Resource Name (ARN) or name of the Provisioned Throughput.</p>
     * @public
     */
    provisionedModelId: string | undefined;
}
/**
 * @public
 */
export interface GetProvisionedModelThroughputResponse {
    /**
     * <p>The number of model units allocated to this Provisioned Throughput.</p>
     * @public
     */
    modelUnits: number | undefined;
    /**
     * <p>The number of model units that was requested for this Provisioned Throughput.</p>
     * @public
     */
    desiredModelUnits: number | undefined;
    /**
     * <p>The name of the Provisioned Throughput.</p>
     * @public
     */
    provisionedModelName: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the Provisioned Throughput.</p>
     * @public
     */
    provisionedModelArn: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the model associated with this Provisioned Throughput.</p>
     * @public
     */
    modelArn: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the model requested to be associated to this Provisioned Throughput. This value differs from the <code>modelArn</code> if updating hasn't completed.</p>
     * @public
     */
    desiredModelArn: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the base model for which the Provisioned Throughput was created, or of the base model that the custom model for which the Provisioned Throughput was created was customized.</p>
     * @public
     */
    foundationModelArn: string | undefined;
    /**
     * <p>The status of the Provisioned Throughput. </p>
     * @public
     */
    status: ProvisionedModelStatus | undefined;
    /**
     * <p>The timestamp of the creation time for this Provisioned Throughput. </p>
     * @public
     */
    creationTime: Date | undefined;
    /**
     * <p>The timestamp of the last time that this Provisioned Throughput was modified. </p>
     * @public
     */
    lastModifiedTime: Date | undefined;
    /**
     * <p>A failure message for any issues that occurred during creation, updating, or deletion of the Provisioned Throughput.</p>
     * @public
     */
    failureMessage?: string | undefined;
    /**
     * <p>Commitment duration of the Provisioned Throughput.</p>
     * @public
     */
    commitmentDuration?: CommitmentDuration | undefined;
    /**
     * <p>The timestamp for when the commitment term for the Provisioned Throughput expires.</p>
     * @public
     */
    commitmentExpirationTime?: Date | undefined;
}
/**
 * @public
 */
export interface ListProvisionedModelThroughputsRequest {
    /**
     * <p>A filter that returns Provisioned Throughputs created after the specified time. </p>
     * @public
     */
    creationTimeAfter?: Date | undefined;
    /**
     * <p>A filter that returns Provisioned Throughputs created before the specified time. </p>
     * @public
     */
    creationTimeBefore?: Date | undefined;
    /**
     * <p>A filter that returns Provisioned Throughputs if their statuses matches the value that you specify.</p>
     * @public
     */
    statusEquals?: ProvisionedModelStatus | undefined;
    /**
     * <p>A filter that returns Provisioned Throughputs whose model Amazon Resource Name (ARN) is equal to the value that you specify.</p>
     * @public
     */
    modelArnEquals?: string | undefined;
    /**
     * <p>A filter that returns Provisioned Throughputs if their name contains the expression that you specify.</p>
     * @public
     */
    nameContains?: string | undefined;
    /**
     * <p>THe maximum number of results to return in the response. If there are more results than the number you specified, the response returns a <code>nextToken</code> value. To see the next batch of results, send the <code>nextToken</code> value in another list request.</p>
     * @public
     */
    maxResults?: number | undefined;
    /**
     * <p>If there are more results than the number you specified in the <code>maxResults</code> field, the response returns a <code>nextToken</code> value. To see the next batch of results, specify the <code>nextToken</code> value in this field.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>The field by which to sort the returned list of Provisioned Throughputs.</p>
     * @public
     */
    sortBy?: SortByProvisionedModels | undefined;
    /**
     * <p>The sort order of the results.</p>
     * @public
     */
    sortOrder?: SortOrder | undefined;
}
/**
 * <p>A summary of information about a Provisioned Throughput.</p> <p>This data type is used in the following API operations:</p> <ul> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListProvisionedModelThroughputs.html#API_ListProvisionedModelThroughputs_ResponseSyntax">ListProvisionedThroughputs response</a> </p> </li> </ul>
 * @public
 */
export interface ProvisionedModelSummary {
    /**
     * <p>The name of the Provisioned Throughput.</p>
     * @public
     */
    provisionedModelName: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the Provisioned Throughput.</p>
     * @public
     */
    provisionedModelArn: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the model associated with the Provisioned Throughput.</p>
     * @public
     */
    modelArn: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the model requested to be associated to this Provisioned Throughput. This value differs from the <code>modelArn</code> if updating hasn't completed.</p>
     * @public
     */
    desiredModelArn: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the base model for which the Provisioned Throughput was created, or of the base model that the custom model for which the Provisioned Throughput was created was customized.</p>
     * @public
     */
    foundationModelArn: string | undefined;
    /**
     * <p>The number of model units allocated to the Provisioned Throughput.</p>
     * @public
     */
    modelUnits: number | undefined;
    /**
     * <p>The number of model units that was requested to be allocated to the Provisioned Throughput.</p>
     * @public
     */
    desiredModelUnits: number | undefined;
    /**
     * <p>The status of the Provisioned Throughput.</p>
     * @public
     */
    status: ProvisionedModelStatus | undefined;
    /**
     * <p>The duration for which the Provisioned Throughput was committed.</p>
     * @public
     */
    commitmentDuration?: CommitmentDuration | undefined;
    /**
     * <p>The timestamp for when the commitment term of the Provisioned Throughput expires.</p>
     * @public
     */
    commitmentExpirationTime?: Date | undefined;
    /**
     * <p>The time that the Provisioned Throughput was created. </p>
     * @public
     */
    creationTime: Date | undefined;
    /**
     * <p>The time that the Provisioned Throughput was last modified. </p>
     * @public
     */
    lastModifiedTime: Date | undefined;
}
/**
 * @public
 */
export interface ListProvisionedModelThroughputsResponse {
    /**
     * <p>If there are more results than the number you specified in the <code>maxResults</code> field, this value is returned. To see the next batch of results, include this value in the <code>nextToken</code> field in another list request.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>A list of summaries, one for each Provisioned Throughput in the response.</p>
     * @public
     */
    provisionedModelSummaries?: ProvisionedModelSummary[] | undefined;
}
/**
 * @public
 */
export interface UpdateProvisionedModelThroughputRequest {
    /**
     * <p>The Amazon Resource Name (ARN) or name of the Provisioned Throughput to update.</p>
     * @public
     */
    provisionedModelId: string | undefined;
    /**
     * <p>The new name for this Provisioned Throughput.</p>
     * @public
     */
    desiredProvisionedModelName?: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the new model to associate with this Provisioned Throughput. You can't specify this field if this Provisioned Throughput is associated with a base model.</p> <p>If this Provisioned Throughput is associated with a custom model, you can specify one of the following options:</p> <ul> <li> <p>The base model from which the custom model was customized.</p> </li> <li> <p>Another custom model that was customized from the same base model as the custom model.</p> </li> </ul>
     * @public
     */
    desiredModelId?: string | undefined;
}
/**
 * @public
 */
export interface UpdateProvisionedModelThroughputResponse {
}
/**
 * @public
 */
export interface DeleteResourcePolicyRequest {
    /**
     * <p>The ARN of the Bedrock resource to which this resource policy applies.</p>
     * @public
     */
    resourceArn: string | undefined;
}
/**
 * @public
 */
export interface DeleteResourcePolicyResponse {
}
/**
 * @public
 */
export interface GetResourcePolicyRequest {
    /**
     * <p>The ARN of the Bedrock resource to which this resource policy applies.</p>
     * @public
     */
    resourceArn: string | undefined;
}
/**
 * @public
 */
export interface GetResourcePolicyResponse {
    /**
     * <p>The JSON string representing the Bedrock resource policy.</p>
     * @public
     */
    resourcePolicy?: string | undefined;
}
/**
 * @public
 */
export interface PutResourcePolicyRequest {
    /**
     * <p>The ARN of the Bedrock resource to which this resource policy applies.</p>
     * @public
     */
    resourceArn: string | undefined;
    /**
     * <p>The JSON string representing the Bedrock resource policy.</p>
     * @public
     */
    resourcePolicy: string | undefined;
}
/**
 * @public
 */
export interface PutResourcePolicyResponse {
    /**
     * <p>The ARN of the Bedrock resource to which this resource policy applies.</p>
     * @public
     */
    resourceArn?: string | undefined;
}
/**
 * @public
 */
export interface CreateFoundationModelAgreementRequest {
    /**
     * <p>An offer token encapsulates the information for an offer.</p>
     * @public
     */
    offerToken: string | undefined;
    /**
     * <p>Model Id of the model for the access request.</p>
     * @public
     */
    modelId: string | undefined;
}
/**
 * @public
 */
export interface CreateFoundationModelAgreementResponse {
    /**
     * <p>Model Id of the model for the access request.</p>
     * @public
     */
    modelId: string | undefined;
}
/**
 * @public
 */
export interface DeleteFoundationModelAgreementRequest {
    /**
     * <p>Model Id of the model access to delete.</p>
     * @public
     */
    modelId: string | undefined;
}
/**
 * @public
 */
export interface DeleteFoundationModelAgreementResponse {
}
/**
 * @public
 */
export interface GetFoundationModelAvailabilityRequest {
    /**
     * <p>The model Id of the foundation model.</p>
     * @public
     */
    modelId: string | undefined;
}
/**
 * @public
 */
export interface GetFoundationModelAvailabilityResponse {
    /**
     * <p>The model Id of the foundation model.</p>
     * @public
     */
    modelId: string | undefined;
    /**
     * <p>Agreement availability. </p>
     * @public
     */
    agreementAvailability: AgreementAvailability | undefined;
    /**
     * <p>Authorization status.</p>
     * @public
     */
    authorizationStatus: AuthorizationStatus | undefined;
    /**
     * <p>Entitlement availability. </p>
     * @public
     */
    entitlementAvailability: EntitlementAvailability | undefined;
    /**
     * <p>Region availability. </p>
     * @public
     */
    regionAvailability: RegionAvailability | undefined;
}
/**
 * @public
 */
export interface ListFoundationModelAgreementOffersRequest {
    /**
     * <p>Model Id of the foundation model.</p>
     * @public
     */
    modelId: string | undefined;
    /**
     * <p>Type of offer associated with the model.</p>
     * @public
     */
    offerType?: OfferType | undefined;
}
/**
 * <p>The legal term of the agreement.</p>
 * @public
 */
export interface LegalTerm {
    /**
     * <p>URL to the legal term document.</p>
     * @public
     */
    url?: string | undefined;
}
/**
 * <p>Describes a support term.</p>
 * @public
 */
export interface SupportTerm {
    /**
     * <p>Describes the refund policy.</p>
     * @public
     */
    refundPolicyDescription?: string | undefined;
}
/**
 * <p>Dimensional price rate.</p>
 * @public
 */
export interface DimensionalPriceRate {
    /**
     * <p>Dimension for the price rate.</p>
     * @public
     */
    dimension?: string | undefined;
    /**
     * <p>Single-dimensional rate information.</p>
     * @public
     */
    price?: string | undefined;
    /**
     * <p>Description of the price rate.</p>
     * @public
     */
    description?: string | undefined;
    /**
     * <p>Unit associated with the price.</p>
     * @public
     */
    unit?: string | undefined;
}
/**
 * <p>Describes the usage-based pricing term.</p>
 * @public
 */
export interface PricingTerm {
    /**
     * <p>Describes a usage price for each dimension.</p>
     * @public
     */
    rateCard: DimensionalPriceRate[] | undefined;
}
/**
 * <p>Describes the validity terms.</p>
 * @public
 */
export interface ValidityTerm {
    /**
     * <p>Describes the agreement duration.</p>
     * @public
     */
    agreementDuration?: string | undefined;
}
/**
 * <p>Describes the usage terms of an offer.</p>
 * @public
 */
export interface TermDetails {
    /**
     * <p>Describes the usage-based pricing term.</p>
     * @public
     */
    usageBasedPricingTerm: PricingTerm | undefined;
    /**
     * <p>Describes the legal terms.</p>
     * @public
     */
    legalTerm: LegalTerm | undefined;
    /**
     * <p>Describes the support terms.</p>
     * @public
     */
    supportTerm: SupportTerm | undefined;
    /**
     * <p>Describes the validity terms.</p>
     * @public
     */
    validityTerm?: ValidityTerm | undefined;
}
/**
 * <p>An offer dictates usage terms for the model.</p>
 * @public
 */
export interface Offer {
    /**
     * <p>Offer Id for a model offer.</p>
     * @public
     */
    offerId?: string | undefined;
    /**
     * <p>Offer token.</p>
     * @public
     */
    offerToken: string | undefined;
    /**
     * <p>Details about the terms of the offer.</p>
     * @public
     */
    termDetails: TermDetails | undefined;
}
/**
 * @public
 */
export interface ListFoundationModelAgreementOffersResponse {
    /**
     * <p>Model Id of the foundation model.</p>
     * @public
     */
    modelId: string | undefined;
    /**
     * <p>List of the offers associated with the specified model.</p>
     * @public
     */
    offers: Offer[] | undefined;
}
/**
 * @public
 */
export interface ListTagsForResourceRequest {
    /**
     * <p>The Amazon Resource Name (ARN) of the resource.</p>
     * @public
     */
    resourceARN: string | undefined;
}
/**
 * @public
 */
export interface ListTagsForResourceResponse {
    /**
     * <p>An array of the tags associated with this resource.</p>
     * @public
     */
    tags?: Tag[] | undefined;
}
/**
 * @public
 */
export interface TagResourceRequest {
    /**
     * <p>The Amazon Resource Name (ARN) of the resource to tag.</p>
     * @public
     */
    resourceARN: string | undefined;
    /**
     * <p>Tags to associate with the resource.</p>
     * @public
     */
    tags: Tag[] | undefined;
}
/**
 * @public
 */
export interface TagResourceResponse {
}
/**
 * @public
 */
export interface UntagResourceRequest {
    /**
     * <p>The Amazon Resource Name (ARN) of the resource to untag.</p>
     * @public
     */
    resourceARN: string | undefined;
    /**
     * <p>Tag keys of the tags to remove from the resource.</p>
     * @public
     */
    tagKeys: string[] | undefined;
}
/**
 * @public
 */
export interface UntagResourceResponse {
}
/**
 * @public
 */
export interface CreateModelCustomizationJobRequest {
    /**
     * <p>A name for the fine-tuning job.</p>
     * @public
     */
    jobName: string | undefined;
    /**
     * <p>A name for the resulting custom model.</p>
     * @public
     */
    customModelName: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of an IAM service role that Amazon Bedrock can assume to perform tasks on your behalf. For example, during model training, Amazon Bedrock needs your permission to read input data from an S3 bucket, write model artifacts to an S3 bucket. To pass this role to Amazon Bedrock, the caller of this API must have the <code>iam:PassRole</code> permission. </p>
     * @public
     */
    roleArn: string | undefined;
    /**
     * <p>A unique, case-sensitive identifier to ensure that the API request completes no more than one time. If this token matches a previous request, Amazon Bedrock ignores the request, but does not return an error. For more information, see <a href="https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Run_Instance_Idempotency.html">Ensuring idempotency</a>.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>Name of the base model.</p>
     * @public
     */
    baseModelIdentifier: string | undefined;
    /**
     * <p>The customization type.</p>
     * @public
     */
    customizationType?: CustomizationType | undefined;
    /**
     * <p>The custom model is encrypted at rest using this key.</p>
     * @public
     */
    customModelKmsKeyId?: string | undefined;
    /**
     * <p>Tags to attach to the job.</p>
     * @public
     */
    jobTags?: Tag[] | undefined;
    /**
     * <p>Tags to attach to the resulting custom model.</p>
     * @public
     */
    customModelTags?: Tag[] | undefined;
    /**
     * <p>Information about the training dataset.</p>
     * @public
     */
    trainingDataConfig: TrainingDataConfig | undefined;
    /**
     * <p>Information about the validation dataset. </p>
     * @public
     */
    validationDataConfig?: ValidationDataConfig | undefined;
    /**
     * <p>S3 location for the output data.</p>
     * @public
     */
    outputDataConfig: OutputDataConfig | undefined;
    /**
     * <p>Parameters related to tuning the model. For details on the format for different models, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models-hp.html">Custom model hyperparameters</a>.</p>
     * @public
     */
    hyperParameters?: Record<string, string> | undefined;
    /**
     * <p>The configuration of the Virtual Private Cloud (VPC) that contains the resources that you're using for this job. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/vpc-model-customization.html">Protect your model customization jobs using a VPC</a>.</p>
     * @public
     */
    vpcConfig?: VpcConfig | undefined;
    /**
     * <p>The customization configuration for the model customization job.</p>
     * @public
     */
    customizationConfig?: CustomizationConfig | undefined;
}
/**
 * @public
 */
export interface CreateModelCustomizationJobResponse {
    /**
     * <p>Amazon Resource Name (ARN) of the fine tuning job</p>
     * @public
     */
    jobArn: string | undefined;
}
/**
 * @public
 */
export interface GetModelCustomizationJobRequest {
    /**
     * <p>Identifier for the customization job.</p>
     * @public
     */
    jobIdentifier: string | undefined;
}
/**
 * <p>For a Distillation job, the status details for the data processing sub-task of the job.</p>
 * @public
 */
export interface DataProcessingDetails {
    /**
     * <p>The status of the data processing sub-task of the job.</p>
     * @public
     */
    status?: JobStatusDetails | undefined;
    /**
     * <p>The start time of the data processing sub-task of the job.</p>
     * @public
     */
    creationTime?: Date | undefined;
    /**
     * <p>The latest update to the data processing sub-task of the job.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
}
/**
 * <p>For a Distillation job, the status details for the training sub-task of the job.</p>
 * @public
 */
export interface TrainingDetails {
    /**
     * <p>The status of the training sub-task of the job.</p>
     * @public
     */
    status?: JobStatusDetails | undefined;
    /**
     * <p>The start time of the training sub-task of the job.</p>
     * @public
     */
    creationTime?: Date | undefined;
    /**
     * <p>The latest update to the training sub-task of the job.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
}
/**
 * <p>For a Distillation job, the status details for the validation sub-task of the job.</p>
 * @public
 */
export interface ValidationDetails {
    /**
     * <p>The status of the validation sub-task of the job.</p>
     * @public
     */
    status?: JobStatusDetails | undefined;
    /**
     * <p>The start time of the validation sub-task of the job.</p>
     * @public
     */
    creationTime?: Date | undefined;
    /**
     * <p>The latest update to the validation sub-task of the job.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
}
/**
 * <p>For a Distillation job, the status details for sub-tasks of the job. Possible statuses for each sub-task include the following:</p> <ul> <li> <p>NotStarted</p> </li> <li> <p>InProgress</p> </li> <li> <p>Completed</p> </li> <li> <p>Stopping</p> </li> <li> <p>Stopped</p> </li> <li> <p>Failed</p> </li> </ul>
 * @public
 */
export interface StatusDetails {
    /**
     * <p>The status details for the validation sub-task of the job.</p>
     * @public
     */
    validationDetails?: ValidationDetails | undefined;
    /**
     * <p>The status details for the data processing sub-task of the job.</p>
     * @public
     */
    dataProcessingDetails?: DataProcessingDetails | undefined;
    /**
     * <p>The status details for the training sub-task of the job.</p>
     * @public
     */
    trainingDetails?: TrainingDetails | undefined;
}
/**
 * @public
 */
export interface GetModelCustomizationJobResponse {
    /**
     * <p>The Amazon Resource Name (ARN) of the customization job.</p>
     * @public
     */
    jobArn: string | undefined;
    /**
     * <p>The name of the customization job.</p>
     * @public
     */
    jobName: string | undefined;
    /**
     * <p>The name of the output model.</p>
     * @public
     */
    outputModelName: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the output model.</p>
     * @public
     */
    outputModelArn?: string | undefined;
    /**
     * <p>The token that you specified in the <code>CreateCustomizationJob</code> request.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the IAM role.</p>
     * @public
     */
    roleArn: string | undefined;
    /**
     * <p>The status of the job. A successful job transitions from in-progress to completed when the output model is ready to use. If the job failed, the failure message contains information about why the job failed.</p>
     * @public
     */
    status?: ModelCustomizationJobStatus | undefined;
    /**
     * <p>For a Distillation job, the details about the statuses of the sub-tasks of the customization job. </p>
     * @public
     */
    statusDetails?: StatusDetails | undefined;
    /**
     * <p>Information about why the job failed.</p>
     * @public
     */
    failureMessage?: string | undefined;
    /**
     * <p>Time that the resource was created.</p>
     * @public
     */
    creationTime: Date | undefined;
    /**
     * <p>Time that the resource was last modified.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
    /**
     * <p>Time that the resource transitioned to terminal state.</p>
     * @public
     */
    endTime?: Date | undefined;
    /**
     * <p>Amazon Resource Name (ARN) of the base model.</p>
     * @public
     */
    baseModelArn: string | undefined;
    /**
     * <p>The hyperparameter values for the job. For details on the format for different models, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models-hp.html">Custom model hyperparameters</a>.</p>
     * @public
     */
    hyperParameters?: Record<string, string> | undefined;
    /**
     * <p>Contains information about the training dataset.</p>
     * @public
     */
    trainingDataConfig: TrainingDataConfig | undefined;
    /**
     * <p>Contains information about the validation dataset.</p>
     * @public
     */
    validationDataConfig: ValidationDataConfig | undefined;
    /**
     * <p>Output data configuration </p>
     * @public
     */
    outputDataConfig: OutputDataConfig | undefined;
    /**
     * <p>The type of model customization.</p>
     * @public
     */
    customizationType?: CustomizationType | undefined;
    /**
     * <p>The custom model is encrypted at rest using this key.</p>
     * @public
     */
    outputModelKmsKeyArn?: string | undefined;
    /**
     * <p>Contains training metrics from the job creation.</p>
     * @public
     */
    trainingMetrics?: TrainingMetrics | undefined;
    /**
     * <p>The loss metric for each validator that you provided in the createjob request.</p>
     * @public
     */
    validationMetrics?: ValidatorMetric[] | undefined;
    /**
     * <p>VPC configuration for the custom model job.</p>
     * @public
     */
    vpcConfig?: VpcConfig | undefined;
    /**
     * <p>The customization configuration for the model customization job.</p>
     * @public
     */
    customizationConfig?: CustomizationConfig | undefined;
}
/**
 * @public
 */
export interface ListModelCustomizationJobsRequest {
    /**
     * <p>Return customization jobs created after the specified time. </p>
     * @public
     */
    creationTimeAfter?: Date | undefined;
    /**
     * <p>Return customization jobs created before the specified time. </p>
     * @public
     */
    creationTimeBefore?: Date | undefined;
    /**
     * <p>Return customization jobs with the specified status. </p>
     * @public
     */
    statusEquals?: FineTuningJobStatus | undefined;
    /**
     * <p>Return customization jobs only if the job name contains these characters.</p>
     * @public
     */
    nameContains?: string | undefined;
    /**
     * <p>The maximum number of results to return in the response. If the total number of results is greater than this value, use the token returned in the response in the <code>nextToken</code> field when making another request to return the next batch of results.</p>
     * @public
     */
    maxResults?: number | undefined;
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, enter the token returned in the <code>nextToken</code> field in the response in this field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>The field to sort by in the returned list of jobs.</p>
     * @public
     */
    sortBy?: SortJobsBy | undefined;
    /**
     * <p>The sort order of the results.</p>
     * @public
     */
    sortOrder?: SortOrder | undefined;
}
/**
 * <p>Information about one customization job</p>
 * @public
 */
export interface ModelCustomizationJobSummary {
    /**
     * <p>Amazon Resource Name (ARN) of the customization job.</p>
     * @public
     */
    jobArn: string | undefined;
    /**
     * <p>Amazon Resource Name (ARN) of the base model.</p>
     * @public
     */
    baseModelArn: string | undefined;
    /**
     * <p>Name of the customization job.</p>
     * @public
     */
    jobName: string | undefined;
    /**
     * <p>Status of the customization job. </p>
     * @public
     */
    status: ModelCustomizationJobStatus | undefined;
    /**
     * <p>Details about the status of the data processing sub-task of the job.</p>
     * @public
     */
    statusDetails?: StatusDetails | undefined;
    /**
     * <p>Time that the customization job was last modified.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
    /**
     * <p>Creation time of the custom model. </p>
     * @public
     */
    creationTime: Date | undefined;
    /**
     * <p>Time that the customization job ended.</p>
     * @public
     */
    endTime?: Date | undefined;
    /**
     * <p>Amazon Resource Name (ARN) of the custom model.</p>
     * @public
     */
    customModelArn?: string | undefined;
    /**
     * <p>Name of the custom model.</p>
     * @public
     */
    customModelName?: string | undefined;
    /**
     * <p>Specifies whether to carry out continued pre-training of a model or whether to fine-tune it. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models.html">Custom models</a>.</p>
     * @public
     */
    customizationType?: CustomizationType | undefined;
}
/**
 * @public
 */
export interface ListModelCustomizationJobsResponse {
    /**
     * <p>If the total number of results is greater than the <code>maxResults</code> value provided in the request, use this token when making another request in the <code>nextToken</code> field to return the next batch of results.</p>
     * @public
     */
    nextToken?: string | undefined;
    /**
     * <p>Job summaries.</p>
     * @public
     */
    modelCustomizationJobSummaries?: ModelCustomizationJobSummary[] | undefined;
}
/**
 * @public
 */
export interface StopModelCustomizationJobRequest {
    /**
     * <p>Job identifier of the job to stop.</p>
     * @public
     */
    jobIdentifier: string | undefined;
}
/**
 * @public
 */
export interface StopModelCustomizationJobResponse {
}
/**
 * <p>Specifies the filters to use on the metadata attributes/fields in the knowledge base data sources before returning results.</p>
 * @public
 */
export type RetrievalFilter = RetrievalFilter.AndAllMember | RetrievalFilter.EqualsMember | RetrievalFilter.GreaterThanMember | RetrievalFilter.GreaterThanOrEqualsMember | RetrievalFilter.InMember | RetrievalFilter.LessThanMember | RetrievalFilter.LessThanOrEqualsMember | RetrievalFilter.ListContainsMember | RetrievalFilter.NotEqualsMember | RetrievalFilter.NotInMember | RetrievalFilter.OrAllMember | RetrievalFilter.StartsWithMember | RetrievalFilter.StringContainsMember | RetrievalFilter.$UnknownMember;
/**
 * @public
 */
export declare namespace RetrievalFilter {
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value matches the value in this object.</p> <p>The following example would return data sources with an animal attribute whose value is 'cat': <code>"equals": \{ "key": "animal", "value": "cat" \}</code> </p>
     * @public
     */
    interface EqualsMember {
        equals: FilterAttribute;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources that contain a metadata attribute whose name matches the key and whose value doesn't match the value in this object are returned.</p> <p>The following example would return data sources that don't contain an animal attribute whose value is 'cat': <code>"notEquals": \{ "key": "animal", "value": "cat" \}</code> </p>
     * @public
     */
    interface NotEqualsMember {
        equals?: never;
        notEquals: FilterAttribute;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value is greater than the value in this object.</p> <p>The following example would return data sources with an year attribute whose value is greater than '1989': <code>"greaterThan": \{ "key": "year", "value": 1989 \}</code> </p>
     * @public
     */
    interface GreaterThanMember {
        equals?: never;
        notEquals?: never;
        greaterThan: FilterAttribute;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value is greater than or equal to the value in this object.</p> <p>The following example would return data sources with an year attribute whose value is greater than or equal to '1989': <code>"greaterThanOrEquals": \{ "key": "year", "value": 1989 \}</code> </p>
     * @public
     */
    interface GreaterThanOrEqualsMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals: FilterAttribute;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value is less than the value in this object.</p> <p>The following example would return data sources with an year attribute whose value is less than to '1989': <code>"lessThan": \{ "key": "year", "value": 1989 \}</code> </p>
     * @public
     */
    interface LessThanMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan: FilterAttribute;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value is less than or equal to the value in this object.</p> <p>The following example would return data sources with an year attribute whose value is less than or equal to '1989': <code>"lessThanOrEquals": \{ "key": "year", "value": 1989 \}</code> </p>
     * @public
     */
    interface LessThanOrEqualsMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals: FilterAttribute;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value is in the list specified in the value in this object.</p> <p>The following example would return data sources with an animal attribute that is either 'cat' or 'dog': <code>"in": \{ "key": "animal", "value": ["cat", "dog"] \}</code> </p>
     * @public
     */
    interface InMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in: FilterAttribute;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value isn't in the list specified in the value in this object.</p> <p>The following example would return data sources whose animal attribute is neither 'cat' nor 'dog': <code>"notIn": \{ "key": "animal", "value": ["cat", "dog"] \}</code> </p>
     * @public
     */
    interface NotInMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn: FilterAttribute;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value starts with the value in this object. This filter is currently only supported for Amazon OpenSearch Serverless vector stores.</p> <p>The following example would return data sources with an animal attribute starts with 'ca' (for example, 'cat' or 'camel'). <code>"startsWith": \{ "key": "animal", "value": "ca" \}</code> </p>
     * @public
     */
    interface StartsWithMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith: FilterAttribute;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value is a list that contains the value as one of its members.</p> <p>The following example would return data sources with an animals attribute that is a list containing a cat member (for example, <code>["dog", "cat"]</code>): <code>"listContains": \{ "key": "animals", "value": "cat" \}</code> </p>
     * @public
     */
    interface ListContainsMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains: FilterAttribute;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if they contain a metadata attribute whose name matches the key and whose value is one of the following:</p> <p>A string that contains the value as a substring. The following example would return data sources with an animal attribute that contains the substring at (for example, 'cat'): <code>"stringContains": \{ "key": "animal", "value": "at" \}</code> </p> <p>A list with a member that contains the value as a substring. The following example would return data sources with an animals attribute that is a list containing a member that contains the substring at (for example, <code>["dog", "cat"]</code>): <code>"stringContains": \{ "key": "animals", "value": "at" \}</code> </p>
     * @public
     */
    interface StringContainsMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains: FilterAttribute;
        andAll?: never;
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if their metadata attributes fulfill all the filter conditions inside this list.</p>
     * @public
     */
    interface AndAllMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll: RetrievalFilter[];
        orAll?: never;
        $unknown?: never;
    }
    /**
     * <p>Knowledge base data sources are returned if their metadata attributes fulfill at least one of the filter conditions inside this list.</p>
     * @public
     */
    interface OrAllMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll: RetrievalFilter[];
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        equals?: never;
        notEquals?: never;
        greaterThan?: never;
        greaterThanOrEquals?: never;
        lessThan?: never;
        lessThanOrEquals?: never;
        in?: never;
        notIn?: never;
        startsWith?: never;
        listContains?: never;
        stringContains?: never;
        andAll?: never;
        orAll?: never;
        $unknown: [string, any];
    }
    /**
     * @deprecated unused in schema-serde mode.
     *
     */
    interface Visitor<T> {
        equals: (value: FilterAttribute) => T;
        notEquals: (value: FilterAttribute) => T;
        greaterThan: (value: FilterAttribute) => T;
        greaterThanOrEquals: (value: FilterAttribute) => T;
        lessThan: (value: FilterAttribute) => T;
        lessThanOrEquals: (value: FilterAttribute) => T;
        in: (value: FilterAttribute) => T;
        notIn: (value: FilterAttribute) => T;
        startsWith: (value: FilterAttribute) => T;
        listContains: (value: FilterAttribute) => T;
        stringContains: (value: FilterAttribute) => T;
        andAll: (value: RetrievalFilter[]) => T;
        orAll: (value: RetrievalFilter[]) => T;
        _: (name: string, value: any) => T;
    }
}
/**
 * <p>The configuration details for returning the results from the knowledge base vector search.</p>
 * @public
 */
export interface KnowledgeBaseVectorSearchConfiguration {
    /**
     * <p>The number of text chunks to retrieve; the number of results to return.</p>
     * @public
     */
    numberOfResults?: number | undefined;
    /**
     * <p>By default, Amazon Bedrock decides a search strategy for you. If you're using an Amazon OpenSearch Serverless vector store that contains a filterable text field, you can specify whether to query the knowledge base with a <code>HYBRID</code> search using both vector embeddings and raw text, or <code>SEMANTIC</code> search using only vector embeddings. For other vector store configurations, only <code>SEMANTIC</code> search is available.</p>
     * @public
     */
    overrideSearchType?: SearchType | undefined;
    /**
     * <p>Specifies the filters to use on the metadata fields in the knowledge base data sources before returning results.</p>
     * @public
     */
    filter?: RetrievalFilter | undefined;
    /**
     * <p>Configuration for implicit filtering in Knowledge Base vector searches. This allows the system to automatically apply filters based on the query context without requiring explicit filter expressions.</p>
     * @public
     */
    implicitFilterConfiguration?: ImplicitFilterConfiguration | undefined;
    /**
     * <p>Configuration for reranking search results in Knowledge Base vector searches. Reranking improves search relevance by reordering initial vector search results using more sophisticated relevance models.</p>
     * @public
     */
    rerankingConfiguration?: VectorSearchRerankingConfiguration | undefined;
}
/**
 * <p>Contains configuration details for retrieving information from a knowledge base.</p>
 * @public
 */
export interface KnowledgeBaseRetrievalConfiguration {
    /**
     * <p>Contains configuration details for returning the results from the vector search.</p>
     * @public
     */
    vectorSearchConfiguration: KnowledgeBaseVectorSearchConfiguration | undefined;
}
/**
 * <p>Contains configuration details for retrieving information from a knowledge base and generating responses.</p>
 * @public
 */
export interface KnowledgeBaseRetrieveAndGenerateConfiguration {
    /**
     * <p>The unique identifier of the knowledge base.</p>
     * @public
     */
    knowledgeBaseId: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the foundation model or <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html">inference profile</a> used to generate responses.</p>
     * @public
     */
    modelArn: string | undefined;
    /**
     * <p>Contains configuration details for retrieving text chunks.</p>
     * @public
     */
    retrievalConfiguration?: KnowledgeBaseRetrievalConfiguration | undefined;
    /**
     * <p>Contains configurations details for response generation based on retrieved text chunks.</p>
     * @public
     */
    generationConfiguration?: GenerationConfiguration | undefined;
    /**
     * <p>Contains configuration details for the model to process the prompt prior to retrieval and response generation.</p>
     * @public
     */
    orchestrationConfiguration?: OrchestrationConfiguration | undefined;
}
/**
 * <p>The configuration details for retrieving information from a knowledge base.</p>
 * @public
 */
export interface RetrieveConfig {
    /**
     * <p>The unique identifier of the knowledge base.</p>
     * @public
     */
    knowledgeBaseId: string | undefined;
    /**
     * <p>Contains configuration details for knowledge base retrieval.</p>
     * @public
     */
    knowledgeBaseRetrievalConfiguration: KnowledgeBaseRetrievalConfiguration | undefined;
}
/**
 * <p>Contains configuration details for a knowledge base retrieval and response generation.</p>
 * @public
 */
export interface RetrieveAndGenerateConfiguration {
    /**
     * <p>The type of resource that contains your data for retrieving information and generating responses.</p> <p>If you choose to use <code>EXTERNAL_SOURCES</code>, then currently only Claude 3 Sonnet models for knowledge bases are supported.</p>
     * @public
     */
    type: RetrieveAndGenerateType | undefined;
    /**
     * <p>Contains configuration details for the knowledge base retrieval and response generation.</p>
     * @public
     */
    knowledgeBaseConfiguration?: KnowledgeBaseRetrieveAndGenerateConfiguration | undefined;
    /**
     * <p>The configuration for the external source wrapper object in the <code>retrieveAndGenerate</code> function.</p>
     * @public
     */
    externalSourcesConfiguration?: ExternalSourcesRetrieveAndGenerateConfiguration | undefined;
}
/**
 * <p>The configuration details for retrieving information from a knowledge base and generating responses.</p>
 * @public
 */
export type KnowledgeBaseConfig = KnowledgeBaseConfig.RetrieveAndGenerateConfigMember | KnowledgeBaseConfig.RetrieveConfigMember | KnowledgeBaseConfig.$UnknownMember;
/**
 * @public
 */
export declare namespace KnowledgeBaseConfig {
    /**
     * <p>Contains configuration details for retrieving information from a knowledge base.</p>
     * @public
     */
    interface RetrieveConfigMember {
        retrieveConfig: RetrieveConfig;
        retrieveAndGenerateConfig?: never;
        $unknown?: never;
    }
    /**
     * <p>Contains configuration details for retrieving information from a knowledge base and generating responses.</p>
     * @public
     */
    interface RetrieveAndGenerateConfigMember {
        retrieveConfig?: never;
        retrieveAndGenerateConfig: RetrieveAndGenerateConfiguration;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        retrieveConfig?: never;
        retrieveAndGenerateConfig?: never;
        $unknown: [string, any];
    }
    /**
     * @deprecated unused in schema-serde mode.
     *
     */
    interface Visitor<T> {
        retrieveConfig: (value: RetrieveConfig) => T;
        retrieveAndGenerateConfig: (value: RetrieveAndGenerateConfiguration) => T;
        _: (name: string, value: any) => T;
    }
}
/**
 * <p>Contains configuration details for retrieval of information and response generation.</p>
 * @public
 */
export type RAGConfig = RAGConfig.KnowledgeBaseConfigMember | RAGConfig.PrecomputedRagSourceConfigMember | RAGConfig.$UnknownMember;
/**
 * @public
 */
export declare namespace RAGConfig {
    /**
     * <p>Contains configuration details for knowledge base retrieval and response generation.</p>
     * @public
     */
    interface KnowledgeBaseConfigMember {
        knowledgeBaseConfig: KnowledgeBaseConfig;
        precomputedRagSourceConfig?: never;
        $unknown?: never;
    }
    /**
     * <p>Contains configuration details about the RAG source used to generate inference response data for a Knowledge Base evaluation job.</p>
     * @public
     */
    interface PrecomputedRagSourceConfigMember {
        knowledgeBaseConfig?: never;
        precomputedRagSourceConfig: EvaluationPrecomputedRagSourceConfig;
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        knowledgeBaseConfig?: never;
        precomputedRagSourceConfig?: never;
        $unknown: [string, any];
    }
    /**
     * @deprecated unused in schema-serde mode.
     *
     */
    interface Visitor<T> {
        knowledgeBaseConfig: (value: KnowledgeBaseConfig) => T;
        precomputedRagSourceConfig: (value: EvaluationPrecomputedRagSourceConfig) => T;
        _: (name: string, value: any) => T;
    }
}
/**
 * <p>The configuration details of the inference model for an evaluation job.</p> <p>For automated model evaluation jobs, only a single model is supported.</p> <p>For human-based model evaluation jobs, your annotator can compare the responses for up to two different models.</p>
 * @public
 */
export type EvaluationInferenceConfig = EvaluationInferenceConfig.ModelsMember | EvaluationInferenceConfig.RagConfigsMember | EvaluationInferenceConfig.$UnknownMember;
/**
 * @public
 */
export declare namespace EvaluationInferenceConfig {
    /**
     * <p>Specifies the inference models.</p>
     * @public
     */
    interface ModelsMember {
        models: EvaluationModelConfig[];
        ragConfigs?: never;
        $unknown?: never;
    }
    /**
     * <p>Contains the configuration details of the inference for a knowledge base evaluation job, including either the retrieval only configuration or the retrieval with response generation configuration.</p>
     * @public
     */
    interface RagConfigsMember {
        models?: never;
        ragConfigs: RAGConfig[];
        $unknown?: never;
    }
    /**
     * @public
     */
    interface $UnknownMember {
        models?: never;
        ragConfigs?: never;
        $unknown: [string, any];
    }
    /**
     * @deprecated unused in schema-serde mode.
     *
     */
    interface Visitor<T> {
        models: (value: EvaluationModelConfig[]) => T;
        ragConfigs: (value: RAGConfig[]) => T;
        _: (name: string, value: any) => T;
    }
}
/**
 * @public
 */
export interface CreateEvaluationJobRequest {
    /**
     * <p>A name for the evaluation job. Names must unique with your Amazon Web Services account, and your account's Amazon Web Services region.</p>
     * @public
     */
    jobName: string | undefined;
    /**
     * <p>A description of the evaluation job.</p>
     * @public
     */
    jobDescription?: string | undefined;
    /**
     * <p>A unique, case-sensitive identifier to ensure that the API request completes no more than one time. If this token matches a previous request, Amazon Bedrock ignores the request, but does not return an error. For more information, see <a href="https://docs.aws.amazon.com/AWSEC2/latest/APIReference/Run_Instance_Idempotency.html">Ensuring idempotency</a>.</p>
     * @public
     */
    clientRequestToken?: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of an IAM service role that Amazon Bedrock can assume to perform tasks on your behalf. To learn more about the required permissions, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/model-evaluation-security.html">Required permissions for model evaluations</a>.</p>
     * @public
     */
    roleArn: string | undefined;
    /**
     * <p>Specify your customer managed encryption key Amazon Resource Name (ARN) that will be used to encrypt your evaluation job.</p>
     * @public
     */
    customerEncryptionKeyId?: string | undefined;
    /**
     * <p>Tags to attach to the model evaluation job.</p>
     * @public
     */
    jobTags?: Tag[] | undefined;
    /**
     * <p>Specifies whether the evaluation job is for evaluating a model or evaluating a knowledge base (retrieval and response generation).</p>
     * @public
     */
    applicationType?: ApplicationType | undefined;
    /**
     * <p>Contains the configuration details of either an automated or human-based evaluation job.</p>
     * @public
     */
    evaluationConfig: EvaluationConfig | undefined;
    /**
     * <p>Contains the configuration details of the inference model for the evaluation job.</p> <p>For model evaluation jobs, automated jobs support a single model or <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/cross-region-inference.html">inference profile</a>, and jobs that use human workers support two models or inference profiles.</p>
     * @public
     */
    inferenceConfig: EvaluationInferenceConfig | undefined;
    /**
     * <p>Contains the configuration details of the Amazon S3 bucket for storing the results of the evaluation job.</p>
     * @public
     */
    outputDataConfig: EvaluationOutputDataConfig | undefined;
}
/**
 * @public
 */
export interface GetEvaluationJobResponse {
    /**
     * <p>The name for the evaluation job.</p>
     * @public
     */
    jobName: string | undefined;
    /**
     * <p>The current status of the evaluation job.</p>
     * @public
     */
    status: EvaluationJobStatus | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the evaluation job.</p>
     * @public
     */
    jobArn: string | undefined;
    /**
     * <p>The description of the evaluation job.</p>
     * @public
     */
    jobDescription?: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the IAM service role used in the evaluation job.</p>
     * @public
     */
    roleArn: string | undefined;
    /**
     * <p>The Amazon Resource Name (ARN) of the customer managed encryption key specified when the evaluation job was created.</p>
     * @public
     */
    customerEncryptionKeyId?: string | undefined;
    /**
     * <p>Specifies whether the evaluation job is automated or human-based.</p>
     * @public
     */
    jobType: EvaluationJobType | undefined;
    /**
     * <p>Specifies whether the evaluation job is for evaluating a model or evaluating a knowledge base (retrieval and response generation).</p>
     * @public
     */
    applicationType?: ApplicationType | undefined;
    /**
     * <p>Contains the configuration details of either an automated or human-based evaluation job.</p>
     * @public
     */
    evaluationConfig: EvaluationConfig | undefined;
    /**
     * <p>Contains the configuration details of the inference model used for the evaluation job. </p>
     * @public
     */
    inferenceConfig: EvaluationInferenceConfig | undefined;
    /**
     * <p>Contains the configuration details of the Amazon S3 bucket for storing the results of the evaluation job.</p>
     * @public
     */
    outputDataConfig: EvaluationOutputDataConfig | undefined;
    /**
     * <p>The time the evaluation job was created.</p>
     * @public
     */
    creationTime: Date | undefined;
    /**
     * <p>The time the evaluation job was last modified.</p>
     * @public
     */
    lastModifiedTime?: Date | undefined;
    /**
     * <p>A list of strings that specify why the evaluation job failed to create.</p>
     * @public
     */
    failureMessages?: string[] | undefined;
}
