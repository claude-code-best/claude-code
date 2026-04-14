export declare const InputTags: {
  readonly HONOR: "HONOR";
  readonly IGNORE: "IGNORE";
};
export type InputTags = (typeof InputTags)[keyof typeof InputTags];
export declare const ConfigurationOwner: {
  readonly ACCOUNT: "ACCOUNT";
};
export type ConfigurationOwner =
  (typeof ConfigurationOwner)[keyof typeof ConfigurationOwner];
export declare const AgreementStatus: {
  readonly AVAILABLE: "AVAILABLE";
  readonly ERROR: "ERROR";
  readonly NOT_AVAILABLE: "NOT_AVAILABLE";
  readonly PENDING: "PENDING";
};
export type AgreementStatus =
  (typeof AgreementStatus)[keyof typeof AgreementStatus];
export declare const AutomatedReasoningCheckResult: {
  readonly IMPOSSIBLE: "IMPOSSIBLE";
  readonly INVALID: "INVALID";
  readonly NO_TRANSLATION: "NO_TRANSLATION";
  readonly SATISFIABLE: "SATISFIABLE";
  readonly TOO_COMPLEX: "TOO_COMPLEX";
  readonly TRANSLATION_AMBIGUOUS: "TRANSLATION_AMBIGUOUS";
  readonly VALID: "VALID";
};
export type AutomatedReasoningCheckResult =
  (typeof AutomatedReasoningCheckResult)[keyof typeof AutomatedReasoningCheckResult];
export declare const AutomatedReasoningPolicyBuildWorkflowType: {
  readonly GENERATE_FIDELITY_REPORT: "GENERATE_FIDELITY_REPORT";
  readonly GENERATE_POLICY_SCENARIOS: "GENERATE_POLICY_SCENARIOS";
  readonly IMPORT_POLICY: "IMPORT_POLICY";
  readonly INGEST_CONTENT: "INGEST_CONTENT";
  readonly REFINE_POLICY: "REFINE_POLICY";
};
export type AutomatedReasoningPolicyBuildWorkflowType =
  (typeof AutomatedReasoningPolicyBuildWorkflowType)[keyof typeof AutomatedReasoningPolicyBuildWorkflowType];
export declare const AutomatedReasoningPolicyBuildDocumentContentType: {
  readonly PDF: "pdf";
  readonly TEXT: "txt";
};
export type AutomatedReasoningPolicyBuildDocumentContentType =
  (typeof AutomatedReasoningPolicyBuildDocumentContentType)[keyof typeof AutomatedReasoningPolicyBuildDocumentContentType];
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
export type AutomatedReasoningPolicyBuildWorkflowStatus =
  (typeof AutomatedReasoningPolicyBuildWorkflowStatus)[keyof typeof AutomatedReasoningPolicyBuildWorkflowStatus];
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
export type AutomatedReasoningPolicyBuildResultAssetType =
  (typeof AutomatedReasoningPolicyBuildResultAssetType)[keyof typeof AutomatedReasoningPolicyBuildResultAssetType];
export declare const AutomatedReasoningPolicyBuildMessageType: {
  readonly ERROR: "ERROR";
  readonly INFO: "INFO";
  readonly WARNING: "WARNING";
};
export type AutomatedReasoningPolicyBuildMessageType =
  (typeof AutomatedReasoningPolicyBuildMessageType)[keyof typeof AutomatedReasoningPolicyBuildMessageType];
export declare const AutomatedReasoningPolicyAnnotationStatus: {
  readonly APPLIED: "APPLIED";
  readonly FAILED: "FAILED";
};
export type AutomatedReasoningPolicyAnnotationStatus =
  (typeof AutomatedReasoningPolicyAnnotationStatus)[keyof typeof AutomatedReasoningPolicyAnnotationStatus];
export declare const AutomatedReasoningCheckLogicWarningType: {
  readonly ALWAYS_FALSE: "ALWAYS_FALSE";
  readonly ALWAYS_TRUE: "ALWAYS_TRUE";
};
export type AutomatedReasoningCheckLogicWarningType =
  (typeof AutomatedReasoningCheckLogicWarningType)[keyof typeof AutomatedReasoningCheckLogicWarningType];
export declare const AutomatedReasoningPolicyTestRunResult: {
  readonly FAILED: "FAILED";
  readonly PASSED: "PASSED";
};
export type AutomatedReasoningPolicyTestRunResult =
  (typeof AutomatedReasoningPolicyTestRunResult)[keyof typeof AutomatedReasoningPolicyTestRunResult];
