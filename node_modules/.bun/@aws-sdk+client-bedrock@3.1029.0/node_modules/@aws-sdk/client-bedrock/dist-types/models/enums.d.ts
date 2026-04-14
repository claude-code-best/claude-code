/**
 * @public
 * @enum
 */
export declare const SelectiveGuardingMode: {
    readonly COMPREHENSIVE: "COMPREHENSIVE";
    readonly SELECTIVE: "SELECTIVE";
};
/**
 * @public
 */
export type SelectiveGuardingMode = (typeof SelectiveGuardingMode)[keyof typeof SelectiveGuardingMode];
/**
 * @public
 * @enum
 */
export declare const InputTags: {
    readonly HONOR: "HONOR";
    readonly IGNORE: "IGNORE";
};
/**
 * @public
 */
export type InputTags = (typeof InputTags)[keyof typeof InputTags];
/**
 * @public
 * @enum
 */
export declare const ConfigurationOwner: {
    /**
     * Configuration owned by the account
     */
    readonly ACCOUNT: "ACCOUNT";
};
/**
 * @public
 */
export type ConfigurationOwner = (typeof ConfigurationOwner)[keyof typeof ConfigurationOwner];
/**
 * @public
 * @enum
 */
export declare const AgreementStatus: {
    readonly AVAILABLE: "AVAILABLE";
    readonly ERROR: "ERROR";
    readonly NOT_AVAILABLE: "NOT_AVAILABLE";
    readonly PENDING: "PENDING";
};
/**
 * @public
 */
export type AgreementStatus = (typeof AgreementStatus)[keyof typeof AgreementStatus];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningCheckResult: {
    readonly IMPOSSIBLE: "IMPOSSIBLE";
    readonly INVALID: "INVALID";
    readonly NO_TRANSLATION: "NO_TRANSLATION";
    readonly SATISFIABLE: "SATISFIABLE";
    readonly TOO_COMPLEX: "TOO_COMPLEX";
    readonly TRANSLATION_AMBIGUOUS: "TRANSLATION_AMBIGUOUS";
    readonly VALID: "VALID";
};
/**
 * @public
 */
export type AutomatedReasoningCheckResult = (typeof AutomatedReasoningCheckResult)[keyof typeof AutomatedReasoningCheckResult];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningPolicyBuildWorkflowType: {
    readonly GENERATE_FIDELITY_REPORT: "GENERATE_FIDELITY_REPORT";
    readonly GENERATE_POLICY_SCENARIOS: "GENERATE_POLICY_SCENARIOS";
    readonly IMPORT_POLICY: "IMPORT_POLICY";
    readonly INGEST_CONTENT: "INGEST_CONTENT";
    readonly REFINE_POLICY: "REFINE_POLICY";
};
/**
 * @public
 */
export type AutomatedReasoningPolicyBuildWorkflowType = (typeof AutomatedReasoningPolicyBuildWorkflowType)[keyof typeof AutomatedReasoningPolicyBuildWorkflowType];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningPolicyBuildDocumentContentType: {
    readonly PDF: "pdf";
    readonly TEXT: "txt";
};
/**
 * @public
 */
export type AutomatedReasoningPolicyBuildDocumentContentType = (typeof AutomatedReasoningPolicyBuildDocumentContentType)[keyof typeof AutomatedReasoningPolicyBuildDocumentContentType];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningPolicyBuildWorkflowStatus: {
    readonly BUILDING: "BUILDING";
    readonly CANCELLED: "CANCELLED";
    readonly CANCEL_REQUESTED: "CANCEL_REQUESTED";
    readonly COMPLETED: "COMPLETED";
    readonly FAILED: "FAILED";
    readonly PREPROCESSING: "PREPROCESSING";
    readonly SCHEDULED: "SCHEDULED";
    readonly TESTING: "TESTING";
};
/**
 * @public
 */
