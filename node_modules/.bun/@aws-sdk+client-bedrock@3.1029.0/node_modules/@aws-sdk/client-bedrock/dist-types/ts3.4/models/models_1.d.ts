import {
  ApplicationType,
  AuthorizationStatus,
  CommitmentDuration,
  CustomizationType,
  EntitlementAvailability,
  EvaluationJobStatus,
  EvaluationJobType,
  FineTuningJobStatus,
  FoundationModelLifecycleStatus,
  GuardrailManagedWordsType,
  GuardrailStatus,
  GuardrailTopicAction,
  GuardrailTopicsTierName,
  GuardrailTopicType,
  GuardrailWordAction,
  InferenceProfileStatus,
  InferenceProfileType,
  InferenceType,
  JobStatusDetails,
  ModelCopyJobStatus,
  ModelCustomization,
  ModelCustomizationJobStatus,
  ModelImportJobStatus,
  ModelInvocationJobStatus,
  ModelInvocationType,
  ModelModality,
  OfferType,
  PromptRouterStatus,
  PromptRouterType,
  ProvisionedModelStatus,
  RegionAvailability,
  RetrieveAndGenerateType,
  S3InputFormat,
  SearchType,
  SortByProvisionedModels,
  SortJobsBy,
  SortModelsBy,
  SortOrder,
} from "./enums";
import {
  AgreementAvailability,
  CustomizationConfig,
  EvaluationConfig,
  EvaluationModelConfig,
  EvaluationOutputDataConfig,
  EvaluationPrecomputedRagSourceConfig,
  ExternalSourcesRetrieveAndGenerateConfiguration,
  FilterAttribute,
  GenerationConfiguration,
  GuardrailAutomatedReasoningPolicy,
  GuardrailAutomatedReasoningPolicyConfig,
  GuardrailContentPolicy,
  GuardrailContentPolicyConfig,
  GuardrailContextualGroundingPolicy,
  GuardrailContextualGroundingPolicyConfig,
  GuardrailCrossRegionConfig,
  GuardrailCrossRegionDetails,
  GuardrailPiiEntity,
  GuardrailRegex,
  GuardrailSensitiveInformationPolicyConfig,
  GuardrailTopicPolicyConfig,
  GuardrailWordPolicyConfig,
  ImplicitFilterConfiguration,
  ModelDataSource,
  OrchestrationConfiguration,
  OutputDataConfig,
  Tag,
  TrainingDataConfig,
  TrainingMetrics,
  ValidationDataConfig,
  ValidatorMetric,
  VectorSearchRerankingConfiguration,
  VpcConfig,
} from "./models_0";
export interface GuardrailSensitiveInformationPolicy {
  piiEntities?: GuardrailPiiEntity[] | undefined;
  regexes?: GuardrailRegex[] | undefined;
}
export interface GuardrailTopicsTier {
  tierName: GuardrailTopicsTierName | undefined;
}
export interface GuardrailTopic {
  name: string | undefined;
  definition: string | undefined;
  examples?: string[] | undefined;
  type?: GuardrailTopicType | undefined;
  inputAction?: GuardrailTopicAction | undefined;
  outputAction?: GuardrailTopicAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailTopicPolicy {
  topics: GuardrailTopic[] | undefined;
  tier?: GuardrailTopicsTier | undefined;
}
export interface GuardrailManagedWords {
  type: GuardrailManagedWordsType | undefined;
  inputAction?: GuardrailWordAction | undefined;
  outputAction?: GuardrailWordAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailWord {
  text: string | undefined;
  inputAction?: GuardrailWordAction | undefined;
  outputAction?: GuardrailWordAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailWordPolicy {
  words?: GuardrailWord[] | undefined;
  managedWordLists?: GuardrailManagedWords[] | undefined;
}
export interface GetGuardrailResponse {
  name: string | undefined;
  description?: string | undefined;
  guardrailId: string | undefined;
  guardrailArn: string | undefined;
  version: string | undefined;
  status: GuardrailStatus | undefined;
  topicPolicy?: GuardrailTopicPolicy | undefined;
  contentPolicy?: GuardrailContentPolicy | undefined;
  wordPolicy?: GuardrailWordPolicy | undefined;
  sensitiveInformationPolicy?: GuardrailSensitiveInformationPolicy | undefined;
  contextualGroundingPolicy?: GuardrailContextualGroundingPolicy | undefined;
  automatedReasoningPolicy?: GuardrailAutomatedReasoningPolicy | undefined;
  crossRegionDetails?: GuardrailCrossRegionDetails | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
  statusReasons?: string[] | undefined;
  failureRecommendations?: string[] | undefined;
  blockedInputMessaging: string | undefined;
  blockedOutputsMessaging: string | undefined;
  kmsKeyArn?: string | undefined;
}
export interface ListGuardrailsRequest {
  guardrailIdentifier?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
}
export interface GuardrailSummary {
  id: string | undefined;
  arn: string | undefined;
  status: GuardrailStatus | undefined;
  name: string | undefined;
  description?: string | undefined;
  version: string | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
  crossRegionDetails?: GuardrailCrossRegionDetails | undefined;
}
export interface ListGuardrailsResponse {
  guardrails: GuardrailSummary[] | undefined;
  nextToken?: string | undefined;
}
export interface UpdateGuardrailRequest {
  guardrailIdentifier: string | undefined;
  name: string | undefined;
  description?: string | undefined;
  topicPolicyConfig?: GuardrailTopicPolicyConfig | undefined;
  contentPolicyConfig?: GuardrailContentPolicyConfig | undefined;
  wordPolicyConfig?: GuardrailWordPolicyConfig | undefined;
  sensitiveInformationPolicyConfig?:
    | GuardrailSensitiveInformationPolicyConfig
    | undefined;
  contextualGroundingPolicyConfig?:
    | GuardrailContextualGroundingPolicyConfig
    | undefined;
  automatedReasoningPolicyConfig?:
    | GuardrailAutomatedReasoningPolicyConfig
    | undefined;
  crossRegionConfig?: GuardrailCrossRegionConfig | undefined;
  blockedInputMessaging: string | undefined;
  blockedOutputsMessaging: string | undefined;
  kmsKeyId?: string | undefined;
}
export interface UpdateGuardrailResponse {
  guardrailId: string | undefined;
  guardrailArn: string | undefined;
  version: string | undefined;
  updatedAt: Date | undefined;
}
export type InferenceProfileModelSource =
  | InferenceProfileModelSource.CopyFromMember
  | InferenceProfileModelSource.$UnknownMember;
export declare namespace InferenceProfileModelSource {
  interface CopyFromMember {
    copyFrom: string;
    $unknown?: never;
  }
  interface $UnknownMember {
    copyFrom?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    copyFrom: (value: string) => T;
    _: (name: string, value: any) => T;
  }
}
export interface CreateInferenceProfileRequest {
  inferenceProfileName: string | undefined;
  description?: string | undefined;
  clientRequestToken?: string | undefined;
  modelSource: InferenceProfileModelSource | undefined;
  tags?: Tag[] | undefined;
}
export interface CreateInferenceProfileResponse {
  inferenceProfileArn: string | undefined;
  status?: InferenceProfileStatus | undefined;
}
export interface DeleteInferenceProfileRequest {
  inferenceProfileIdentifier: string | undefined;
}
export interface DeleteInferenceProfileResponse {}
export interface GetInferenceProfileRequest {
  inferenceProfileIdentifier: string | undefined;
}
export interface InferenceProfileModel {
  modelArn?: string | undefined;
}
export interface GetInferenceProfileResponse {
  inferenceProfileName: string | undefined;
  description?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
  inferenceProfileArn: string | undefined;
  models: InferenceProfileModel[] | undefined;
  inferenceProfileId: string | undefined;
  status: InferenceProfileStatus | undefined;
  type: InferenceProfileType | undefined;
}
export interface ListInferenceProfilesRequest {
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  typeEquals?: InferenceProfileType | undefined;
}
export interface InferenceProfileSummary {
  inferenceProfileName: string | undefined;
  description?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
  inferenceProfileArn: string | undefined;
  models: InferenceProfileModel[] | undefined;
  inferenceProfileId: string | undefined;
  status: InferenceProfileStatus | undefined;
  type: InferenceProfileType | undefined;
}
export interface ListInferenceProfilesResponse {
  inferenceProfileSummaries?: InferenceProfileSummary[] | undefined;
  nextToken?: string | undefined;
}
export interface DeleteModelInvocationLoggingConfigurationRequest {}
export interface DeleteModelInvocationLoggingConfigurationResponse {}
export interface GetModelInvocationLoggingConfigurationRequest {}
export interface S3Config {
  bucketName: string | undefined;
  keyPrefix?: string | undefined;
}
export interface CloudWatchConfig {
  logGroupName: string | undefined;
  roleArn: string | undefined;
  largeDataDeliveryS3Config?: S3Config | undefined;
}
export interface LoggingConfig {
  cloudWatchConfig?: CloudWatchConfig | undefined;
  s3Config?: S3Config | undefined;
  textDataDeliveryEnabled?: boolean | undefined;
  imageDataDeliveryEnabled?: boolean | undefined;
  embeddingDataDeliveryEnabled?: boolean | undefined;
  videoDataDeliveryEnabled?: boolean | undefined;
  audioDataDeliveryEnabled?: boolean | undefined;
}
export interface GetModelInvocationLoggingConfigurationResponse {
  loggingConfig?: LoggingConfig | undefined;
}
export interface PutModelInvocationLoggingConfigurationRequest {
  loggingConfig: LoggingConfig | undefined;
}
export interface PutModelInvocationLoggingConfigurationResponse {}
export interface CreateModelCopyJobRequest {
  sourceModelArn: string | undefined;
  targetModelName: string | undefined;
  modelKmsKeyId?: string | undefined;
  targetModelTags?: Tag[] | undefined;
  clientRequestToken?: string | undefined;
}
export interface CreateModelCopyJobResponse {
  jobArn: string | undefined;
}
export interface GetModelCopyJobRequest {
  jobArn: string | undefined;
}
export interface GetModelCopyJobResponse {
  jobArn: string | undefined;
  status: ModelCopyJobStatus | undefined;
  creationTime: Date | undefined;
  targetModelArn: string | undefined;
  targetModelName?: string | undefined;
  sourceAccountId: string | undefined;
  sourceModelArn: string | undefined;
  targetModelKmsKeyArn?: string | undefined;
  targetModelTags?: Tag[] | undefined;
  failureMessage?: string | undefined;
  sourceModelName?: string | undefined;
}
export interface ListModelCopyJobsRequest {
  creationTimeAfter?: Date | undefined;
  creationTimeBefore?: Date | undefined;
  statusEquals?: ModelCopyJobStatus | undefined;
  sourceAccountEquals?: string | undefined;
  sourceModelArnEquals?: string | undefined;
  targetModelNameContains?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  sortBy?: SortJobsBy | undefined;
  sortOrder?: SortOrder | undefined;
}
export interface ModelCopyJobSummary {
  jobArn: string | undefined;
  status: ModelCopyJobStatus | undefined;
  creationTime: Date | undefined;
  targetModelArn: string | undefined;
  targetModelName?: string | undefined;
  sourceAccountId: string | undefined;
  sourceModelArn: string | undefined;
  targetModelKmsKeyArn?: string | undefined;
  targetModelTags?: Tag[] | undefined;
  failureMessage?: string | undefined;
  sourceModelName?: string | undefined;
}
export interface ListModelCopyJobsResponse {
  nextToken?: string | undefined;
  modelCopyJobSummaries?: ModelCopyJobSummary[] | undefined;
}
export interface CreateModelImportJobRequest {
  jobName: string | undefined;
  importedModelName: string | undefined;
  roleArn: string | undefined;
  modelDataSource: ModelDataSource | undefined;
  jobTags?: Tag[] | undefined;
  importedModelTags?: Tag[] | undefined;
  clientRequestToken?: string | undefined;
  vpcConfig?: VpcConfig | undefined;
  importedModelKmsKeyId?: string | undefined;
}
export interface CreateModelImportJobResponse {
  jobArn: string | undefined;
}
export interface DeleteImportedModelRequest {
  modelIdentifier: string | undefined;
}
export interface DeleteImportedModelResponse {}
export interface GetImportedModelRequest {
  modelIdentifier: string | undefined;
}
export interface CustomModelUnits {
  customModelUnitsPerModelCopy?: number | undefined;
  customModelUnitsVersion?: string | undefined;
}
export interface GetImportedModelResponse {
  modelArn?: string | undefined;
  modelName?: string | undefined;
  jobName?: string | undefined;
  jobArn?: string | undefined;
  modelDataSource?: ModelDataSource | undefined;
  creationTime?: Date | undefined;
  modelArchitecture?: string | undefined;
  modelKmsKeyArn?: string | undefined;
  instructSupported?: boolean | undefined;
  customModelUnits?: CustomModelUnits | undefined;
}
export interface GetModelImportJobRequest {
  jobIdentifier: string | undefined;
}
export interface GetModelImportJobResponse {
  jobArn?: string | undefined;
  jobName?: string | undefined;
  importedModelName?: string | undefined;
  importedModelArn?: string | undefined;
  roleArn?: string | undefined;
  modelDataSource?: ModelDataSource | undefined;
  status?: ModelImportJobStatus | undefined;
  failureMessage?: string | undefined;
  creationTime?: Date | undefined;
  lastModifiedTime?: Date | undefined;
  endTime?: Date | undefined;
  vpcConfig?: VpcConfig | undefined;
  importedModelKmsKeyArn?: string | undefined;
}
export interface ListImportedModelsRequest {
  creationTimeBefore?: Date | undefined;
  creationTimeAfter?: Date | undefined;
  nameContains?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  sortBy?: SortModelsBy | undefined;
  sortOrder?: SortOrder | undefined;
}
export interface ImportedModelSummary {
  modelArn: string | undefined;
  modelName: string | undefined;
  creationTime: Date | undefined;
  instructSupported?: boolean | undefined;
  modelArchitecture?: string | undefined;
}
export interface ListImportedModelsResponse {
  nextToken?: string | undefined;
  modelSummaries?: ImportedModelSummary[] | undefined;
}
export interface ListModelImportJobsRequest {
  creationTimeAfter?: Date | undefined;
  creationTimeBefore?: Date | undefined;
  statusEquals?: ModelImportJobStatus | undefined;
  nameContains?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  sortBy?: SortJobsBy | undefined;
  sortOrder?: SortOrder | undefined;
}
export interface ModelImportJobSummary {
  jobArn: string | undefined;
  jobName: string | undefined;
  status: ModelImportJobStatus | undefined;
  lastModifiedTime?: Date | undefined;
  creationTime: Date | undefined;
  endTime?: Date | undefined;
  importedModelArn?: string | undefined;
  importedModelName?: string | undefined;
}
export interface ListModelImportJobsResponse {
  nextToken?: string | undefined;
  modelImportJobSummaries?: ModelImportJobSummary[] | undefined;
}
export interface ModelInvocationJobS3InputDataConfig {
  s3InputFormat?: S3InputFormat | undefined;
  s3Uri: string | undefined;
  s3BucketOwner?: string | undefined;
}
export type ModelInvocationJobInputDataConfig =
  | ModelInvocationJobInputDataConfig.S3InputDataConfigMember
  | ModelInvocationJobInputDataConfig.$UnknownMember;
export declare namespace ModelInvocationJobInputDataConfig {
  interface S3InputDataConfigMember {
    s3InputDataConfig: ModelInvocationJobS3InputDataConfig;
    $unknown?: never;
  }
  interface $UnknownMember {
    s3InputDataConfig?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    s3InputDataConfig: (value: ModelInvocationJobS3InputDataConfig) => T;
    _: (name: string, value: any) => T;
  }
}
export interface ModelInvocationJobS3OutputDataConfig {
  s3Uri: string | undefined;
  s3EncryptionKeyId?: string | undefined;
  s3BucketOwner?: string | undefined;
}
export type ModelInvocationJobOutputDataConfig =
  | ModelInvocationJobOutputDataConfig.S3OutputDataConfigMember
  | ModelInvocationJobOutputDataConfig.$UnknownMember;
export declare namespace ModelInvocationJobOutputDataConfig {
  interface S3OutputDataConfigMember {
    s3OutputDataConfig: ModelInvocationJobS3OutputDataConfig;
    $unknown?: never;
  }
  interface $UnknownMember {
    s3OutputDataConfig?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    s3OutputDataConfig: (value: ModelInvocationJobS3OutputDataConfig) => T;
    _: (name: string, value: any) => T;
  }
}
export interface CreateModelInvocationJobRequest {
  jobName: string | undefined;
  roleArn: string | undefined;
  clientRequestToken?: string | undefined;
  modelId: string | undefined;
  inputDataConfig: ModelInvocationJobInputDataConfig | undefined;
  outputDataConfig: ModelInvocationJobOutputDataConfig | undefined;
  vpcConfig?: VpcConfig | undefined;
  timeoutDurationInHours?: number | undefined;
  tags?: Tag[] | undefined;
  modelInvocationType?: ModelInvocationType | undefined;
}
export interface CreateModelInvocationJobResponse {
  jobArn: string | undefined;
}
export interface GetModelInvocationJobRequest {
  jobIdentifier: string | undefined;
}
export interface GetModelInvocationJobResponse {
  jobArn: string | undefined;
  jobName?: string | undefined;
  modelId: string | undefined;
  clientRequestToken?: string | undefined;
  roleArn: string | undefined;
  status?: ModelInvocationJobStatus | undefined;
  message?: string | undefined;
  submitTime: Date | undefined;
  lastModifiedTime?: Date | undefined;
  endTime?: Date | undefined;
  inputDataConfig: ModelInvocationJobInputDataConfig | undefined;
  outputDataConfig: ModelInvocationJobOutputDataConfig | undefined;
  vpcConfig?: VpcConfig | undefined;
  timeoutDurationInHours?: number | undefined;
  jobExpirationTime?: Date | undefined;
  modelInvocationType?: ModelInvocationType | undefined;
  totalRecordCount?: number | undefined;
  processedRecordCount?: number | undefined;
  successRecordCount?: number | undefined;
  errorRecordCount?: number | undefined;
}
export interface ListModelInvocationJobsRequest {
  submitTimeAfter?: Date | undefined;
  submitTimeBefore?: Date | undefined;
  statusEquals?: ModelInvocationJobStatus | undefined;
  nameContains?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  sortBy?: SortJobsBy | undefined;
  sortOrder?: SortOrder | undefined;
}
export interface ModelInvocationJobSummary {
  jobArn: string | undefined;
  jobName: string | undefined;
  modelId: string | undefined;
  clientRequestToken?: string | undefined;
  roleArn: string | undefined;
  status?: ModelInvocationJobStatus | undefined;
  message?: string | undefined;
  submitTime: Date | undefined;
  lastModifiedTime?: Date | undefined;
  endTime?: Date | undefined;
  inputDataConfig: ModelInvocationJobInputDataConfig | undefined;
  outputDataConfig: ModelInvocationJobOutputDataConfig | undefined;
  vpcConfig?: VpcConfig | undefined;
  timeoutDurationInHours?: number | undefined;
  jobExpirationTime?: Date | undefined;
  modelInvocationType?: ModelInvocationType | undefined;
  totalRecordCount?: number | undefined;
  processedRecordCount?: number | undefined;
  successRecordCount?: number | undefined;
  errorRecordCount?: number | undefined;
}
export interface ListModelInvocationJobsResponse {
  nextToken?: string | undefined;
  invocationJobSummaries?: ModelInvocationJobSummary[] | undefined;
}
export interface StopModelInvocationJobRequest {
  jobIdentifier: string | undefined;
}
export interface StopModelInvocationJobResponse {}
export interface GetFoundationModelRequest {
  modelIdentifier: string | undefined;
}
export interface FoundationModelLifecycle {
  status: FoundationModelLifecycleStatus | undefined;
  startOfLifeTime?: Date | undefined;
  endOfLifeTime?: Date | undefined;
  legacyTime?: Date | undefined;
  publicExtendedAccessTime?: Date | undefined;
}
export interface FoundationModelDetails {
  modelArn: string | undefined;
  modelId: string | undefined;
  modelName?: string | undefined;
  providerName?: string | undefined;
  inputModalities?: ModelModality[] | undefined;
  outputModalities?: ModelModality[] | undefined;
  responseStreamingSupported?: boolean | undefined;
  customizationsSupported?: ModelCustomization[] | undefined;
  inferenceTypesSupported?: InferenceType[] | undefined;
  modelLifecycle?: FoundationModelLifecycle | undefined;
}
export interface GetFoundationModelResponse {
  modelDetails?: FoundationModelDetails | undefined;
}
export interface ListFoundationModelsRequest {
  byProvider?: string | undefined;
  byCustomizationType?: ModelCustomization | undefined;
  byOutputModality?: ModelModality | undefined;
  byInferenceType?: InferenceType | undefined;
}
export interface FoundationModelSummary {
  modelArn: string | undefined;
  modelId: string | undefined;
  modelName?: string | undefined;
  providerName?: string | undefined;
  inputModalities?: ModelModality[] | undefined;
  outputModalities?: ModelModality[] | undefined;
  responseStreamingSupported?: boolean | undefined;
  customizationsSupported?: ModelCustomization[] | undefined;
  inferenceTypesSupported?: InferenceType[] | undefined;
  modelLifecycle?: FoundationModelLifecycle | undefined;
}
export interface ListFoundationModelsResponse {
  modelSummaries?: FoundationModelSummary[] | undefined;
}
export interface PromptRouterTargetModel {
  modelArn: string | undefined;
}
export interface RoutingCriteria {
  responseQualityDifference: number | undefined;
}
export interface CreatePromptRouterRequest {
  clientRequestToken?: string | undefined;
  promptRouterName: string | undefined;
  models: PromptRouterTargetModel[] | undefined;
  description?: string | undefined;
  routingCriteria: RoutingCriteria | undefined;
  fallbackModel: PromptRouterTargetModel | undefined;
  tags?: Tag[] | undefined;
}
export interface CreatePromptRouterResponse {
  promptRouterArn?: string | undefined;
}
export interface DeletePromptRouterRequest {
  promptRouterArn: string | undefined;
}
export interface DeletePromptRouterResponse {}
export interface GetPromptRouterRequest {
  promptRouterArn: string | undefined;
}
export interface GetPromptRouterResponse {
  promptRouterName: string | undefined;
  routingCriteria: RoutingCriteria | undefined;
  description?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
  promptRouterArn: string | undefined;
  models: PromptRouterTargetModel[] | undefined;
  fallbackModel: PromptRouterTargetModel | undefined;
  status: PromptRouterStatus | undefined;
  type: PromptRouterType | undefined;
}
export interface ListPromptRoutersRequest {
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  type?: PromptRouterType | undefined;
}
export interface PromptRouterSummary {
  promptRouterName: string | undefined;
  routingCriteria: RoutingCriteria | undefined;
  description?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt?: Date | undefined;
  promptRouterArn: string | undefined;
  models: PromptRouterTargetModel[] | undefined;
  fallbackModel: PromptRouterTargetModel | undefined;
  status: PromptRouterStatus | undefined;
  type: PromptRouterType | undefined;
}
export interface ListPromptRoutersResponse {
  promptRouterSummaries?: PromptRouterSummary[] | undefined;
  nextToken?: string | undefined;
}
export interface CreateProvisionedModelThroughputRequest {
  clientRequestToken?: string | undefined;
  modelUnits: number | undefined;
  provisionedModelName: string | undefined;
  modelId: string | undefined;
  commitmentDuration?: CommitmentDuration | undefined;
  tags?: Tag[] | undefined;
}
export interface CreateProvisionedModelThroughputResponse {
  provisionedModelArn: string | undefined;
}
export interface DeleteProvisionedModelThroughputRequest {
  provisionedModelId: string | undefined;
}
export interface DeleteProvisionedModelThroughputResponse {}
export interface GetProvisionedModelThroughputRequest {
  provisionedModelId: string | undefined;
}
export interface GetProvisionedModelThroughputResponse {
  modelUnits: number | undefined;
  desiredModelUnits: number | undefined;
  provisionedModelName: string | undefined;
  provisionedModelArn: string | undefined;
  modelArn: string | undefined;
  desiredModelArn: string | undefined;
  foundationModelArn: string | undefined;
  status: ProvisionedModelStatus | undefined;
  creationTime: Date | undefined;
  lastModifiedTime: Date | undefined;
  failureMessage?: string | undefined;
  commitmentDuration?: CommitmentDuration | undefined;
  commitmentExpirationTime?: Date | undefined;
}
export interface ListProvisionedModelThroughputsRequest {
  creationTimeAfter?: Date | undefined;
  creationTimeBefore?: Date | undefined;
  statusEquals?: ProvisionedModelStatus | undefined;
  modelArnEquals?: string | undefined;
  nameContains?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  sortBy?: SortByProvisionedModels | undefined;
  sortOrder?: SortOrder | undefined;
}
export interface ProvisionedModelSummary {
  provisionedModelName: string | undefined;
  provisionedModelArn: string | undefined;
  modelArn: string | undefined;
  desiredModelArn: string | undefined;
  foundationModelArn: string | undefined;
  modelUnits: number | undefined;
  desiredModelUnits: number | undefined;
  status: ProvisionedModelStatus | undefined;
  commitmentDuration?: CommitmentDuration | undefined;
  commitmentExpirationTime?: Date | undefined;
  creationTime: Date | undefined;
  lastModifiedTime: Date | undefined;
}
export interface ListProvisionedModelThroughputsResponse {
  nextToken?: string | undefined;
  provisionedModelSummaries?: ProvisionedModelSummary[] | undefined;
}
export interface UpdateProvisionedModelThroughputRequest {
  provisionedModelId: string | undefined;
  desiredProvisionedModelName?: string | undefined;
  desiredModelId?: string | undefined;
}
export interface UpdateProvisionedModelThroughputResponse {}
export interface DeleteResourcePolicyRequest {
  resourceArn: string | undefined;
}
export interface DeleteResourcePolicyResponse {}
export interface GetResourcePolicyRequest {
  resourceArn: string | undefined;
}
export interface GetResourcePolicyResponse {
  resourcePolicy?: string | undefined;
}
export interface PutResourcePolicyRequest {
  resourceArn: string | undefined;
  resourcePolicy: string | undefined;
}
export interface PutResourcePolicyResponse {
  resourceArn?: string | undefined;
}
export interface CreateFoundationModelAgreementRequest {
  offerToken: string | undefined;
  modelId: string | undefined;
}
export interface CreateFoundationModelAgreementResponse {
  modelId: string | undefined;
}
export interface DeleteFoundationModelAgreementRequest {
  modelId: string | undefined;
}
export interface DeleteFoundationModelAgreementResponse {}
export interface GetFoundationModelAvailabilityRequest {
  modelId: string | undefined;
}
export interface GetFoundationModelAvailabilityResponse {
  modelId: string | undefined;
  agreementAvailability: AgreementAvailability | undefined;
  authorizationStatus: AuthorizationStatus | undefined;
  entitlementAvailability: EntitlementAvailability | undefined;
  regionAvailability: RegionAvailability | undefined;
}
export interface ListFoundationModelAgreementOffersRequest {
  modelId: string | undefined;
  offerType?: OfferType | undefined;
}
export interface LegalTerm {
  url?: string | undefined;
}
export interface SupportTerm {
  refundPolicyDescription?: string | undefined;
}
export interface DimensionalPriceRate {
  dimension?: string | undefined;
  price?: string | undefined;
  description?: string | undefined;
  unit?: string | undefined;
}
export interface PricingTerm {
  rateCard: DimensionalPriceRate[] | undefined;
}
export interface ValidityTerm {
  agreementDuration?: string | undefined;
}
export interface TermDetails {
  usageBasedPricingTerm: PricingTerm | undefined;
  legalTerm: LegalTerm | undefined;
  supportTerm: SupportTerm | undefined;
  validityTerm?: ValidityTerm | undefined;
}
export interface Offer {
  offerId?: string | undefined;
  offerToken: string | undefined;
  termDetails: TermDetails | undefined;
}
export interface ListFoundationModelAgreementOffersResponse {
  modelId: string | undefined;
  offers: Offer[] | undefined;
}
export interface ListTagsForResourceRequest {
  resourceARN: string | undefined;
}
export interface ListTagsForResourceResponse {
  tags?: Tag[] | undefined;
}
export interface TagResourceRequest {
  resourceARN: string | undefined;
  tags: Tag[] | undefined;
}
export interface TagResourceResponse {}
export interface UntagResourceRequest {
  resourceARN: string | undefined;
  tagKeys: string[] | undefined;
}
export interface UntagResourceResponse {}
export interface CreateModelCustomizationJobRequest {
  jobName: string | undefined;
  customModelName: string | undefined;
  roleArn: string | undefined;
  clientRequestToken?: string | undefined;
  baseModelIdentifier: string | undefined;
  customizationType?: CustomizationType | undefined;
  customModelKmsKeyId?: string | undefined;
  jobTags?: Tag[] | undefined;
  customModelTags?: Tag[] | undefined;
  trainingDataConfig: TrainingDataConfig | undefined;
  validationDataConfig?: ValidationDataConfig | undefined;
  outputDataConfig: OutputDataConfig | undefined;
  hyperParameters?: Record<string, string> | undefined;
  vpcConfig?: VpcConfig | undefined;
  customizationConfig?: CustomizationConfig | undefined;
}
export interface CreateModelCustomizationJobResponse {
  jobArn: string | undefined;
}
export interface GetModelCustomizationJobRequest {
  jobIdentifier: string | undefined;
}
export interface DataProcessingDetails {
  status?: JobStatusDetails | undefined;
  creationTime?: Date | undefined;
  lastModifiedTime?: Date | undefined;
}
export interface TrainingDetails {
  status?: JobStatusDetails | undefined;
  creationTime?: Date | undefined;
  lastModifiedTime?: Date | undefined;
}
export interface ValidationDetails {
  status?: JobStatusDetails | undefined;
  creationTime?: Date | undefined;
  lastModifiedTime?: Date | undefined;
}
export interface StatusDetails {
  validationDetails?: ValidationDetails | undefined;
  dataProcessingDetails?: DataProcessingDetails | undefined;
  trainingDetails?: TrainingDetails | undefined;
}
export interface GetModelCustomizationJobResponse {
  jobArn: string | undefined;
  jobName: string | undefined;
  outputModelName: string | undefined;
  outputModelArn?: string | undefined;
  clientRequestToken?: string | undefined;
  roleArn: string | undefined;
  status?: ModelCustomizationJobStatus | undefined;
  statusDetails?: StatusDetails | undefined;
  failureMessage?: string | undefined;
  creationTime: Date | undefined;
  lastModifiedTime?: Date | undefined;
  endTime?: Date | undefined;
  baseModelArn: string | undefined;
  hyperParameters?: Record<string, string> | undefined;
  trainingDataConfig: TrainingDataConfig | undefined;
  validationDataConfig: ValidationDataConfig | undefined;
  outputDataConfig: OutputDataConfig | undefined;
  customizationType?: CustomizationType | undefined;
  outputModelKmsKeyArn?: string | undefined;
  trainingMetrics?: TrainingMetrics | undefined;
  validationMetrics?: ValidatorMetric[] | undefined;
  vpcConfig?: VpcConfig | undefined;
  customizationConfig?: CustomizationConfig | undefined;
}
export interface ListModelCustomizationJobsRequest {
  creationTimeAfter?: Date | undefined;
  creationTimeBefore?: Date | undefined;
  statusEquals?: FineTuningJobStatus | undefined;
  nameContains?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  sortBy?: SortJobsBy | undefined;
  sortOrder?: SortOrder | undefined;
}
export interface ModelCustomizationJobSummary {
  jobArn: string | undefined;
  baseModelArn: string | undefined;
  jobName: string | undefined;
  status: ModelCustomizationJobStatus | undefined;
  statusDetails?: StatusDetails | undefined;
  lastModifiedTime?: Date | undefined;
  creationTime: Date | undefined;
  endTime?: Date | undefined;
  customModelArn?: string | undefined;
  customModelName?: string | undefined;
  customizationType?: CustomizationType | undefined;
}
export interface ListModelCustomizationJobsResponse {
  nextToken?: string | undefined;
  modelCustomizationJobSummaries?: ModelCustomizationJobSummary[] | undefined;
}
export interface StopModelCustomizationJobRequest {
  jobIdentifier: string | undefined;
}
export interface StopModelCustomizationJobResponse {}
export type RetrievalFilter =
  | RetrievalFilter.AndAllMember
  | RetrievalFilter.EqualsMember
  | RetrievalFilter.GreaterThanMember
  | RetrievalFilter.GreaterThanOrEqualsMember
  | RetrievalFilter.InMember
  | RetrievalFilter.LessThanMember
  | RetrievalFilter.LessThanOrEqualsMember
  | RetrievalFilter.ListContainsMember
  | RetrievalFilter.NotEqualsMember
  | RetrievalFilter.NotInMember
  | RetrievalFilter.OrAllMember
  | RetrievalFilter.StartsWithMember
  | RetrievalFilter.StringContainsMember
  | RetrievalFilter.$UnknownMember;
export declare namespace RetrievalFilter {
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
export interface KnowledgeBaseVectorSearchConfiguration {
  numberOfResults?: number | undefined;
  overrideSearchType?: SearchType | undefined;
  filter?: RetrievalFilter | undefined;
  implicitFilterConfiguration?: ImplicitFilterConfiguration | undefined;
  rerankingConfiguration?: VectorSearchRerankingConfiguration | undefined;
}
export interface KnowledgeBaseRetrievalConfiguration {
  vectorSearchConfiguration: KnowledgeBaseVectorSearchConfiguration | undefined;
}
export interface KnowledgeBaseRetrieveAndGenerateConfiguration {
  knowledgeBaseId: string | undefined;
  modelArn: string | undefined;
  retrievalConfiguration?: KnowledgeBaseRetrievalConfiguration | undefined;
  generationConfiguration?: GenerationConfiguration | undefined;
  orchestrationConfiguration?: OrchestrationConfiguration | undefined;
}
export interface RetrieveConfig {
  knowledgeBaseId: string | undefined;
  knowledgeBaseRetrievalConfiguration:
    | KnowledgeBaseRetrievalConfiguration
    | undefined;
}
export interface RetrieveAndGenerateConfiguration {
  type: RetrieveAndGenerateType | undefined;
  knowledgeBaseConfiguration?:
    | KnowledgeBaseRetrieveAndGenerateConfiguration
    | undefined;
  externalSourcesConfiguration?:
    | ExternalSourcesRetrieveAndGenerateConfiguration
    | undefined;
}
export type KnowledgeBaseConfig =
  | KnowledgeBaseConfig.RetrieveAndGenerateConfigMember
  | KnowledgeBaseConfig.RetrieveConfigMember
  | KnowledgeBaseConfig.$UnknownMember;
export declare namespace KnowledgeBaseConfig {
  interface RetrieveConfigMember {
    retrieveConfig: RetrieveConfig;
    retrieveAndGenerateConfig?: never;
    $unknown?: never;
  }
  interface RetrieveAndGenerateConfigMember {
    retrieveConfig?: never;
    retrieveAndGenerateConfig: RetrieveAndGenerateConfiguration;
    $unknown?: never;
  }
  interface $UnknownMember {
    retrieveConfig?: never;
    retrieveAndGenerateConfig?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    retrieveConfig: (value: RetrieveConfig) => T;
    retrieveAndGenerateConfig: (value: RetrieveAndGenerateConfiguration) => T;
    _: (name: string, value: any) => T;
  }
}
export type RAGConfig =
  | RAGConfig.KnowledgeBaseConfigMember
  | RAGConfig.PrecomputedRagSourceConfigMember
  | RAGConfig.$UnknownMember;
export declare namespace RAGConfig {
  interface KnowledgeBaseConfigMember {
    knowledgeBaseConfig: KnowledgeBaseConfig;
    precomputedRagSourceConfig?: never;
    $unknown?: never;
  }
  interface PrecomputedRagSourceConfigMember {
    knowledgeBaseConfig?: never;
    precomputedRagSourceConfig: EvaluationPrecomputedRagSourceConfig;
    $unknown?: never;
  }
  interface $UnknownMember {
    knowledgeBaseConfig?: never;
    precomputedRagSourceConfig?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    knowledgeBaseConfig: (value: KnowledgeBaseConfig) => T;
    precomputedRagSourceConfig: (
      value: EvaluationPrecomputedRagSourceConfig
    ) => T;
    _: (name: string, value: any) => T;
  }
}
export type EvaluationInferenceConfig =
  | EvaluationInferenceConfig.ModelsMember
  | EvaluationInferenceConfig.RagConfigsMember
  | EvaluationInferenceConfig.$UnknownMember;
export declare namespace EvaluationInferenceConfig {
  interface ModelsMember {
    models: EvaluationModelConfig[];
    ragConfigs?: never;
    $unknown?: never;
  }
  interface RagConfigsMember {
    models?: never;
    ragConfigs: RAGConfig[];
    $unknown?: never;
  }
  interface $UnknownMember {
    models?: never;
    ragConfigs?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    models: (value: EvaluationModelConfig[]) => T;
    ragConfigs: (value: RAGConfig[]) => T;
    _: (name: string, value: any) => T;
  }
}
export interface CreateEvaluationJobRequest {
  jobName: string | undefined;
  jobDescription?: string | undefined;
  clientRequestToken?: string | undefined;
  roleArn: string | undefined;
  customerEncryptionKeyId?: string | undefined;
  jobTags?: Tag[] | undefined;
  applicationType?: ApplicationType | undefined;
  evaluationConfig: EvaluationConfig | undefined;
  inferenceConfig: EvaluationInferenceConfig | undefined;
  outputDataConfig: EvaluationOutputDataConfig | undefined;
}
export interface GetEvaluationJobResponse {
  jobName: string | undefined;
  status: EvaluationJobStatus | undefined;
  jobArn: string | undefined;
  jobDescription?: string | undefined;
  roleArn: string | undefined;
  customerEncryptionKeyId?: string | undefined;
  jobType: EvaluationJobType | undefined;
  applicationType?: ApplicationType | undefined;
  evaluationConfig: EvaluationConfig | undefined;
  inferenceConfig: EvaluationInferenceConfig | undefined;
  outputDataConfig: EvaluationOutputDataConfig | undefined;
  creationTime: Date | undefined;
  lastModifiedTime?: Date | undefined;
  failureMessages?: string[] | undefined;
}