export declare const AutomatedReasoningPolicyTestRunStatus: {
  readonly COMPLETED: "COMPLETED";
  readonly FAILED: "FAILED";
  readonly IN_PROGRESS: "IN_PROGRESS";
  readonly NOT_STARTED: "NOT_STARTED";
  readonly SCHEDULED: "SCHEDULED";
};
export type AutomatedReasoningPolicyTestRunStatus =
  (typeof AutomatedReasoningPolicyTestRunStatus)[keyof typeof AutomatedReasoningPolicyTestRunStatus];
export declare const Status: {
  readonly INCOMPATIBLE_ENDPOINT: "INCOMPATIBLE_ENDPOINT";
  readonly REGISTERED: "REGISTERED";
};
export type Status = (typeof Status)[keyof typeof Status];
export declare const CustomModelDeploymentStatus: {
  readonly ACTIVE: "Active";
  readonly CREATING: "Creating";
  readonly FAILED: "Failed";
};
export type CustomModelDeploymentStatus =
  (typeof CustomModelDeploymentStatus)[keyof typeof CustomModelDeploymentStatus];
export declare const CustomModelDeploymentUpdateStatus: {
  readonly UPDATE_COMPLETED: "UpdateCompleted";
  readonly UPDATE_FAILED: "UpdateFailed";
  readonly UPDATING: "Updating";
};
export type CustomModelDeploymentUpdateStatus =
  (typeof CustomModelDeploymentUpdateStatus)[keyof typeof CustomModelDeploymentUpdateStatus];
export declare const SortModelsBy: {
  readonly CREATION_TIME: "CreationTime";
};
export type SortModelsBy = (typeof SortModelsBy)[keyof typeof SortModelsBy];
export declare const SortOrder: {
  readonly ASCENDING: "Ascending";
  readonly DESCENDING: "Descending";
};
export type SortOrder = (typeof SortOrder)[keyof typeof SortOrder];
export declare const ReasoningEffort: {
  readonly HIGH: "high";
  readonly LOW: "low";
  readonly MEDIUM: "medium";
};
export type ReasoningEffort =
  (typeof ReasoningEffort)[keyof typeof ReasoningEffort];
export declare const CustomizationType: {
  readonly CONTINUED_PRE_TRAINING: "CONTINUED_PRE_TRAINING";
  readonly DISTILLATION: "DISTILLATION";
  readonly FINE_TUNING: "FINE_TUNING";
  readonly IMPORTED: "IMPORTED";
  readonly REINFORCEMENT_FINE_TUNING: "REINFORCEMENT_FINE_TUNING";
};
export type CustomizationType =
  (typeof CustomizationType)[keyof typeof CustomizationType];
export declare const ModelStatus: {
  readonly ACTIVE: "Active";
  readonly CREATING: "Creating";
  readonly FAILED: "Failed";
};
export type ModelStatus = (typeof ModelStatus)[keyof typeof ModelStatus];
export declare const EvaluationJobStatus: {
  readonly COMPLETED: "Completed";
  readonly DELETING: "Deleting";
  readonly FAILED: "Failed";
  readonly IN_PROGRESS: "InProgress";
  readonly STOPPED: "Stopped";
  readonly STOPPING: "Stopping";
};
export type EvaluationJobStatus =
  (typeof EvaluationJobStatus)[keyof typeof EvaluationJobStatus];
export declare const ApplicationType: {
  readonly MODEL_EVALUATION: "ModelEvaluation";
  readonly RAG_EVALUATION: "RagEvaluation";
};
export type ApplicationType =
  (typeof ApplicationType)[keyof typeof ApplicationType];
export declare const EvaluationTaskType: {
  readonly CLASSIFICATION: "Classification";
  readonly CUSTOM: "Custom";
  readonly GENERATION: "Generation";
  readonly QUESTION_AND_ANSWER: "QuestionAndAnswer";
  readonly SUMMARIZATION: "Summarization";
};
export type EvaluationTaskType =
  (typeof EvaluationTaskType)[keyof typeof EvaluationTaskType];
export declare const PerformanceConfigLatency: {
  readonly OPTIMIZED: "optimized";
  readonly STANDARD: "standard";
};
export type PerformanceConfigLatency =
  (typeof PerformanceConfigLatency)[keyof typeof PerformanceConfigLatency];