export type AutomatedReasoningPolicyBuildWorkflowStatus = (typeof AutomatedReasoningPolicyBuildWorkflowStatus)[keyof typeof AutomatedReasoningPolicyBuildWorkflowStatus];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningPolicyBuildResultAssetType: {
    readonly ASSET_MANIFEST: "ASSET_MANIFEST";
    readonly BUILD_LOG: "BUILD_LOG";
    readonly FIDELITY_REPORT: "FIDELITY_REPORT";
    readonly GENERATED_TEST_CASES: "GENERATED_TEST_CASES";
    readonly POLICY_DEFINITION: "POLICY_DEFINITION";
    readonly POLICY_SCENARIOS: "POLICY_SCENARIOS";
    readonly QUALITY_REPORT: "QUALITY_REPORT";
    readonly SOURCE_DOCUMENT: "SOURCE_DOCUMENT";
};
/**
 * @public
 */
export type AutomatedReasoningPolicyBuildResultAssetType = (typeof AutomatedReasoningPolicyBuildResultAssetType)[keyof typeof AutomatedReasoningPolicyBuildResultAssetType];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningPolicyBuildMessageType: {
    readonly ERROR: "ERROR";
    readonly INFO: "INFO";
    readonly WARNING: "WARNING";
};
/**
 * @public
 */
export type AutomatedReasoningPolicyBuildMessageType = (typeof AutomatedReasoningPolicyBuildMessageType)[keyof typeof AutomatedReasoningPolicyBuildMessageType];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningPolicyAnnotationStatus: {
    readonly APPLIED: "APPLIED";
    readonly FAILED: "FAILED";
};
/**
 * @public
 */
export type AutomatedReasoningPolicyAnnotationStatus = (typeof AutomatedReasoningPolicyAnnotationStatus)[keyof typeof AutomatedReasoningPolicyAnnotationStatus];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningCheckLogicWarningType: {
    readonly ALWAYS_FALSE: "ALWAYS_FALSE";
    readonly ALWAYS_TRUE: "ALWAYS_TRUE";
};
/**
 * @public
 */
export type AutomatedReasoningCheckLogicWarningType = (typeof AutomatedReasoningCheckLogicWarningType)[keyof typeof AutomatedReasoningCheckLogicWarningType];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningPolicyTestRunResult: {
    readonly FAILED: "FAILED";
    readonly PASSED: "PASSED";
};
/**
 * @public
 */
export type AutomatedReasoningPolicyTestRunResult = (typeof AutomatedReasoningPolicyTestRunResult)[keyof typeof AutomatedReasoningPolicyTestRunResult];
/**
 * @public
 * @enum
 */
export declare const AutomatedReasoningPolicyTestRunStatus: {
    readonly COMPLETED: "COMPLETED";
    readonly FAILED: "FAILED";
    readonly IN_PROGRESS: "IN_PROGRESS";
    readonly NOT_STARTED: "NOT_STARTED";
    readonly SCHEDULED: "SCHEDULED";
};
/**
 * @public
 */
export type AutomatedReasoningPolicyTestRunStatus = (typeof AutomatedReasoningPolicyTestRunStatus)[keyof typeof AutomatedReasoningPolicyTestRunStatus];
/**
 * @public
 * @enum
 */
export declare const Status: {
    readonly INCOMPATIBLE_ENDPOINT: "INCOMPATIBLE_ENDPOINT";
    readonly REGISTERED: "REGISTERED";
};
/**
 * @public
 */
export type Status = (typeof Status)[keyof typeof Status];
/**
 * @public
 * @enum
 */
export declare const CustomModelDeploymentStatus: {
    readonly ACTIVE: "Active";
    readonly CREATING: "Creating";
    readonly FAILED: "Failed";
};
/**
 * @public
 */
export type CustomModelDeploymentStatus = (typeof CustomModelDeploymentStatus)[keyof typeof CustomModelDeploymentStatus];
/**
 * @public
 * @enum
 */
