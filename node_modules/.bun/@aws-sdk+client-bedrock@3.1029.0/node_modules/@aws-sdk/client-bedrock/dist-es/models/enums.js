export const SelectiveGuardingMode = {
    COMPREHENSIVE: "COMPREHENSIVE",
    SELECTIVE: "SELECTIVE",
};
export const InputTags = {
    HONOR: "HONOR",
    IGNORE: "IGNORE",
};
export const ConfigurationOwner = {
    ACCOUNT: "ACCOUNT",
};
export const AgreementStatus = {
    AVAILABLE: "AVAILABLE",
    ERROR: "ERROR",
    NOT_AVAILABLE: "NOT_AVAILABLE",
    PENDING: "PENDING",
};
export const AutomatedReasoningCheckResult = {
    IMPOSSIBLE: "IMPOSSIBLE",
    INVALID: "INVALID",
    NO_TRANSLATION: "NO_TRANSLATION",
    SATISFIABLE: "SATISFIABLE",
    TOO_COMPLEX: "TOO_COMPLEX",
    TRANSLATION_AMBIGUOUS: "TRANSLATION_AMBIGUOUS",
    VALID: "VALID",
};
export const AutomatedReasoningPolicyBuildWorkflowType = {
    GENERATE_FIDELITY_REPORT: "GENERATE_FIDELITY_REPORT",
    GENERATE_POLICY_SCENARIOS: "GENERATE_POLICY_SCENARIOS",
    IMPORT_POLICY: "IMPORT_POLICY",
    INGEST_CONTENT: "INGEST_CONTENT",
    REFINE_POLICY: "REFINE_POLICY",
};
export const AutomatedReasoningPolicyBuildDocumentContentType = {
    PDF: "pdf",
    TEXT: "txt",
};
export const AutomatedReasoningPolicyBuildWorkflowStatus = {
    BUILDING: "BUILDING",
    CANCELLED: "CANCELLED",
    CANCEL_REQUESTED: "CANCEL_REQUESTED",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    PREPROCESSING: "PREPROCESSING",
    SCHEDULED: "SCHEDULED",
    TESTING: "TESTING",
};
export const AutomatedReasoningPolicyBuildResultAssetType = {
    ASSET_MANIFEST: "ASSET_MANIFEST",
    BUILD_LOG: "BUILD_LOG",
    FIDELITY_REPORT: "FIDELITY_REPORT",
    GENERATED_TEST_CASES: "GENERATED_TEST_CASES",
    POLICY_DEFINITION: "POLICY_DEFINITION",
    POLICY_SCENARIOS: "POLICY_SCENARIOS",
    QUALITY_REPORT: "QUALITY_REPORT",
    SOURCE_DOCUMENT: "SOURCE_DOCUMENT",
};
export const AutomatedReasoningPolicyBuildMessageType = {
    ERROR: "ERROR",
    INFO: "INFO",
    WARNING: "WARNING",
};
export const AutomatedReasoningPolicyAnnotationStatus = {
    APPLIED: "APPLIED",
    FAILED: "FAILED",
};
export const AutomatedReasoningCheckLogicWarningType = {
    ALWAYS_FALSE: "ALWAYS_FALSE",
    ALWAYS_TRUE: "ALWAYS_TRUE",
};
export const AutomatedReasoningPolicyTestRunResult = {
    FAILED: "FAILED",
    PASSED: "PASSED",
};
export const AutomatedReasoningPolicyTestRunStatus = {
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    IN_PROGRESS: "IN_PROGRESS",
    NOT_STARTED: "NOT_STARTED",
    SCHEDULED: "SCHEDULED",
};
export const Status = {
    INCOMPATIBLE_ENDPOINT: "INCOMPATIBLE_ENDPOINT",
    REGISTERED: "REGISTERED",
};
export const CustomModelDeploymentStatus = {
    ACTIVE: "Active",
    CREATING: "Creating",
    FAILED: "Failed",
};
export const CustomModelDeploymentUpdateStatus = {
    UPDATE_COMPLETED: "UpdateCompleted",
    UPDATE_FAILED: "UpdateFailed",
    UPDATING: "Updating",
};
export const SortModelsBy = {
    CREATION_TIME: "CreationTime",
};
export const SortOrder = {
    ASCENDING: "Ascending",
    DESCENDING: "Descending",
};
export const ReasoningEffort = {
    HIGH: "high",
    LOW: "low",
    MEDIUM: "medium",
};
export const CustomizationType = {
    CONTINUED_PRE_TRAINING: "CONTINUED_PRE_TRAINING",
    DISTILLATION: "DISTILLATION",
    FINE_TUNING: "FINE_TUNING",
    IMPORTED: "IMPORTED",
    REINFORCEMENT_FINE_TUNING: "REINFORCEMENT_FINE_TUNING",
};
export const ModelStatus = {
    ACTIVE: "Active",
    CREATING: "Creating",
    FAILED: "Failed",
};
export const EvaluationJobStatus = {
    COMPLETED: "Completed",
    DELETING: "Deleting",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
    STOPPED: "Stopped",
    STOPPING: "Stopping",
};
export const ApplicationType = {
    MODEL_EVALUATION: "ModelEvaluation",
    RAG_EVALUATION: "RagEvaluation",
};
export const EvaluationTaskType = {
    CLASSIFICATION: "Classification",
    CUSTOM: "Custom",
    GENERATION: "Generation",
    QUESTION_AND_ANSWER: "QuestionAndAnswer",
    SUMMARIZATION: "Summarization",
};
export const PerformanceConfigLatency = {
    OPTIMIZED: "optimized",
    STANDARD: "standard",
};
export const ExternalSourceType = {
    BYTE_CONTENT: "BYTE_CONTENT",
    S3: "S3",
};
export const QueryTransformationType = {
    QUERY_DECOMPOSITION: "QUERY_DECOMPOSITION",
};
export const AttributeType = {
    BOOLEAN: "BOOLEAN",
    NUMBER: "NUMBER",
    STRING: "STRING",
    STRING_LIST: "STRING_LIST",
};
export const SearchType = {
    HYBRID: "HYBRID",
    SEMANTIC: "SEMANTIC",
};
export const RerankingMetadataSelectionMode = {
    ALL: "ALL",
    SELECTIVE: "SELECTIVE",
};
export const VectorSearchRerankingConfigurationType = {
    BEDROCK_RERANKING_MODEL: "BEDROCK_RERANKING_MODEL",
};
export const RetrieveAndGenerateType = {
    EXTERNAL_SOURCES: "EXTERNAL_SOURCES",
    KNOWLEDGE_BASE: "KNOWLEDGE_BASE",
};
export const EvaluationJobType = {
    AUTOMATED: "Automated",
    HUMAN: "Human",
};
export const SortJobsBy = {
    CREATION_TIME: "CreationTime",
};
export const GuardrailContentFilterAction = {
    BLOCK: "BLOCK",
    NONE: "NONE",
};
export const GuardrailModality = {
    IMAGE: "IMAGE",
    TEXT: "TEXT",
};
export const GuardrailFilterStrength = {
    HIGH: "HIGH",
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    NONE: "NONE",
};
export const GuardrailContentFilterType = {
    HATE: "HATE",
    INSULTS: "INSULTS",
    MISCONDUCT: "MISCONDUCT",
    PROMPT_ATTACK: "PROMPT_ATTACK",
    SEXUAL: "SEXUAL",
    VIOLENCE: "VIOLENCE",
};
export const GuardrailContentFiltersTierName = {
    CLASSIC: "CLASSIC",
    STANDARD: "STANDARD",
};
export const GuardrailContextualGroundingAction = {
    BLOCK: "BLOCK",
    NONE: "NONE",
};
export const GuardrailContextualGroundingFilterType = {
    GROUNDING: "GROUNDING",
    RELEVANCE: "RELEVANCE",
};
export const GuardrailSensitiveInformationAction = {
    ANONYMIZE: "ANONYMIZE",
    BLOCK: "BLOCK",
    NONE: "NONE",
};
export const GuardrailPiiEntityType = {
    ADDRESS: "ADDRESS",
    AGE: "AGE",
    AWS_ACCESS_KEY: "AWS_ACCESS_KEY",
    AWS_SECRET_KEY: "AWS_SECRET_KEY",
    CA_HEALTH_NUMBER: "CA_HEALTH_NUMBER",
    CA_SOCIAL_INSURANCE_NUMBER: "CA_SOCIAL_INSURANCE_NUMBER",
    CREDIT_DEBIT_CARD_CVV: "CREDIT_DEBIT_CARD_CVV",
    CREDIT_DEBIT_CARD_EXPIRY: "CREDIT_DEBIT_CARD_EXPIRY",
    CREDIT_DEBIT_CARD_NUMBER: "CREDIT_DEBIT_CARD_NUMBER",
    DRIVER_ID: "DRIVER_ID",
    EMAIL: "EMAIL",
    INTERNATIONAL_BANK_ACCOUNT_NUMBER: "INTERNATIONAL_BANK_ACCOUNT_NUMBER",
    IP_ADDRESS: "IP_ADDRESS",
    LICENSE_PLATE: "LICENSE_PLATE",
    MAC_ADDRESS: "MAC_ADDRESS",
    NAME: "NAME",
    PASSWORD: "PASSWORD",
    PHONE: "PHONE",
    PIN: "PIN",
    SWIFT_CODE: "SWIFT_CODE",
    UK_NATIONAL_HEALTH_SERVICE_NUMBER: "UK_NATIONAL_HEALTH_SERVICE_NUMBER",
    UK_NATIONAL_INSURANCE_NUMBER: "UK_NATIONAL_INSURANCE_NUMBER",
    UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER: "UK_UNIQUE_TAXPAYER_REFERENCE_NUMBER",
    URL: "URL",
    USERNAME: "USERNAME",
    US_BANK_ACCOUNT_NUMBER: "US_BANK_ACCOUNT_NUMBER",
    US_BANK_ROUTING_NUMBER: "US_BANK_ROUTING_NUMBER",
    US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER: "US_INDIVIDUAL_TAX_IDENTIFICATION_NUMBER",
    US_PASSPORT_NUMBER: "US_PASSPORT_NUMBER",
    US_SOCIAL_SECURITY_NUMBER: "US_SOCIAL_SECURITY_NUMBER",
    VEHICLE_IDENTIFICATION_NUMBER: "VEHICLE_IDENTIFICATION_NUMBER",
};
export const GuardrailTopicsTierName = {
    CLASSIC: "CLASSIC",
    STANDARD: "STANDARD",
};
export const GuardrailTopicAction = {
    BLOCK: "BLOCK",
    NONE: "NONE",
};
export const GuardrailTopicType = {
    DENY: "DENY",
};
export const GuardrailWordAction = {
    BLOCK: "BLOCK",
    NONE: "NONE",
};
export const GuardrailManagedWordsType = {
    PROFANITY: "PROFANITY",
};
export const GuardrailStatus = {
    CREATING: "CREATING",
    DELETING: "DELETING",
    FAILED: "FAILED",
    READY: "READY",
    UPDATING: "UPDATING",
    VERSIONING: "VERSIONING",
};
export const InferenceProfileStatus = {
    ACTIVE: "ACTIVE",
};
export const InferenceProfileType = {
    APPLICATION: "APPLICATION",
    SYSTEM_DEFINED: "SYSTEM_DEFINED",
};
export const ModelCopyJobStatus = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
};
export const ModelImportJobStatus = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
};
export const S3InputFormat = {
    JSONL: "JSONL",
};
export const ModelInvocationType = {
    Converse: "Converse",
    InvokeModel: "InvokeModel",
};
export const ModelInvocationJobStatus = {
    COMPLETED: "Completed",
    EXPIRED: "Expired",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
    PARTIALLY_COMPLETED: "PartiallyCompleted",
    SCHEDULED: "Scheduled",
    STOPPED: "Stopped",
    STOPPING: "Stopping",
    SUBMITTED: "Submitted",
    VALIDATING: "Validating",
};
export const ModelCustomization = {
    CONTINUED_PRE_TRAINING: "CONTINUED_PRE_TRAINING",
    DISTILLATION: "DISTILLATION",
    FINE_TUNING: "FINE_TUNING",
};
export const InferenceType = {
    ON_DEMAND: "ON_DEMAND",
    PROVISIONED: "PROVISIONED",
};
export const ModelModality = {
    EMBEDDING: "EMBEDDING",
    IMAGE: "IMAGE",
    TEXT: "TEXT",
};
export const FoundationModelLifecycleStatus = {
    ACTIVE: "ACTIVE",
    LEGACY: "LEGACY",
};
export const PromptRouterStatus = {
    AVAILABLE: "AVAILABLE",
};
export const PromptRouterType = {
    CUSTOM: "custom",
    DEFAULT: "default",
};
export const CommitmentDuration = {
    ONE_MONTH: "OneMonth",
    SIX_MONTHS: "SixMonths",
};
export const ProvisionedModelStatus = {
    CREATING: "Creating",
    FAILED: "Failed",
    IN_SERVICE: "InService",
    UPDATING: "Updating",
};
export const SortByProvisionedModels = {
    CREATION_TIME: "CreationTime",
};
export const AuthorizationStatus = {
    AUTHORIZED: "AUTHORIZED",
    NOT_AUTHORIZED: "NOT_AUTHORIZED",
};
export const EntitlementAvailability = {
    AVAILABLE: "AVAILABLE",
    NOT_AVAILABLE: "NOT_AVAILABLE",
};
export const RegionAvailability = {
    AVAILABLE: "AVAILABLE",
    NOT_AVAILABLE: "NOT_AVAILABLE",
};
export const OfferType = {
    ALL: "ALL",
    PUBLIC: "PUBLIC",
};
export const ModelCustomizationJobStatus = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
    STOPPED: "Stopped",
    STOPPING: "Stopping",
};
export const JobStatusDetails = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
    NOT_STARTED: "NotStarted",
    STOPPED: "Stopped",
    STOPPING: "Stopping",
};
export const FineTuningJobStatus = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
    STOPPED: "Stopped",
    STOPPING: "Stopping",
};