export declare const ExternalSourceType: {
  readonly BYTE_CONTENT: "BYTE_CONTENT";
  readonly S3: "S3";
};
export type ExternalSourceType =
  (typeof ExternalSourceType)[keyof typeof ExternalSourceType];
export declare const QueryTransformationType: {
  readonly QUERY_DECOMPOSITION: "QUERY_DECOMPOSITION";
};
export type QueryTransformationType =
  (typeof QueryTransformationType)[keyof typeof QueryTransformationType];
export declare const AttributeType: {
  readonly BOOLEAN: "BOOLEAN";
  readonly NUMBER: "NUMBER";
  readonly STRING: "STRING";
  readonly STRING_LIST: "STRING_LIST";
};
export type AttributeType = (typeof AttributeType)[keyof typeof AttributeType];
export declare const SearchType: {
  readonly HYBRID: "HYBRID";
  readonly SEMANTIC: "SEMANTIC";
};
export type SearchType = (typeof SearchType)[keyof typeof SearchType];
export declare const RerankingMetadataSelectionMode: {
  readonly ALL: "ALL";
  readonly SELECTIVE: "SELECTIVE";
};
export type RerankingMetadataSelectionMode =
  (typeof RerankingMetadataSelectionMode)[keyof typeof RerankingMetadataSelectionMode];
export declare const VectorSearchRerankingConfigurationType: {
  readonly BEDROCK_RERANKING_MODEL: "BEDROCK_RERANKING_MODEL";
};
export type VectorSearchRerankingConfigurationType =
  (typeof VectorSearchRerankingConfigurationType)[keyof typeof VectorSearchRerankingConfigurationType];
export declare const RetrieveAndGenerateType: {
  readonly EXTERNAL_SOURCES: "EXTERNAL_SOURCES";
  readonly KNOWLEDGE_BASE: "KNOWLEDGE_BASE";
};
export type RetrieveAndGenerateType =
  (typeof RetrieveAndGenerateType)[keyof typeof RetrieveAndGenerateType];
export declare const EvaluationJobType: {
  readonly AUTOMATED: "Automated";
  readonly HUMAN: "Human";
};
export type EvaluationJobType =
  (typeof EvaluationJobType)[keyof typeof EvaluationJobType];
export declare const SortJobsBy: {
  readonly CREATION_TIME: "CreationTime";
};
export type SortJobsBy = (typeof SortJobsBy)[keyof typeof SortJobsBy];
export declare const GuardrailContentFilterAction: {
  readonly BLOCK: "BLOCK";
  readonly NONE: "NONE";
};
export type GuardrailContentFilterAction =
  (typeof GuardrailContentFilterAction)[keyof typeof GuardrailContentFilterAction];
export declare const GuardrailModality: {
  readonly IMAGE: "IMAGE";
  readonly TEXT: "TEXT";
};
export type GuardrailModality =
  (typeof GuardrailModality)[keyof typeof GuardrailModality];
export declare const GuardrailFilterStrength: {
  readonly HIGH: "HIGH";
  readonly LOW: "LOW";
  readonly MEDIUM: "MEDIUM";
  readonly NONE: "NONE";
};
export type GuardrailFilterStrength =
  (typeof GuardrailFilterStrength)[keyof typeof GuardrailFilterStrength];
export declare const GuardrailContentFilterType: {
  readonly HATE: "HATE";
  readonly INSULTS: "INSULTS";
  readonly MISCONDUCT: "MISCONDUCT";
  readonly PROMPT_ATTACK: "PROMPT_ATTACK";
  readonly SEXUAL: "SEXUAL";
  readonly VIOLENCE: "VIOLENCE";
};
export type GuardrailContentFilterType =
  (typeof GuardrailContentFilterType)[keyof typeof GuardrailContentFilterType];
export declare const GuardrailContentFiltersTierName: {
  readonly CLASSIC: "CLASSIC";
  readonly STANDARD: "STANDARD";
};
export type GuardrailContentFiltersTierName =
  (typeof GuardrailContentFiltersTierName)[keyof typeof GuardrailContentFiltersTierName];
export declare const GuardrailContextualGroundingAction: {
  readonly BLOCK: "BLOCK";
  readonly NONE: "NONE";
};
export type GuardrailContextualGroundingAction =
  (typeof GuardrailContextualGroundingAction)[keyof typeof GuardrailContextualGroundingAction];