export declare const CustomModelDeploymentUpdateStatus: {
    readonly UPDATE_COMPLETED: "UpdateCompleted";
    readonly UPDATE_FAILED: "UpdateFailed";
    readonly UPDATING: "Updating";
};
/**
 * @public
 */
export type CustomModelDeploymentUpdateStatus = (typeof CustomModelDeploymentUpdateStatus)[keyof typeof CustomModelDeploymentUpdateStatus];
/**
 * @public
 * @enum
 */
export declare const SortModelsBy: {
    readonly CREATION_TIME: "CreationTime";
};
/**
 * @public
 */
export type SortModelsBy = (typeof SortModelsBy)[keyof typeof SortModelsBy];
/**
 * @public
 * @enum
 */
export declare const SortOrder: {
    readonly ASCENDING: "Ascending";
    readonly DESCENDING: "Descending";
};
/**
 * @public
 */
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];
/**
 * @public
 * @enum
 */
export declare const ReasoningEffort: {
    readonly HIGH: "high";
    readonly LOW: "low";
    readonly MEDIUM: "medium";
};
/**
 * @public
 */
export type ReasoningEffort = (typeof ReasoningEffort)[keyof typeof ReasoningEffort];
/**
 * @public
 * @enum
 */
export declare const CustomizationType: {
    readonly CONTINUED_PRE_TRAINING: "CONTINUED_PRE_TRAINING";
    readonly DISTILLATION: "DISTILLATION";
    readonly FINE_TUNING: "FINE_TUNING";
    readonly IMPORTED: "IMPORTED";
    readonly REINFORCEMENT_FINE_TUNING: "REINFORCEMENT_FINE_TUNING";
};
/**
 * @public
 */
export type CustomizationType = (typeof CustomizationType)[keyof typeof CustomizationType];
/**
 * @public
 * @enum
 */
export declare const ModelStatus: {
    readonly ACTIVE: "Active";
    readonly CREATING: "Creating";
    readonly FAILED: "Failed";
};
/**
 * @public
 */
export type ModelStatus = (typeof ModelStatus)[keyof typeof ModelStatus];
/**
 * @public
 * @enum
 */
export declare const EvaluationJobStatus: {
    readonly COMPLETED: "Completed";
    readonly DELETING: "Deleting";
    readonly FAILED: "Failed";
    readonly IN_PROGRESS: "InProgress";
    readonly STOPPED: "Stopped";
    readonly STOPPING: "Stopping";
};
/**
 * @public
 */
export type EvaluationJobStatus = (typeof EvaluationJobStatus)[keyof typeof EvaluationJobStatus];
/**
 * @public
 * @enum
 */
export declare const ApplicationType: {
    readonly MODEL_EVALUATION: "ModelEvaluation";
    readonly RAG_EVALUATION: "RagEvaluation";
};
/**
 * @public
 */
export type ApplicationType = (typeof ApplicationType)[keyof typeof ApplicationType];
/**
 * @public
 * @enum
 */
export declare const EvaluationTaskType: {
    readonly CLASSIFICATION: "Classification";
    readonly CUSTOM: "Custom";
    readonly GENERATION: "Generation";
    readonly QUESTION_AND_ANSWER: "QuestionAndAnswer";
    readonly SUMMARIZATION: "Summarization";
};
/**
 * @public
 */
export type EvaluationTaskType = (typeof EvaluationTaskType)[keyof typeof EvaluationTaskType];
/**
 * @public
 * @enum
 */
export declare const PerformanceConfigLatency: {
    readonly OPTIMIZED: "optimized";
    readonly STANDARD: "standard";
};
/**
 * @public
 */
export type PerformanceConfigLatency = (typeof PerformanceConfigLatency)[keyof typeof PerformanceConfigLatency];
/**
 * @public
 * @enum
 */
export declare const ExternalSourceType: {
    readonly BYTE_CONTENT: "BYTE_CONTENT";
    readonly S3: "S3";
};
/**
 * @public
 */
export type ExternalSourceType = (typeof ExternalSourceType)[keyof typeof ExternalSourceType];
/**
 * @public
 * @enum
 */
export declare const QueryTransformationType: {
    readonly QUERY_DECOMPOSITION: "QUERY_DECOMPOSITION";
};
/**
 * @public
 */
export type QueryTransformationType = (typeof QueryTransformationType)[keyof typeof QueryTransformationType];
/**
 * @public
 * @enum
 */
export declare const AttributeType: {
    readonly BOOLEAN: "BOOLEAN";
    readonly NUMBER: "NUMBER";
    readonly STRING: "STRING";
    readonly STRING_LIST: "STRING_LIST";
};
/**
 * @public
 */
export type AttributeType = (typeof AttributeType)[keyof typeof AttributeType];
/**
 * @public
 * @enum
 */
export declare const SearchType: {
    readonly HYBRID: "HYBRID";
    readonly SEMANTIC: "SEMANTIC";
};
/**
 * @public
 */
export type SearchType = (typeof SearchType)[keyof typeof SearchType];
/**
 * @public
 * @enum
 */
export declare const RerankingMetadataSelectionMode: {
    readonly ALL: "ALL";
    readonly SELECTIVE: "SELECTIVE";
};
/**
 * @public
 */
export type RerankingMetadataSelectionMode = (typeof RerankingMetadataSelectionMode)[keyof typeof RerankingMetadataSelectionMode];
/**
 * @public
 * @enum
 */
export declare const VectorSearchRerankingConfigurationType: {
    readonly BEDROCK_RERANKING_MODEL: "BEDROCK_RERANKING_MODEL";
};
/**
 * @public
 */
export type VectorSearchRerankingConfigurationType = (typeof VectorSearchRerankingConfigurationType)[keyof typeof VectorSearchRerankingConfigurationType];
/**
 * @public
 * @enum
 */
export declare const RetrieveAndGenerateType: {
    readonly EXTERNAL_SOURCES: "EXTERNAL_SOURCES";
    readonly KNOWLEDGE_BASE: "KNOWLEDGE_BASE";
};
/**
 * @public
 */
export type RetrieveAndGenerateType = (typeof RetrieveAndGenerateType)[keyof typeof RetrieveAndGenerateType];
/**
 * @public
 * @enum
 */
export declare const EvaluationJobType: {
    readonly AUTOMATED: "Automated";
    readonly HUMAN: "Human";
};
/**
 * @public
 */
export type EvaluationJobType = (typeof EvaluationJobType)[keyof typeof EvaluationJobType];
/**
 * @public
 * @enum
 */
export declare const SortJobsBy: {
    readonly CREATION_TIME: "CreationTime";
};
/**
 * @public
 */
export type SortJobsBy = (typeof SortJobsBy)[keyof typeof SortJobsBy];
/**
 * @public
 * @enum
 */
export declare const GuardrailContentFilterAction: {
    readonly BLOCK: "BLOCK";
    readonly NONE: "NONE";
};
/**
 * @public
 */
export type GuardrailContentFilterAction = (typeof GuardrailContentFilterAction)[keyof typeof GuardrailContentFilterAction];
/**
 * @public
 * @enum
 */
export declare const GuardrailModality: {
    readonly IMAGE: "IMAGE";
    readonly TEXT: "TEXT";
};
/**
 * @public
 */
export type GuardrailModality = (typeof GuardrailModality)[keyof typeof GuardrailModality];
/**
 * @public
 * @enum
 */
export declare const GuardrailFilterStrength: {
    readonly HIGH: "HIGH";
    readonly LOW: "LOW";
    readonly MEDIUM: "MEDIUM";
    readonly NONE: "NONE";
};
/**
 * @public
 */