export declare const GuardrailContextualGroundingFilterType: {
  readonly GROUNDING: "GROUNDING";
  readonly RELEVANCE: "RELEVANCE";
};
export type GuardrailContextualGroundingFilterType =
  (typeof GuardrailContextualGroundingFilterType)[keyof typeof GuardrailContextualGroundingFilterType];
export declare const GuardrailSensitiveInformationAction: {
  readonly ANONYMIZE: "ANONYMIZE";
  readonly BLOCK: "BLOCK";
  readonly NONE: "NONE";
};
export type GuardrailSensitiveInformationAction =
  (typeof GuardrailSensitiveInformationAction)[keyof typeof GuardrailSensitiveInformationAction];
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
export type GuardrailPiiEntityType =
  (typeof GuardrailPiiEntityType)[keyof typeof GuardrailPiiEntityType];
export declare const GuardrailTopicsTierName: {
  readonly CLASSIC: "CLASSIC";
  readonly STANDARD: "STANDARD";
};
export type GuardrailTopicsTierName =
  (typeof GuardrailTopicsTierName)[keyof typeof GuardrailTopicsTierName];
export declare const GuardrailTopicAction: {
  readonly BLOCK: "BLOCK";
  readonly NONE: "NONE";
};
export type GuardrailTopicAction =
  (typeof GuardrailTopicAction)[keyof typeof GuardrailTopicAction];
export declare const GuardrailTopicType: {
  readonly DENY: "DENY";
};
export type GuardrailTopicType =
  (typeof GuardrailTopicType)[keyof typeof GuardrailTopicType];
export declare const GuardrailWordAction: {
  readonly BLOCK: "BLOCK";
  readonly NONE: "NONE";
};
export type GuardrailWordAction =
  (typeof GuardrailWordAction)[keyof typeof GuardrailWordAction];
export declare const GuardrailManagedWordsType: {
  readonly PROFANITY: "PROFANITY";
};
export type GuardrailManagedWordsType =
  (typeof GuardrailManagedWordsType)[keyof typeof GuardrailManagedWordsType];
export declare const GuardrailStatus: {
  readonly CREATING: "CREATING";
  readonly DELETING: "DELETING";
  readonly FAILED: "FAILED";
  readonly READY: "READY";
  readonly UPDATING: "UPDATING";
  readonly VERSIONING: "VERSIONING";
};
export type GuardrailStatus =
  (typeof GuardrailStatus)[keyof typeof GuardrailStatus];
export declare const InferenceProfileStatus: {
  readonly ACTIVE: "ACTIVE";
};
export type InferenceProfileStatus =
  (typeof InferenceProfileStatus)[keyof typeof InferenceProfileStatus];
export declare const InferenceProfileType: {
  readonly APPLICATION: "APPLICATION";
  readonly SYSTEM_DEFINED: "SYSTEM_DEFINED";
};
export type InferenceProfileType =
  (typeof InferenceProfileType)[keyof typeof InferenceProfileType];
export declare const ModelCopyJobStatus: {
  readonly COMPLETED: "Completed";
  readonly FAILED: "Failed";
  readonly IN_PROGRESS: "InProgress";
};
export type ModelCopyJobStatus =
  (typeof ModelCopyJobStatus)[keyof typeof ModelCopyJobStatus];
export declare const ModelImportJobStatus: {
  readonly COMPLETED: "Completed";
  readonly FAILED: "Failed";
  readonly IN_PROGRESS: "InProgress";
};
export type ModelImportJobStatus =
  (typeof ModelImportJobStatus)[keyof typeof ModelImportJobStatus];
export declare const S3InputFormat: {
  readonly JSONL: "JSONL";
};
export type S3InputFormat = (typeof S3InputFormat)[keyof typeof S3InputFormat];
export declare const ModelInvocationType: {
  readonly Converse: "Converse";
  readonly InvokeModel: "InvokeModel";
};
export type ModelInvocationType =
  (typeof ModelInvocationType)[keyof typeof ModelInvocationType];
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
export type ModelInvocationJobStatus =
  (typeof ModelInvocationJobStatus)[keyof typeof ModelInvocationJobStatus];
export declare const ModelCustomization: {
  readonly CONTINUED_PRE_TRAINING: "CONTINUED_PRE_TRAINING";
  readonly DISTILLATION: "DISTILLATION";
  readonly FINE_TUNING: "FINE_TUNING";
};
export type ModelCustomization =
  (typeof ModelCustomization)[keyof typeof ModelCustomization];