export type GuardrailFilterStrength = (typeof GuardrailFilterStrength)[keyof typeof GuardrailFilterStrength];
/**
 * @public
 * @enum
 */
export declare const GuardrailContentFilterType: {
    readonly HATE: "HATE";
    readonly INSULTS: "INSULTS";
    readonly MISCONDUCT: "MISCONDUCT";
    readonly PROMPT_ATTACK: "PROMPT_ATTACK";
    readonly SEXUAL: "SEXUAL";
    readonly VIOLENCE: "VIOLENCE";
};
/**
 * @public
 */
export type GuardrailContentFilterType = (typeof GuardrailContentFilterType)[keyof typeof GuardrailContentFilterType];
/**
 * @public
 * @enum
 */
export declare const GuardrailContentFiltersTierName: {
    readonly CLASSIC: "CLASSIC";
    readonly STANDARD: "STANDARD";
};
/**
 * @public
 */
export type GuardrailContentFiltersTierName = (typeof GuardrailContentFiltersTierName)[keyof typeof GuardrailContentFiltersTierName];
/**
 * @public
 * @enum
 */
export declare const GuardrailContextualGroundingAction: {
    readonly BLOCK: "BLOCK";
    readonly NONE: "NONE";
};
/**
 * @public
 */
export type GuardrailContextualGroundingAction = (typeof GuardrailContextualGroundingAction)[keyof typeof GuardrailContextualGroundingAction];
/**
 * @public
 * @enum
 */
export declare const GuardrailContextualGroundingFilterType: {
    readonly GROUNDING: "GROUNDING";
    readonly RELEVANCE: "RELEVANCE";
};
/**
 * @public
 */
export type GuardrailContextualGroundingFilterType = (typeof GuardrailContextualGroundingFilterType)[keyof typeof GuardrailContextualGroundingFilterType];
/**
 * @public
 * @enum
 */
export declare const GuardrailSensitiveInformationAction: {
    readonly ANONYMIZE: "ANONYMIZE";
    readonly BLOCK: "BLOCK";
    readonly NONE: "NONE";
};
/**
 * @public
 */
export type GuardrailSensitiveInformationAction = (typeof GuardrailSensitiveInformationAction)[keyof typeof GuardrailSensitiveInformationAction];
/**
 * @public
 * @enum
 */
export declare const GuardrailPiiEntityType: {
    readonly ADDRESS: "ADDRESS";
    readonly AGE: "AGE";
    readonly AWS_ACCESS_KEY: "AWS_ACCESS_KEY";
    readonly AWS_SECRET_KEY: "AWS_SECRET_KEY";
    readonly CA_HEALTH_NUMBER: "CA_HEALTH_NUMBER";
    readonly CA_SOCIAL_INSURANCE_NUMBER: "CA_SOCIAL_INSURANCE_NUMBER";
    readonly CREDIT_DEBIT_CARD_CVV: "CREDIT_DEBIT_CARD_CVV";
    readonly CREDIT_DEBIT_CARD_EXPIRY: "CREDIT_DEBIT_CARD_EXPIRY";
    readonly CREDIT_DEBIT_CARD_NUMBER: "CREDIT_DEBIT_CARD_NUMBER";
    readonly DRIVER_ID: "DRIVER_ID";
    readonly EMAIL: "EMAIL";
    readonly INTERNATIONAL_BANK_ACCOUNT_NUMBER: "INTERNATIONAL_BANK_ACCOUNT_NUMBER";
    readonly IP_ADDRESS: "IP_ADDRESS";
    readonly LICENSE_PLATE: "LICENSE_PLATE";
    readonly MAC_ADDRESS: "MAC_ADDRESS";
    readonly NAME: "NAME";
    readonly PASSWORD: "PASSWORD";
    readonly PHONE: "PHONE";
    readonly PIN: "PIN";
    readonly SWIFT_CODE: "SWIFT_CODE";
    readonly UK_NATIONAL_HEALTH_SERVICE_NUMBER: "UK_NATIONAL_HEALTH_SERVICE_NUMBER";
    readonly UK_NATIONAL_INSURANCE_NUMBER: "UK_NATIONAL_INSURANCE_NUMBER";
    readonly UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER: "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER";
    readonly URL: "URL";
    readonly USERNAME: "USERNAME";
    readonly US_BANK_ACCOUNT_NUMBER: "US_BANK_ACCOUNT_NUMBER";
    readonly US_BANK_ROUTING_NUMBER: "US_BANK_ROUTING_NUMBER";
    readonly US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER: "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER";
    readonly US_PASSPORT_NUMBER: "US_PASSPORT_NUMBER";
    readonly US_SOCIAL_SECURITY_NUMBER: "US_SOCIAL_SECURITY_NUMBER";
    readonly VEHICLE_IDENTIFICATION_NUMBER: "VEHICLE_IDENTIFICATION_NUMBER";
};
/**
 * @public
 */
export type GuardrailPiiEntityType = (typeof GuardrailPiiEntityType)[keyof typeof GuardrailPiiEntityType];
/**
 * @public
 * @enum
 */
export declare const GuardrailTopicsTierName: {
    readonly CLASSIC: "CLASSIC";
    readonly STANDARD: "STANDARD";
};
/**
 * @public
 */
export type GuardrailTopicsTierName = (typeof GuardrailTopicsTierName)[keyof typeof GuardrailTopicsTierName];
/**
 * @public
 * @enum
 */
export declare const GuardrailTopicAction: {
    readonly BLOCK: "BLOCK";
    readonly NONE: "NONE";
};
/**
 * @public
 */
export type GuardrailTopicAction = (typeof GuardrailTopicAction)[keyof typeof GuardrailTopicAction];
/**
 * @public
 * @enum
 */
export declare const GuardrailTopicType: {
    readonly DENY: "DENY";
};
/**
 * @public
 */
export type GuardrailTopicType = (typeof GuardrailTopicType)[keyof typeof GuardrailTopicType];
/**
 * @public
 * @enum
 */
export declare const GuardrailWordAction: {
    readonly BLOCK: "BLOCK";
    readonly NONE: "NONE";
};
/**
 * @public
 */
export type GuardrailWordAction = (typeof GuardrailWordAction)[keyof typeof GuardrailWordAction];
/**
 * @public
 * @enum
 */
export declare const GuardrailManagedWordsType: {
    readonly PROFANITY: "PROFANITY";
};
/**
 * @public
 */
export type GuardrailManagedWordsType = (typeof GuardrailManagedWordsType)[keyof typeof GuardrailManagedWordsType];
/**
 * @public
 * @enum
 */
export declare const GuardrailStatus: {
    readonly CREATING: "CREATING";
    readonly DELETING: "DELETING";
    readonly FAILED: "FAILED";
    readonly READY: "READY";
    readonly UPDATING: "UPDATING";
    readonly VERSIONING: "VERSIONING";
};
/**
 * @public
 */
export type GuardrailStatus = (typeof GuardrailStatus)[keyof typeof GuardrailStatus];
/**
 * @public
 * @enum
 */
export declare const InferenceProfileStatus: {
    readonly ACTIVE: "ACTIVE";
};
/**
 * @public
 */
export type InferenceProfileStatus = (typeof InferenceProfileStatus)[keyof typeof InferenceProfileStatus];
/**
 * @public
 * @enum
 */
export declare const InferenceProfileType: {
    readonly APPLICATION: "APPLICATION";
    readonly SYSTEM_DEFINED: "SYSTEM_DEFINED";
};
/**
 * @public
 */
export type InferenceProfileType = (typeof InferenceProfileType)[keyof typeof InferenceProfileType];
/**
 * @public
 * @enum
 */