export declare const InferenceType: {
  readonly ON_DEMAND: "ON_DEMAND";
  readonly PROVISIONED: "PROVISIONED";
};
export type InferenceType = (typeof InferenceType)[keyof typeof InferenceType];
export declare const ModelModality: {
  readonly EMBEDDING: "EMBEDDING";
  readonly IMAGE: "IMAGE";
  readonly TEXT: "TEXT";
};
export type ModelModality = (typeof ModelModality)[keyof typeof ModelModality];
export declare const FoundationModelLifecycleStatus: {
  readonly ACTIVE: "ACTIVE";
  readonly LEGACY: "LEGACY";
};
export type FoundationModelLifecycleStatus =
  (typeof FoundationModelLifecycleStatus)[keyof typeof FoundationModelLifecycleStatus];
export declare const PromptRouterStatus: {
  readonly AVAILABLE: "AVAILABLE";
};
export type PromptRouterStatus =
  (typeof PromptRouterStatus)[keyof typeof PromptRouterStatus];
export declare const PromptRouterType: {
  readonly CUSTOM: "custom";
  readonly DEFAULT: "default";
};
export type PromptRouterType =
  (typeof PromptRouterType)[keyof typeof PromptRouterType];
export declare const CommitmentDuration: {
  readonly ONE_MONTH: "OneMonth";
  readonly SIX_MONTHS: "SixMonths";
};
export type CommitmentDuration =
  (typeof CommitmentDuration)[keyof typeof CommitmentDuration];
export declare const ProvisionedModelStatus: {
  readonly CREATING: "Creating";
  readonly FAILED: "Failed";
  readonly IN_SERVICE: "InService";
  readonly UPDATING: "Updating";
};
export type ProvisionedModelStatus =
  (typeof ProvisionedModelStatus)[keyof typeof ProvisionedModelStatus];
export declare const SortByProvisionedModels: {
  readonly CREATION_TIME: "CreationTime";
};
export type SortByProvisionedModels =
  (typeof SortByProvisionedModels)[keyof typeof SortByProvisionedModels];
export declare const AuthorizationStatus: {
  readonly AUTHORIZED: "AUTHORIZED";
  readonly NOT_AUTHORIZED: "NOT_AUTHORIZED";
};
export type AuthorizationStatus =
  (typeof AuthorizationStatus)[keyof typeof AuthorizationStatus];
export declare const EntitlementAvailability: {
  readonly AVAILABLE: "AVAILABLE";
  readonly NOT_AVAILABLE: "NOT_AVAILABLE";
};
export type EntitlementAvailability =
  (typeof EntitlementAvailability)[keyof typeof EntitlementAvailability];
export declare const RegionAvailability: {
  readonly AVAILABLE: "AVAILABLE";
  readonly NOT_AVAILABLE: "NOT_AVAILABLE";
};
export type RegionAvailability =
  (typeof RegionAvailability)[keyof typeof RegionAvailability];
export declare const OfferType: {
  readonly ALL: "ALL";
  readonly PUBLIC: "PUBLIC";
};
export type OfferType = (typeof OfferType)[keyof typeof OfferType];
export declare const ModelCustomizationJobStatus: {
  readonly COMPLETED: "Completed";
  readonly FAILED: "Failed";
  readonly IN_PROGRESS: "InProgress";
  readonly STOPPED: "Stopped";
  readonly STOPPING: "Stopping";
};
export type ModelCustomizationJobStatus =
  (typeof ModelCustomizationJobStatus)[keyof typeof ModelCustomizationJobStatus];
export declare const JobStatusDetails: {
  readonly COMPLETED: "Completed";
  readonly FAILED: "Failed";
  readonly IN_PROGRESS: "InProgress";
  readonly NOT_STARTED: "NotStarted";
  readonly STOPPED: "Stopped";
  readonly STOPPING: "Stopping";
};
export type JobStatusDetails =
  (typeof JobStatusDetails)[keyof typeof JobStatusDetails];
export declare const FineTuningJobStatus: {
  readonly COMPLETED: "Completed";
  readonly FAILED: "Failed";
  readonly IN_PROGRESS: "InProgress";
  readonly STOPPED: "Stopped";
  readonly STOPPING: "Stopping";
};
export type FineTuningJobStatus =
  (typeof FineTuningJobStatus)[keyof typeof FineTuningJobStatus];