export declare const ModelCopyJobStatus: {
    readonly COMPLETED: "Completed";
    readonly FAILED: "Failed";
    readonly IN_PROGRESS: "InProgress";
};
/**
 * @public
 */
export type ModelCopyJobStatus = (typeof ModelCopyJobStatus)[keyof typeof ModelCopyJobStatus];
/**
 * @public
 * @enum
 */
export declare const ModelImportJobStatus: {
    readonly COMPLETED: "Completed";
    readonly FAILED: "Failed";
    readonly IN_PROGRESS: "InProgress";
};
/**
 * @public
 */
export type ModelImportJobStatus = (typeof ModelImportJobStatus)[keyof typeof ModelImportJobStatus];
/**
 * @public
 * @enum
 */
export declare const S3InputFormat: {
    readonly JSONL: "JSONL";
};
/**
 * @public
 */
export type S3InputFormat = (typeof S3InputFormat)[keyof typeof S3InputFormat];
/**
 * @public
 * @enum
 */
export declare const ModelInvocationType: {
    readonly Converse: "Converse";
    readonly InvokeModel: "InvokeModel";
};
/**
 * @public
 */
export type ModelInvocationType = (typeof ModelInvocationType)[keyof typeof ModelInvocationType];
/**
 * @public
 * @enum
 */
export declare const ModelInvocationJobStatus: {
    readonly COMPLETED: "Completed";
    readonly EXPIRED: "Expired";
    readonly FAILED: "Failed";
    readonly IN_PROGRESS: "InProgress";
    readonly PARTIALLY_COMPLETED: "PartiallyCompleted";
    readonly SCHEDULED: "Scheduled";
    readonly STOPPED: "Stopped";
    readonly STOPPING: "Stopping";
    readonly SUBMITTED: "Submitted";
    readonly VALIDATING: "Validating";
};
/**
 * @public
 */
export type ModelInvocationJobStatus = (typeof ModelInvocationJobStatus)[keyof typeof ModelInvocationJobStatus];
/**
 * @public
 * @enum
 */
export declare const ModelCustomization: {
    readonly CONTINUED_PRE_TRAINING: "CONTINUED_PRE_TRAINING";
    readonly DISTILLATION: "DISTILLATION";
    readonly FINE_TUNING: "FINE_TUNING";
};
/**
 * @public
 */
export type ModelCustomization = (typeof ModelCustomization)[keyof typeof ModelCustomization];
/**
 * @public
 * @enum
 */
export declare const InferenceType: {
    readonly ON_DEMAND: "ON_DEMAND";
    readonly PROVISIONED: "PROVISIONED";
};
/**
 * @public
 */
export type InferenceType = (typeof InferenceType)[keyof typeof InferenceType];
/**
 * @public
 * @enum
 */
export declare const ModelModality: {
    readonly EMBEDDING: "EMBEDDING";
    readonly IMAGE: "IMAGE";
    readonly TEXT: "TEXT";
};
/**
 * @public
 */
export type ModelModality = (typeof ModelModality)[keyof typeof ModelModality];
/**
 * @public
 * @enum
 */
export declare const FoundationModelLifecycleStatus: {
    readonly ACTIVE: "ACTIVE";
    readonly LEGACY: "LEGACY";
};
/**
 * @public
 */
export type FoundationModelLifecycleStatus = (typeof FoundationModelLifecycleStatus)[keyof typeof FoundationModelLifecycleStatus];
/**
 * @public
 * @enum
 */
export declare const PromptRouterStatus: {
    readonly AVAILABLE: "AVAILABLE";
};
/**
 * @public
 */
export type PromptRouterStatus = (typeof PromptRouterStatus)[keyof typeof PromptRouterStatus];
/**
 * @public
 * @enum
 */
export declare const PromptRouterType: {
    readonly CUSTOM: "custom";
    readonly DEFAULT: "default";
};
/**
 * @public
 */
export type PromptRouterType = (typeof PromptRouterType)[keyof typeof PromptRouterType];
/**
 * @public
 * @enum
 */
export declare const CommitmentDuration: {
    readonly ONE_MONTH: "OneMonth";
    readonly SIX_MONTHS: "SixMonths";
};
/**
 * @public
 */
export type CommitmentDuration = (typeof CommitmentDuration)[keyof typeof CommitmentDuration];
/**
 * @public
 * @enum
 */
export declare const ProvisionedModelStatus: {
    readonly CREATING: "Creating";
    readonly FAILED: "Failed";
    readonly IN_SERVICE: "InService";
    readonly UPDATING: "Updating";
};
/**
 * @public
 */
export type ProvisionedModelStatus = (typeof ProvisionedModelStatus)[keyof typeof ProvisionedModelStatus];
/**
 * @public
 * @enum
 */
export declare const SortByProvisionedModels: {
    readonly CREATION_TIME: "CreationTime";
};
/**
 * @public
 */
export type SortByProvisionedModels = (typeof SortByProvisionedModels)[keyof typeof SortByProvisionedModels];
/**
 * @public
 * @enum
 */
export declare const AuthorizationStatus: {
    readonly AUTHORIZED: "AUTHORIZED";
    readonly NOT_AUTHORIZED: "NOT_AUTHORIZED";
};
/**
 * @public
 */
export type AuthorizationStatus = (typeof AuthorizationStatus)[keyof typeof AuthorizationStatus];
/**
 * @public
 * @enum
 */
export declare const EntitlementAvailability: {
    readonly AVAILABLE: "AVAILABLE";
    readonly NOT_AVAILABLE: "NOT_AVAILABLE";
};
/**
 * @public
 */
export type EntitlementAvailability = (typeof EntitlementAvailability)[keyof typeof EntitlementAvailability];
/**
 * @public
 * @enum
 */
export declare const RegionAvailability: {
    readonly AVAILABLE: "AVAILABLE";
    readonly NOT_AVAILABLE: "NOT_AVAILABLE";
};
/**
 * @public
 */
export type RegionAvailability = (typeof RegionAvailability)[keyof typeof RegionAvailability];
/**
 * @public
 * @enum
 */
export declare const OfferType: {
    readonly ALL: "ALL";
    readonly PUBLIC: "PUBLIC";
};
/**
 * @public
 */
export type OfferType = (typeof OfferType)[keyof typeof OfferType];
/**
 * @public
 * @enum
 */
export declare const ModelCustomizationJobStatus: {
    readonly COMPLETED: "Completed";
    readonly FAILED: "Failed";
    readonly IN_PROGRESS: "InProgress";
    readonly STOPPED: "Stopped";
    readonly STOPPING: "Stopping";
};
/**
 * @public
 */
export type ModelCustomizationJobStatus = (typeof ModelCustomizationJobStatus)[keyof typeof ModelCustomizationJobStatus];
/**
 * @public
 * @enum
 */
export declare const JobStatusDetails: {
    readonly COMPLETED: "Completed";
    readonly FAILED: "Failed";
    readonly IN_PROGRESS: "InProgress";
    readonly NOT_STARTED: "NotStarted";
    readonly STOPPED: "Stopped";
    readonly STOPPING: "Stopping";
};
/**
 * @public
 */
export type JobStatusDetails = (typeof JobStatusDetails)[keyof typeof JobStatusDetails];
/**
 * @public
 * @enum
 */
export declare const FineTuningJobStatus: {
    readonly COMPLETED: "Completed";
    readonly FAILED: "Failed";
    readonly IN_PROGRESS: "InProgress";
    readonly STOPPED: "Stopped";
    readonly STOPPING: "Stopping";
};
/**
 * @public
 */
export type FineTuningJobStatus = (typeof FineTuningJobStatus)[keyof typeof FineTuningJobStatus];
