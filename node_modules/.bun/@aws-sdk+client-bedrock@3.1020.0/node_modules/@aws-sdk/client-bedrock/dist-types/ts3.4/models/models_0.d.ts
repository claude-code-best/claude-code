import { DocumentType as __DocumentType } from "@smithy/types";
import {
  AgreementStatus,
  ApplicationType,
  AttributeType,
  AutomatedReasoningCheckLogicWarningType,
  AutomatedReasoningCheckResult,
  AutomatedReasoningPolicyAnnotationStatus,
  AutomatedReasoningPolicyBuildDocumentContentType,
  AutomatedReasoningPolicyBuildMessageType,
  AutomatedReasoningPolicyBuildResultAssetType,
  AutomatedReasoningPolicyBuildWorkflowStatus,
  AutomatedReasoningPolicyBuildWorkflowType,
  AutomatedReasoningPolicyTestRunResult,
  AutomatedReasoningPolicyTestRunStatus,
  ConfigurationOwner,
  CustomizationType,
  CustomModelDeploymentStatus,
  CustomModelDeploymentUpdateStatus,
  EvaluationJobStatus,
  EvaluationJobType,
  EvaluationTaskType,
  ExternalSourceType,
  GuardrailContentFilterAction,
  GuardrailContentFiltersTierName,
  GuardrailContentFilterType,
  GuardrailContextualGroundingAction,
  GuardrailContextualGroundingFilterType,
  GuardrailFilterStrength,
  GuardrailManagedWordsType,
  GuardrailModality,
  GuardrailPiiEntityType,
  GuardrailSensitiveInformationAction,
  GuardrailTopicAction,
  GuardrailTopicsTierName,
  GuardrailTopicType,
  GuardrailWordAction,
  InputTags,
  ModelStatus,
  PerformanceConfigLatency,
  QueryTransformationType,
  ReasoningEffort,
  RerankingMetadataSelectionMode,
  SortJobsBy,
  SortModelsBy,
  SortOrder,
  Status,
  VectorSearchRerankingConfigurationType,
} from "./enums";
export interface ModelEnforcement {
  includedModels: string[] | undefined;
  excludedModels: string[] | undefined;
}
export interface AccountEnforcedGuardrailInferenceInputConfiguration {
  guardrailIdentifier: string | undefined;
  guardrailVersion: string | undefined;
  inputTags: InputTags | undefined;
  modelEnforcement?: ModelEnforcement | undefined;
}
export interface AccountEnforcedGuardrailOutputConfiguration {
  configId?: string | undefined;
  guardrailArn?: string | undefined;
  guardrailId?: string | undefined;
  inputTags?: InputTags | undefined;
  guardrailVersion?: string | undefined;
  createdAt?: Date | undefined;
  createdBy?: string | undefined;
  updatedAt?: Date | undefined;
  updatedBy?: string | undefined;
  owner?: ConfigurationOwner | undefined;
  modelEnforcement?: ModelEnforcement | undefined;
}
export interface AgreementAvailability {
  status: AgreementStatus | undefined;
  errorMessage?: string | undefined;
}
export interface GetUseCaseForModelAccessRequest {}
export interface GetUseCaseForModelAccessResponse {
  formData: Uint8Array | undefined;
}
export interface PutUseCaseForModelAccessRequest {
  formData: Uint8Array | undefined;
}
export interface PutUseCaseForModelAccessResponse {}
export interface CancelAutomatedReasoningPolicyBuildWorkflowRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
}
export interface CancelAutomatedReasoningPolicyBuildWorkflowResponse {}
export interface AutomatedReasoningPolicyDefinitionRule {
  id: string | undefined;
  expression: string | undefined;
  alternateExpression?: string | undefined;
}
export interface AutomatedReasoningPolicyDefinitionTypeValue {
  value: string | undefined;
  description?: string | undefined;
}
export interface AutomatedReasoningPolicyDefinitionType {
  name: string | undefined;
  description?: string | undefined;
  values: AutomatedReasoningPolicyDefinitionTypeValue[] | undefined;
}
export interface AutomatedReasoningPolicyDefinitionVariable {
  name: string | undefined;
  type: string | undefined;
  description: string | undefined;
}
export interface AutomatedReasoningPolicyDefinition {
  version?: string | undefined;
  types?: AutomatedReasoningPolicyDefinitionType[] | undefined;
  rules?: AutomatedReasoningPolicyDefinitionRule[] | undefined;
  variables?: AutomatedReasoningPolicyDefinitionVariable[] | undefined;
}
export interface Tag {
  key: string | undefined;
  value: string | undefined;
}
export interface CreateAutomatedReasoningPolicyRequest {
  name: string | undefined;
  description?: string | undefined;
  clientRequestToken?: string | undefined;
  policyDefinition?: AutomatedReasoningPolicyDefinition | undefined;
  kmsKeyId?: string | undefined;
  tags?: Tag[] | undefined;
}
export interface CreateAutomatedReasoningPolicyResponse {
  policyArn: string | undefined;
  version: string | undefined;
  name: string | undefined;
  description?: string | undefined;
  definitionHash?: string | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
}
export interface CreateAutomatedReasoningPolicyTestCaseRequest {
  policyArn: string | undefined;
  guardContent: string | undefined;
  queryContent?: string | undefined;
  expectedAggregatedFindingsResult: AutomatedReasoningCheckResult | undefined;
  clientRequestToken?: string | undefined;
  confidenceThreshold?: number | undefined;
}
export interface CreateAutomatedReasoningPolicyTestCaseResponse {
  policyArn: string | undefined;
  testCaseId: string | undefined;
}
export interface CreateAutomatedReasoningPolicyVersionRequest {
  policyArn: string | undefined;
  clientRequestToken?: string | undefined;
  lastUpdatedDefinitionHash: string | undefined;
  tags?: Tag[] | undefined;
}
export interface CreateAutomatedReasoningPolicyVersionResponse {
  policyArn: string | undefined;
  version: string | undefined;
  name: string | undefined;
  description?: string | undefined;
  definitionHash: string | undefined;
  createdAt: Date | undefined;
}
export interface DeleteAutomatedReasoningPolicyRequest {
  policyArn: string | undefined;
  force?: boolean | undefined;
}
export interface DeleteAutomatedReasoningPolicyResponse {}
export interface DeleteAutomatedReasoningPolicyBuildWorkflowRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  lastUpdatedAt: Date | undefined;
}
export interface DeleteAutomatedReasoningPolicyBuildWorkflowResponse {}
export interface DeleteAutomatedReasoningPolicyTestCaseRequest {
  policyArn: string | undefined;
  testCaseId: string | undefined;
  lastUpdatedAt: Date | undefined;
}
export interface DeleteAutomatedReasoningPolicyTestCaseResponse {}
export interface ExportAutomatedReasoningPolicyVersionRequest {
  policyArn: string | undefined;
}
export interface ExportAutomatedReasoningPolicyVersionResponse {
  policyDefinition: AutomatedReasoningPolicyDefinition | undefined;
}
export interface GetAutomatedReasoningPolicyRequest {
  policyArn: string | undefined;
}
export interface GetAutomatedReasoningPolicyResponse {
  policyArn: string | undefined;
  name: string | undefined;
  version: string | undefined;
  policyId: string | undefined;
  description?: string | undefined;
  definitionHash: string | undefined;
  kmsKeyArn?: string | undefined;
  createdAt?: Date | undefined;
  updatedAt: Date | undefined;
}
export interface GetAutomatedReasoningPolicyAnnotationsRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
}
export interface AutomatedReasoningPolicyAddRuleAnnotation {
  expression: string | undefined;
}
export interface AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation {
  naturalLanguage: string | undefined;
}
export interface AutomatedReasoningPolicyAddTypeAnnotation {
  name: string | undefined;
  description: string | undefined;
  values: AutomatedReasoningPolicyDefinitionTypeValue[] | undefined;
}
export interface AutomatedReasoningPolicyAddVariableAnnotation {
  name: string | undefined;
  type: string | undefined;
  description: string | undefined;
}
export interface AutomatedReasoningPolicyDeleteRuleAnnotation {
  ruleId: string | undefined;
}
export interface AutomatedReasoningPolicyDeleteTypeAnnotation {
  name: string | undefined;
}
export interface AutomatedReasoningPolicyDeleteVariableAnnotation {
  name: string | undefined;
}
export interface AutomatedReasoningPolicyIngestContentAnnotation {
  content: string | undefined;
}
export interface AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation {
  ruleIds?: string[] | undefined;
  feedback: string | undefined;
}
export interface AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation {
  ruleIds?: string[] | undefined;
  scenarioExpression: string | undefined;
  feedback?: string | undefined;
}
export interface AutomatedReasoningPolicyUpdateRuleAnnotation {
  ruleId: string | undefined;
  expression: string | undefined;
}
export interface AutomatedReasoningPolicyAddTypeValue {
  value: string | undefined;
  description?: string | undefined;
}
export interface AutomatedReasoningPolicyDeleteTypeValue {
  value: string | undefined;
}
export interface AutomatedReasoningPolicyUpdateTypeValue {
  value: string | undefined;
  newValue?: string | undefined;
  description?: string | undefined;
}
export type AutomatedReasoningPolicyTypeValueAnnotation =
  | AutomatedReasoningPolicyTypeValueAnnotation.AddTypeValueMember
  | AutomatedReasoningPolicyTypeValueAnnotation.DeleteTypeValueMember
  | AutomatedReasoningPolicyTypeValueAnnotation.UpdateTypeValueMember
  | AutomatedReasoningPolicyTypeValueAnnotation.$UnknownMember;
export declare namespace AutomatedReasoningPolicyTypeValueAnnotation {
  interface AddTypeValueMember {
    addTypeValue: AutomatedReasoningPolicyAddTypeValue;
    updateTypeValue?: never;
    deleteTypeValue?: never;
    $unknown?: never;
  }
  interface UpdateTypeValueMember {
    addTypeValue?: never;
    updateTypeValue: AutomatedReasoningPolicyUpdateTypeValue;
    deleteTypeValue?: never;
    $unknown?: never;
  }
  interface DeleteTypeValueMember {
    addTypeValue?: never;
    updateTypeValue?: never;
    deleteTypeValue: AutomatedReasoningPolicyDeleteTypeValue;
    $unknown?: never;
  }
  interface $UnknownMember {
    addTypeValue?: never;
    updateTypeValue?: never;
    deleteTypeValue?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    addTypeValue: (value: AutomatedReasoningPolicyAddTypeValue) => T;
    updateTypeValue: (value: AutomatedReasoningPolicyUpdateTypeValue) => T;
    deleteTypeValue: (value: AutomatedReasoningPolicyDeleteTypeValue) => T;
    _: (name: string, value: any) => T;
  }
}
export interface AutomatedReasoningPolicyUpdateTypeAnnotation {
  name: string | undefined;
  newName?: string | undefined;
  description?: string | undefined;
  values: AutomatedReasoningPolicyTypeValueAnnotation[] | undefined;
}
export interface AutomatedReasoningPolicyUpdateVariableAnnotation {
  name: string | undefined;
  newName?: string | undefined;
  description?: string | undefined;
}
export type AutomatedReasoningPolicyAnnotation =
  | AutomatedReasoningPolicyAnnotation.AddRuleMember
  | AutomatedReasoningPolicyAnnotation.AddRuleFromNaturalLanguageMember
  | AutomatedReasoningPolicyAnnotation.AddTypeMember
  | AutomatedReasoningPolicyAnnotation.AddVariableMember
  | AutomatedReasoningPolicyAnnotation.DeleteRuleMember
  | AutomatedReasoningPolicyAnnotation.DeleteTypeMember
  | AutomatedReasoningPolicyAnnotation.DeleteVariableMember
  | AutomatedReasoningPolicyAnnotation.IngestContentMember
  | AutomatedReasoningPolicyAnnotation.UpdateFromRulesFeedbackMember
  | AutomatedReasoningPolicyAnnotation.UpdateFromScenarioFeedbackMember
  | AutomatedReasoningPolicyAnnotation.UpdateRuleMember
  | AutomatedReasoningPolicyAnnotation.UpdateTypeMember
  | AutomatedReasoningPolicyAnnotation.UpdateVariableMember
  | AutomatedReasoningPolicyAnnotation.$UnknownMember;
export declare namespace AutomatedReasoningPolicyAnnotation {
  interface AddTypeMember {
    addType: AutomatedReasoningPolicyAddTypeAnnotation;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface UpdateTypeMember {
    addType?: never;
    updateType: AutomatedReasoningPolicyUpdateTypeAnnotation;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface DeleteTypeMember {
    addType?: never;
    updateType?: never;
    deleteType: AutomatedReasoningPolicyDeleteTypeAnnotation;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface AddVariableMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable: AutomatedReasoningPolicyAddVariableAnnotation;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface UpdateVariableMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable: AutomatedReasoningPolicyUpdateVariableAnnotation;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface DeleteVariableMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable: AutomatedReasoningPolicyDeleteVariableAnnotation;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface AddRuleMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule: AutomatedReasoningPolicyAddRuleAnnotation;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface UpdateRuleMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule: AutomatedReasoningPolicyUpdateRuleAnnotation;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface DeleteRuleMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule: AutomatedReasoningPolicyDeleteRuleAnnotation;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface AddRuleFromNaturalLanguageMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage: AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface UpdateFromRulesFeedbackMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback: AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown?: never;
  }
  interface UpdateFromScenarioFeedbackMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback: AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation;
    ingestContent?: never;
    $unknown?: never;
  }
  interface IngestContentMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent: AutomatedReasoningPolicyIngestContentAnnotation;
    $unknown?: never;
  }
  interface $UnknownMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    addRuleFromNaturalLanguage?: never;
    updateFromRulesFeedback?: never;
    updateFromScenarioFeedback?: never;
    ingestContent?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    addType: (value: AutomatedReasoningPolicyAddTypeAnnotation) => T;
    updateType: (value: AutomatedReasoningPolicyUpdateTypeAnnotation) => T;
    deleteType: (value: AutomatedReasoningPolicyDeleteTypeAnnotation) => T;
    addVariable: (value: AutomatedReasoningPolicyAddVariableAnnotation) => T;
    updateVariable: (
      value: AutomatedReasoningPolicyUpdateVariableAnnotation
    ) => T;
    deleteVariable: (
      value: AutomatedReasoningPolicyDeleteVariableAnnotation
    ) => T;
    addRule: (value: AutomatedReasoningPolicyAddRuleAnnotation) => T;
    updateRule: (value: AutomatedReasoningPolicyUpdateRuleAnnotation) => T;
    deleteRule: (value: AutomatedReasoningPolicyDeleteRuleAnnotation) => T;
    addRuleFromNaturalLanguage: (
      value: AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation
    ) => T;
    updateFromRulesFeedback: (
      value: AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation
    ) => T;
    updateFromScenarioFeedback: (
      value: AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation
    ) => T;
    ingestContent: (
      value: AutomatedReasoningPolicyIngestContentAnnotation
    ) => T;
    _: (name: string, value: any) => T;
  }
}
export interface GetAutomatedReasoningPolicyAnnotationsResponse {
  policyArn: string | undefined;
  name: string | undefined;
  buildWorkflowId: string | undefined;
  annotations: AutomatedReasoningPolicyAnnotation[] | undefined;
  annotationSetHash: string | undefined;
  updatedAt: Date | undefined;
}
export interface GetAutomatedReasoningPolicyBuildWorkflowRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
}
export interface GetAutomatedReasoningPolicyBuildWorkflowResponse {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  status: AutomatedReasoningPolicyBuildWorkflowStatus | undefined;
  buildWorkflowType: AutomatedReasoningPolicyBuildWorkflowType | undefined;
  documentName?: string | undefined;
  documentContentType?:
    | AutomatedReasoningPolicyBuildDocumentContentType
    | undefined;
  documentDescription?: string | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
}
export interface GetAutomatedReasoningPolicyBuildWorkflowResultAssetsRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  assetType: AutomatedReasoningPolicyBuildResultAssetType | undefined;
  assetId?: string | undefined;
}
export interface AutomatedReasoningPolicyBuildResultAssetManifestEntry {
  assetType: AutomatedReasoningPolicyBuildResultAssetType | undefined;
  assetName?: string | undefined;
  assetId?: string | undefined;
}
export interface AutomatedReasoningPolicyBuildResultAssetManifest {
  entries: AutomatedReasoningPolicyBuildResultAssetManifestEntry[] | undefined;
}
export interface AutomatedReasoningPolicyAddRuleMutation {
  rule: AutomatedReasoningPolicyDefinitionRule | undefined;
}
export interface AutomatedReasoningPolicyAddTypeMutation {
  type: AutomatedReasoningPolicyDefinitionType | undefined;
}
export interface AutomatedReasoningPolicyAddVariableMutation {
  variable: AutomatedReasoningPolicyDefinitionVariable | undefined;
}
export interface AutomatedReasoningPolicyDeleteRuleMutation {
  id: string | undefined;
}
export interface AutomatedReasoningPolicyDeleteTypeMutation {
  name: string | undefined;
}
export interface AutomatedReasoningPolicyDeleteVariableMutation {
  name: string | undefined;
}
export interface AutomatedReasoningPolicyUpdateRuleMutation {
  rule: AutomatedReasoningPolicyDefinitionRule | undefined;
}
export interface AutomatedReasoningPolicyUpdateTypeMutation {
  type: AutomatedReasoningPolicyDefinitionType | undefined;
}
export interface AutomatedReasoningPolicyUpdateVariableMutation {
  variable: AutomatedReasoningPolicyDefinitionVariable | undefined;
}
export type AutomatedReasoningPolicyMutation =
  | AutomatedReasoningPolicyMutation.AddRuleMember
  | AutomatedReasoningPolicyMutation.AddTypeMember
  | AutomatedReasoningPolicyMutation.AddVariableMember
  | AutomatedReasoningPolicyMutation.DeleteRuleMember
  | AutomatedReasoningPolicyMutation.DeleteTypeMember
  | AutomatedReasoningPolicyMutation.DeleteVariableMember
  | AutomatedReasoningPolicyMutation.UpdateRuleMember
  | AutomatedReasoningPolicyMutation.UpdateTypeMember
  | AutomatedReasoningPolicyMutation.UpdateVariableMember
  | AutomatedReasoningPolicyMutation.$UnknownMember;
export declare namespace AutomatedReasoningPolicyMutation {
  interface AddTypeMember {
    addType: AutomatedReasoningPolicyAddTypeMutation;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    $unknown?: never;
  }
  interface UpdateTypeMember {
    addType?: never;
    updateType: AutomatedReasoningPolicyUpdateTypeMutation;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    $unknown?: never;
  }
  interface DeleteTypeMember {
    addType?: never;
    updateType?: never;
    deleteType: AutomatedReasoningPolicyDeleteTypeMutation;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    $unknown?: never;
  }
  interface AddVariableMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable: AutomatedReasoningPolicyAddVariableMutation;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    $unknown?: never;
  }
  interface UpdateVariableMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable: AutomatedReasoningPolicyUpdateVariableMutation;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    $unknown?: never;
  }
  interface DeleteVariableMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable: AutomatedReasoningPolicyDeleteVariableMutation;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    $unknown?: never;
  }
  interface AddRuleMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule: AutomatedReasoningPolicyAddRuleMutation;
    updateRule?: never;
    deleteRule?: never;
    $unknown?: never;
  }
  interface UpdateRuleMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule: AutomatedReasoningPolicyUpdateRuleMutation;
    deleteRule?: never;
    $unknown?: never;
  }
  interface DeleteRuleMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule: AutomatedReasoningPolicyDeleteRuleMutation;
    $unknown?: never;
  }
  interface $UnknownMember {
    addType?: never;
    updateType?: never;
    deleteType?: never;
    addVariable?: never;
    updateVariable?: never;
    deleteVariable?: never;
    addRule?: never;
    updateRule?: never;
    deleteRule?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    addType: (value: AutomatedReasoningPolicyAddTypeMutation) => T;
    updateType: (value: AutomatedReasoningPolicyUpdateTypeMutation) => T;
    deleteType: (value: AutomatedReasoningPolicyDeleteTypeMutation) => T;
    addVariable: (value: AutomatedReasoningPolicyAddVariableMutation) => T;
    updateVariable: (
      value: AutomatedReasoningPolicyUpdateVariableMutation
    ) => T;
    deleteVariable: (
      value: AutomatedReasoningPolicyDeleteVariableMutation
    ) => T;
    addRule: (value: AutomatedReasoningPolicyAddRuleMutation) => T;
    updateRule: (value: AutomatedReasoningPolicyUpdateRuleMutation) => T;
    deleteRule: (value: AutomatedReasoningPolicyDeleteRuleMutation) => T;
    _: (name: string, value: any) => T;
  }
}
export interface AutomatedReasoningPolicyPlanning {}
export type AutomatedReasoningPolicyBuildStepContext =
  | AutomatedReasoningPolicyBuildStepContext.MutationMember
  | AutomatedReasoningPolicyBuildStepContext.PlanningMember
  | AutomatedReasoningPolicyBuildStepContext.$UnknownMember;
export declare namespace AutomatedReasoningPolicyBuildStepContext {
  interface PlanningMember {
    planning: AutomatedReasoningPolicyPlanning;
    mutation?: never;
    $unknown?: never;
  }
  interface MutationMember {
    planning?: never;
    mutation: AutomatedReasoningPolicyMutation;
    $unknown?: never;
  }
  interface $UnknownMember {
    planning?: never;
    mutation?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    planning: (value: AutomatedReasoningPolicyPlanning) => T;
    mutation: (value: AutomatedReasoningPolicyMutation) => T;
    _: (name: string, value: any) => T;
  }
}
export interface AutomatedReasoningPolicyBuildStepMessage {
  message: string | undefined;
  messageType: AutomatedReasoningPolicyBuildMessageType | undefined;
}
export type AutomatedReasoningPolicyDefinitionElement =
  | AutomatedReasoningPolicyDefinitionElement.PolicyDefinitionRuleMember
  | AutomatedReasoningPolicyDefinitionElement.PolicyDefinitionTypeMember
  | AutomatedReasoningPolicyDefinitionElement.PolicyDefinitionVariableMember
  | AutomatedReasoningPolicyDefinitionElement.$UnknownMember;
export declare namespace AutomatedReasoningPolicyDefinitionElement {
  interface PolicyDefinitionVariableMember {
    policyDefinitionVariable: AutomatedReasoningPolicyDefinitionVariable;
    policyDefinitionType?: never;
    policyDefinitionRule?: never;
    $unknown?: never;
  }
  interface PolicyDefinitionTypeMember {
    policyDefinitionVariable?: never;
    policyDefinitionType: AutomatedReasoningPolicyDefinitionType;
    policyDefinitionRule?: never;
    $unknown?: never;
  }
  interface PolicyDefinitionRuleMember {
    policyDefinitionVariable?: never;
    policyDefinitionType?: never;
    policyDefinitionRule: AutomatedReasoningPolicyDefinitionRule;
    $unknown?: never;
  }
  interface $UnknownMember {
    policyDefinitionVariable?: never;
    policyDefinitionType?: never;
    policyDefinitionRule?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    policyDefinitionVariable: (
      value: AutomatedReasoningPolicyDefinitionVariable
    ) => T;
    policyDefinitionType: (value: AutomatedReasoningPolicyDefinitionType) => T;
    policyDefinitionRule: (value: AutomatedReasoningPolicyDefinitionRule) => T;
    _: (name: string, value: any) => T;
  }
}
export interface AutomatedReasoningPolicyBuildStep {
  context: AutomatedReasoningPolicyBuildStepContext | undefined;
  priorElement?: AutomatedReasoningPolicyDefinitionElement | undefined;
  messages: AutomatedReasoningPolicyBuildStepMessage[] | undefined;
}
export interface AutomatedReasoningPolicyBuildLogEntry {
  annotation: AutomatedReasoningPolicyAnnotation | undefined;
  status: AutomatedReasoningPolicyAnnotationStatus | undefined;
  buildSteps: AutomatedReasoningPolicyBuildStep[] | undefined;
}
export interface AutomatedReasoningPolicyBuildLog {
  entries: AutomatedReasoningPolicyBuildLogEntry[] | undefined;
}
export interface AutomatedReasoningPolicySourceDocument {
  document: Uint8Array | undefined;
  documentContentType:
    | AutomatedReasoningPolicyBuildDocumentContentType
    | undefined;
  documentName: string | undefined;
  documentDescription?: string | undefined;
  documentHash: string | undefined;
}
export interface AutomatedReasoningPolicyStatementLocation {
  lines: number[] | undefined;
}
export interface AutomatedReasoningPolicyAtomicStatement {
  id: string | undefined;
  text: string | undefined;
  location: AutomatedReasoningPolicyStatementLocation | undefined;
}
export interface AutomatedReasoningPolicyAnnotatedLine {
  lineNumber?: number | undefined;
  lineText?: string | undefined;
}
export type AutomatedReasoningPolicyAnnotatedContent =
  | AutomatedReasoningPolicyAnnotatedContent.LineMember
  | AutomatedReasoningPolicyAnnotatedContent.$UnknownMember;
export declare namespace AutomatedReasoningPolicyAnnotatedContent {
  interface LineMember {
    line: AutomatedReasoningPolicyAnnotatedLine;
    $unknown?: never;
  }
  interface $UnknownMember {
    line?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    line: (value: AutomatedReasoningPolicyAnnotatedLine) => T;
    _: (name: string, value: any) => T;
  }
}
export interface AutomatedReasoningPolicyAnnotatedChunk {
  pageNumber?: number | undefined;
  content: AutomatedReasoningPolicyAnnotatedContent[] | undefined;
}
export interface AutomatedReasoningPolicyReportSourceDocument {
  documentName: string | undefined;
  documentHash: string | undefined;
  documentId: string | undefined;
  atomicStatements: AutomatedReasoningPolicyAtomicStatement[] | undefined;
  documentContent: AutomatedReasoningPolicyAnnotatedChunk[] | undefined;
}
export interface AutomatedReasoningPolicyStatementReference {
  documentId: string | undefined;
  statementId: string | undefined;
}
export interface AutomatedReasoningPolicyRuleReport {
  rule: string | undefined;
  groundingStatements?:
    | AutomatedReasoningPolicyStatementReference[]
    | undefined;
  groundingJustifications?: string[] | undefined;
  accuracyScore?: number | undefined;
  accuracyJustification?: string | undefined;
}
export interface AutomatedReasoningPolicyVariableReport {
  policyVariable: string | undefined;
  groundingStatements?:
    | AutomatedReasoningPolicyStatementReference[]
    | undefined;
  groundingJustifications?: string[] | undefined;
  accuracyScore?: number | undefined;
  accuracyJustification?: string | undefined;
}
export interface AutomatedReasoningPolicyFidelityReport {
  coverageScore: number | undefined;
  accuracyScore: number | undefined;
  ruleReports: Record<string, AutomatedReasoningPolicyRuleReport> | undefined;
  variableReports:
    | Record<string, AutomatedReasoningPolicyVariableReport>
    | undefined;
  documentSources: AutomatedReasoningPolicyReportSourceDocument[] | undefined;
}
export interface AutomatedReasoningPolicyGeneratedTestCase {
  queryContent: string | undefined;
  guardContent: string | undefined;
  expectedAggregatedFindingsResult: AutomatedReasoningCheckResult | undefined;
}
export interface AutomatedReasoningPolicyGeneratedTestCases {
  generatedTestCases: AutomatedReasoningPolicyGeneratedTestCase[] | undefined;
}
export interface AutomatedReasoningPolicyScenario {
  expression: string | undefined;
  alternateExpression: string | undefined;
  expectedResult: AutomatedReasoningCheckResult | undefined;
  ruleIds: string[] | undefined;
}
export interface AutomatedReasoningPolicyScenarios {
  policyScenarios: AutomatedReasoningPolicyScenario[] | undefined;
}
export interface AutomatedReasoningPolicyDisjointRuleSet {
  variables: string[] | undefined;
  rules: string[] | undefined;
}
export interface AutomatedReasoningPolicyDefinitionTypeValuePair {
  typeName: string | undefined;
  valueName: string | undefined;
}
export interface AutomatedReasoningPolicyDefinitionQualityReport {
  typeCount: number | undefined;
  variableCount: number | undefined;
  ruleCount: number | undefined;
  unusedTypes: string[] | undefined;
  unusedTypeValues:
    | AutomatedReasoningPolicyDefinitionTypeValuePair[]
    | undefined;
  unusedVariables: string[] | undefined;
  conflictingRules: string[] | undefined;
  disjointRuleSets: AutomatedReasoningPolicyDisjointRuleSet[] | undefined;
}
export type AutomatedReasoningPolicyBuildResultAssets =
  | AutomatedReasoningPolicyBuildResultAssets.AssetManifestMember
  | AutomatedReasoningPolicyBuildResultAssets.BuildLogMember
  | AutomatedReasoningPolicyBuildResultAssets.DocumentMember
  | AutomatedReasoningPolicyBuildResultAssets.FidelityReportMember
  | AutomatedReasoningPolicyBuildResultAssets.GeneratedTestCasesMember
  | AutomatedReasoningPolicyBuildResultAssets.PolicyDefinitionMember
  | AutomatedReasoningPolicyBuildResultAssets.PolicyScenariosMember
  | AutomatedReasoningPolicyBuildResultAssets.QualityReportMember
  | AutomatedReasoningPolicyBuildResultAssets.$UnknownMember;
export declare namespace AutomatedReasoningPolicyBuildResultAssets {
  interface PolicyDefinitionMember {
    policyDefinition: AutomatedReasoningPolicyDefinition;
    qualityReport?: never;
    buildLog?: never;
    generatedTestCases?: never;
    policyScenarios?: never;
    assetManifest?: never;
    document?: never;
    fidelityReport?: never;
    $unknown?: never;
  }
  interface QualityReportMember {
    policyDefinition?: never;
    qualityReport: AutomatedReasoningPolicyDefinitionQualityReport;
    buildLog?: never;
    generatedTestCases?: never;
    policyScenarios?: never;
    assetManifest?: never;
    document?: never;
    fidelityReport?: never;
    $unknown?: never;
  }
  interface BuildLogMember {
    policyDefinition?: never;
    qualityReport?: never;
    buildLog: AutomatedReasoningPolicyBuildLog;
    generatedTestCases?: never;
    policyScenarios?: never;
    assetManifest?: never;
    document?: never;
    fidelityReport?: never;
    $unknown?: never;
  }
  interface GeneratedTestCasesMember {
    policyDefinition?: never;
    qualityReport?: never;
    buildLog?: never;
    generatedTestCases: AutomatedReasoningPolicyGeneratedTestCases;
    policyScenarios?: never;
    assetManifest?: never;
    document?: never;
    fidelityReport?: never;
    $unknown?: never;
  }
  interface PolicyScenariosMember {
    policyDefinition?: never;
    qualityReport?: never;
    buildLog?: never;
    generatedTestCases?: never;
    policyScenarios: AutomatedReasoningPolicyScenarios;
    assetManifest?: never;
    document?: never;
    fidelityReport?: never;
    $unknown?: never;
  }
  interface AssetManifestMember {
    policyDefinition?: never;
    qualityReport?: never;
    buildLog?: never;
    generatedTestCases?: never;
    policyScenarios?: never;
    assetManifest: AutomatedReasoningPolicyBuildResultAssetManifest;
    document?: never;
    fidelityReport?: never;
    $unknown?: never;
  }
  interface DocumentMember {
    policyDefinition?: never;
    qualityReport?: never;
    buildLog?: never;
    generatedTestCases?: never;
    policyScenarios?: never;
    assetManifest?: never;
    document: AutomatedReasoningPolicySourceDocument;
    fidelityReport?: never;
    $unknown?: never;
  }
  interface FidelityReportMember {
    policyDefinition?: never;
    qualityReport?: never;
    buildLog?: never;
    generatedTestCases?: never;
    policyScenarios?: never;
    assetManifest?: never;
    document?: never;
    fidelityReport: AutomatedReasoningPolicyFidelityReport;
    $unknown?: never;
  }
  interface $UnknownMember {
    policyDefinition?: never;
    qualityReport?: never;
    buildLog?: never;
    generatedTestCases?: never;
    policyScenarios?: never;
    assetManifest?: never;
    document?: never;
    fidelityReport?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    policyDefinition: (value: AutomatedReasoningPolicyDefinition) => T;
    qualityReport: (
      value: AutomatedReasoningPolicyDefinitionQualityReport
    ) => T;
    buildLog: (value: AutomatedReasoningPolicyBuildLog) => T;
    generatedTestCases: (
      value: AutomatedReasoningPolicyGeneratedTestCases
    ) => T;
    policyScenarios: (value: AutomatedReasoningPolicyScenarios) => T;
    assetManifest: (
      value: AutomatedReasoningPolicyBuildResultAssetManifest
    ) => T;
    document: (value: AutomatedReasoningPolicySourceDocument) => T;
    fidelityReport: (value: AutomatedReasoningPolicyFidelityReport) => T;
    _: (name: string, value: any) => T;
  }
}
export interface GetAutomatedReasoningPolicyBuildWorkflowResultAssetsResponse {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  buildWorkflowAssets?: AutomatedReasoningPolicyBuildResultAssets | undefined;
}
export interface GetAutomatedReasoningPolicyNextScenarioRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
}
export interface GetAutomatedReasoningPolicyNextScenarioResponse {
  policyArn: string | undefined;
  scenario?: AutomatedReasoningPolicyScenario | undefined;
}
export interface GetAutomatedReasoningPolicyTestCaseRequest {
  policyArn: string | undefined;
  testCaseId: string | undefined;
}
export interface AutomatedReasoningPolicyTestCase {
  testCaseId: string | undefined;
  guardContent: string | undefined;
  queryContent?: string | undefined;
  expectedAggregatedFindingsResult?: AutomatedReasoningCheckResult | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
  confidenceThreshold?: number | undefined;
}
export interface GetAutomatedReasoningPolicyTestCaseResponse {
  policyArn: string | undefined;
  testCase: AutomatedReasoningPolicyTestCase | undefined;
}
export interface GetAutomatedReasoningPolicyTestResultRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  testCaseId: string | undefined;
}
export interface AutomatedReasoningCheckRule {
  id?: string | undefined;
  policyVersionArn?: string | undefined;
}
export interface AutomatedReasoningLogicStatement {
  logic: string | undefined;
  naturalLanguage?: string | undefined;
}
export interface AutomatedReasoningCheckLogicWarning {
  type?: AutomatedReasoningCheckLogicWarningType | undefined;
  premises?: AutomatedReasoningLogicStatement[] | undefined;
  claims?: AutomatedReasoningLogicStatement[] | undefined;
}
export interface AutomatedReasoningCheckInputTextReference {
  text?: string | undefined;
}
export interface AutomatedReasoningCheckTranslation {
  premises?: AutomatedReasoningLogicStatement[] | undefined;
  claims: AutomatedReasoningLogicStatement[] | undefined;
  untranslatedPremises?:
    | AutomatedReasoningCheckInputTextReference[]
    | undefined;
  untranslatedClaims?: AutomatedReasoningCheckInputTextReference[] | undefined;
  confidence: number | undefined;
}
export interface AutomatedReasoningCheckImpossibleFinding {
  translation?: AutomatedReasoningCheckTranslation | undefined;
  contradictingRules?: AutomatedReasoningCheckRule[] | undefined;
  logicWarning?: AutomatedReasoningCheckLogicWarning | undefined;
}
export interface AutomatedReasoningCheckInvalidFinding {
  translation?: AutomatedReasoningCheckTranslation | undefined;
  contradictingRules?: AutomatedReasoningCheckRule[] | undefined;
  logicWarning?: AutomatedReasoningCheckLogicWarning | undefined;
}
export interface AutomatedReasoningCheckNoTranslationsFinding {}
export interface AutomatedReasoningCheckScenario {
  statements?: AutomatedReasoningLogicStatement[] | undefined;
}
export interface AutomatedReasoningCheckSatisfiableFinding {
  translation?: AutomatedReasoningCheckTranslation | undefined;
  claimsTrueScenario?: AutomatedReasoningCheckScenario | undefined;
  claimsFalseScenario?: AutomatedReasoningCheckScenario | undefined;
  logicWarning?: AutomatedReasoningCheckLogicWarning | undefined;
}
export interface AutomatedReasoningCheckTooComplexFinding {}
export interface AutomatedReasoningCheckTranslationOption {
  translations?: AutomatedReasoningCheckTranslation[] | undefined;
}
export interface AutomatedReasoningCheckTranslationAmbiguousFinding {
  options?: AutomatedReasoningCheckTranslationOption[] | undefined;
  differenceScenarios?: AutomatedReasoningCheckScenario[] | undefined;
}
export interface AutomatedReasoningCheckValidFinding {
  translation?: AutomatedReasoningCheckTranslation | undefined;
  claimsTrueScenario?: AutomatedReasoningCheckScenario | undefined;
  supportingRules?: AutomatedReasoningCheckRule[] | undefined;
  logicWarning?: AutomatedReasoningCheckLogicWarning | undefined;
}
export type AutomatedReasoningCheckFinding =
  | AutomatedReasoningCheckFinding.ImpossibleMember
  | AutomatedReasoningCheckFinding.InvalidMember
  | AutomatedReasoningCheckFinding.NoTranslationsMember
  | AutomatedReasoningCheckFinding.SatisfiableMember
  | AutomatedReasoningCheckFinding.TooComplexMember
  | AutomatedReasoningCheckFinding.TranslationAmbiguousMember
  | AutomatedReasoningCheckFinding.ValidMember
  | AutomatedReasoningCheckFinding.$UnknownMember;
export declare namespace AutomatedReasoningCheckFinding {
  interface ValidMember {
    valid: AutomatedReasoningCheckValidFinding;
    invalid?: never;
    satisfiable?: never;
    impossible?: never;
    translationAmbiguous?: never;
    tooComplex?: never;
    noTranslations?: never;
    $unknown?: never;
  }
  interface InvalidMember {
    valid?: never;
    invalid: AutomatedReasoningCheckInvalidFinding;
    satisfiable?: never;
    impossible?: never;
    translationAmbiguous?: never;
    tooComplex?: never;
    noTranslations?: never;
    $unknown?: never;
  }
  interface SatisfiableMember {
    valid?: never;
    invalid?: never;
    satisfiable: AutomatedReasoningCheckSatisfiableFinding;
    impossible?: never;
    translationAmbiguous?: never;
    tooComplex?: never;
    noTranslations?: never;
    $unknown?: never;
  }
  interface ImpossibleMember {
    valid?: never;
    invalid?: never;
    satisfiable?: never;
    impossible: AutomatedReasoningCheckImpossibleFinding;
    translationAmbiguous?: never;
    tooComplex?: never;
    noTranslations?: never;
    $unknown?: never;
  }
  interface TranslationAmbiguousMember {
    valid?: never;
    invalid?: never;
    satisfiable?: never;
    impossible?: never;
    translationAmbiguous: AutomatedReasoningCheckTranslationAmbiguousFinding;
    tooComplex?: never;
    noTranslations?: never;
    $unknown?: never;
  }
  interface TooComplexMember {
    valid?: never;
    invalid?: never;
    satisfiable?: never;
    impossible?: never;
    translationAmbiguous?: never;
    tooComplex: AutomatedReasoningCheckTooComplexFinding;
    noTranslations?: never;
    $unknown?: never;
  }
  interface NoTranslationsMember {
    valid?: never;
    invalid?: never;
    satisfiable?: never;
    impossible?: never;
    translationAmbiguous?: never;
    tooComplex?: never;
    noTranslations: AutomatedReasoningCheckNoTranslationsFinding;
    $unknown?: never;
  }
  interface $UnknownMember {
    valid?: never;
    invalid?: never;
    satisfiable?: never;
    impossible?: never;
    translationAmbiguous?: never;
    tooComplex?: never;
    noTranslations?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    valid: (value: AutomatedReasoningCheckValidFinding) => T;
    invalid: (value: AutomatedReasoningCheckInvalidFinding) => T;
    satisfiable: (value: AutomatedReasoningCheckSatisfiableFinding) => T;
    impossible: (value: AutomatedReasoningCheckImpossibleFinding) => T;
    translationAmbiguous: (
      value: AutomatedReasoningCheckTranslationAmbiguousFinding
    ) => T;
    tooComplex: (value: AutomatedReasoningCheckTooComplexFinding) => T;
    noTranslations: (value: AutomatedReasoningCheckNoTranslationsFinding) => T;
    _: (name: string, value: any) => T;
  }
}
export interface AutomatedReasoningPolicyTestResult {
  testCase: AutomatedReasoningPolicyTestCase | undefined;
  policyArn: string | undefined;
  testRunStatus: AutomatedReasoningPolicyTestRunStatus | undefined;
  testFindings?: AutomatedReasoningCheckFinding[] | undefined;
  testRunResult?: AutomatedReasoningPolicyTestRunResult | undefined;
  aggregatedTestFindingsResult?: AutomatedReasoningCheckResult | undefined;
  updatedAt: Date | undefined;
}
export interface GetAutomatedReasoningPolicyTestResultResponse {
  testResult: AutomatedReasoningPolicyTestResult | undefined;
}
export interface ListAutomatedReasoningPoliciesRequest {
  policyArn?: string | undefined;
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface AutomatedReasoningPolicySummary {
  policyArn: string | undefined;
  name: string | undefined;
  description?: string | undefined;
  version: string | undefined;
  policyId: string | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
}
export interface ListAutomatedReasoningPoliciesResponse {
  automatedReasoningPolicySummaries:
    | AutomatedReasoningPolicySummary[]
    | undefined;
  nextToken?: string | undefined;
}
export interface ListAutomatedReasoningPolicyBuildWorkflowsRequest {
  policyArn: string | undefined;
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface AutomatedReasoningPolicyBuildWorkflowSummary {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  status: AutomatedReasoningPolicyBuildWorkflowStatus | undefined;
  buildWorkflowType: AutomatedReasoningPolicyBuildWorkflowType | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
}
export interface ListAutomatedReasoningPolicyBuildWorkflowsResponse {
  automatedReasoningPolicyBuildWorkflowSummaries:
    | AutomatedReasoningPolicyBuildWorkflowSummary[]
    | undefined;
  nextToken?: string | undefined;
}
export interface ListAutomatedReasoningPolicyTestCasesRequest {
  policyArn: string | undefined;
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface ListAutomatedReasoningPolicyTestCasesResponse {
  testCases: AutomatedReasoningPolicyTestCase[] | undefined;
  nextToken?: string | undefined;
}
export interface ListAutomatedReasoningPolicyTestResultsRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  nextToken?: string | undefined;
  maxResults?: number | undefined;
}
export interface ListAutomatedReasoningPolicyTestResultsResponse {
  testResults: AutomatedReasoningPolicyTestResult[] | undefined;
  nextToken?: string | undefined;
}
export interface AutomatedReasoningPolicyBuildWorkflowDocument {
  document: Uint8Array | undefined;
  documentContentType:
    | AutomatedReasoningPolicyBuildDocumentContentType
    | undefined;
  documentName: string | undefined;
  documentDescription?: string | undefined;
}
export type AutomatedReasoningPolicyGenerateFidelityReportContent =
  | AutomatedReasoningPolicyGenerateFidelityReportContent.DocumentsMember
  | AutomatedReasoningPolicyGenerateFidelityReportContent.$UnknownMember;
export declare namespace AutomatedReasoningPolicyGenerateFidelityReportContent {
  interface DocumentsMember {
    documents: AutomatedReasoningPolicyBuildWorkflowDocument[];
    $unknown?: never;
  }
  interface $UnknownMember {
    documents?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    documents: (value: AutomatedReasoningPolicyBuildWorkflowDocument[]) => T;
    _: (name: string, value: any) => T;
  }
}
export interface AutomatedReasoningPolicyBuildWorkflowRepairContent {
  annotations: AutomatedReasoningPolicyAnnotation[] | undefined;
}
export type AutomatedReasoningPolicyWorkflowTypeContent =
  | AutomatedReasoningPolicyWorkflowTypeContent.DocumentsMember
  | AutomatedReasoningPolicyWorkflowTypeContent.GenerateFidelityReportContentMember
  | AutomatedReasoningPolicyWorkflowTypeContent.PolicyRepairAssetsMember
  | AutomatedReasoningPolicyWorkflowTypeContent.$UnknownMember;
export declare namespace AutomatedReasoningPolicyWorkflowTypeContent {
  interface DocumentsMember {
    documents: AutomatedReasoningPolicyBuildWorkflowDocument[];
    policyRepairAssets?: never;
    generateFidelityReportContent?: never;
    $unknown?: never;
  }
  interface PolicyRepairAssetsMember {
    documents?: never;
    policyRepairAssets: AutomatedReasoningPolicyBuildWorkflowRepairContent;
    generateFidelityReportContent?: never;
    $unknown?: never;
  }
  interface GenerateFidelityReportContentMember {
    documents?: never;
    policyRepairAssets?: never;
    generateFidelityReportContent: AutomatedReasoningPolicyGenerateFidelityReportContent;
    $unknown?: never;
  }
  interface $UnknownMember {
    documents?: never;
    policyRepairAssets?: never;
    generateFidelityReportContent?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    documents: (value: AutomatedReasoningPolicyBuildWorkflowDocument[]) => T;
    policyRepairAssets: (
      value: AutomatedReasoningPolicyBuildWorkflowRepairContent
    ) => T;
    generateFidelityReportContent: (
      value: AutomatedReasoningPolicyGenerateFidelityReportContent
    ) => T;
    _: (name: string, value: any) => T;
  }
}
export interface AutomatedReasoningPolicyBuildWorkflowSource {
  policyDefinition?: AutomatedReasoningPolicyDefinition | undefined;
  workflowContent?: AutomatedReasoningPolicyWorkflowTypeContent | undefined;
}
export interface StartAutomatedReasoningPolicyBuildWorkflowRequest {
  policyArn: string | undefined;
  buildWorkflowType: AutomatedReasoningPolicyBuildWorkflowType | undefined;
  clientRequestToken?: string | undefined;
  sourceContent: AutomatedReasoningPolicyBuildWorkflowSource | undefined;
}
export interface StartAutomatedReasoningPolicyBuildWorkflowResponse {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
}
export interface StartAutomatedReasoningPolicyTestWorkflowRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  testCaseIds?: string[] | undefined;
  clientRequestToken?: string | undefined;
}
export interface StartAutomatedReasoningPolicyTestWorkflowResponse {
  policyArn: string | undefined;
}
export interface UpdateAutomatedReasoningPolicyRequest {
  policyArn: string | undefined;
  policyDefinition: AutomatedReasoningPolicyDefinition | undefined;
  name?: string | undefined;
  description?: string | undefined;
}
export interface UpdateAutomatedReasoningPolicyResponse {
  policyArn: string | undefined;
  name: string | undefined;
  definitionHash: string | undefined;
  updatedAt: Date | undefined;
}
export interface UpdateAutomatedReasoningPolicyAnnotationsRequest {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  annotations: AutomatedReasoningPolicyAnnotation[] | undefined;
  lastUpdatedAnnotationSetHash: string | undefined;
}
export interface UpdateAutomatedReasoningPolicyAnnotationsResponse {
  policyArn: string | undefined;
  buildWorkflowId: string | undefined;
  annotationSetHash: string | undefined;
  updatedAt: Date | undefined;
}
export interface UpdateAutomatedReasoningPolicyTestCaseRequest {
  policyArn: string | undefined;
  testCaseId: string | undefined;
  guardContent: string | undefined;
  queryContent?: string | undefined;
  lastUpdatedAt: Date | undefined;
  expectedAggregatedFindingsResult: AutomatedReasoningCheckResult | undefined;
  confidenceThreshold?: number | undefined;
  clientRequestToken?: string | undefined;
}
export interface UpdateAutomatedReasoningPolicyTestCaseResponse {
  policyArn: string | undefined;
  testCaseId: string | undefined;
}
export interface VpcConfig {
  subnetIds: string[] | undefined;
  securityGroupIds: string[] | undefined;
}
export interface SageMakerEndpoint {
  initialInstanceCount: number | undefined;
  instanceType: string | undefined;
  executionRole: string | undefined;
  kmsEncryptionKey?: string | undefined;
  vpc?: VpcConfig | undefined;
}
export type EndpointConfig =
  | EndpointConfig.SageMakerMember
  | EndpointConfig.$UnknownMember;
export declare namespace EndpointConfig {
  interface SageMakerMember {
    sageMaker: SageMakerEndpoint;
    $unknown?: never;
  }
  interface $UnknownMember {
    sageMaker?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    sageMaker: (value: SageMakerEndpoint) => T;
    _: (name: string, value: any) => T;
  }
}
export interface CreateMarketplaceModelEndpointRequest {
  modelSourceIdentifier: string | undefined;
  endpointConfig: EndpointConfig | undefined;
  acceptEula?: boolean | undefined;
  endpointName: string | undefined;
  clientRequestToken?: string | undefined;
  tags?: Tag[] | undefined;
}
export interface MarketplaceModelEndpoint {
  endpointArn: string | undefined;
  modelSourceIdentifier: string | undefined;
  status?: Status | undefined;
  statusMessage?: string | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
  endpointConfig: EndpointConfig | undefined;
  endpointStatus: string | undefined;
  endpointStatusMessage?: string | undefined;
}
export interface CreateMarketplaceModelEndpointResponse {
  marketplaceModelEndpoint: MarketplaceModelEndpoint | undefined;
}
export interface DeleteMarketplaceModelEndpointRequest {
  endpointArn: string | undefined;
}
export interface DeleteMarketplaceModelEndpointResponse {}
export interface DeregisterMarketplaceModelEndpointRequest {
  endpointArn: string | undefined;
}
export interface DeregisterMarketplaceModelEndpointResponse {}
export interface GetMarketplaceModelEndpointRequest {
  endpointArn: string | undefined;
}
export interface GetMarketplaceModelEndpointResponse {
  marketplaceModelEndpoint?: MarketplaceModelEndpoint | undefined;
}
export interface ListMarketplaceModelEndpointsRequest {
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  modelSourceEquals?: string | undefined;
}
export interface MarketplaceModelEndpointSummary {
  endpointArn: string | undefined;
  modelSourceIdentifier: string | undefined;
  status?: Status | undefined;
  statusMessage?: string | undefined;
  createdAt: Date | undefined;
  updatedAt: Date | undefined;
}
export interface ListMarketplaceModelEndpointsResponse {
  marketplaceModelEndpoints?: MarketplaceModelEndpointSummary[] | undefined;
  nextToken?: string | undefined;
}
export interface RegisterMarketplaceModelEndpointRequest {
  endpointIdentifier: string | undefined;
  modelSourceIdentifier: string | undefined;
}
export interface RegisterMarketplaceModelEndpointResponse {
  marketplaceModelEndpoint: MarketplaceModelEndpoint | undefined;
}
export interface UpdateMarketplaceModelEndpointRequest {
  endpointArn: string | undefined;
  endpointConfig: EndpointConfig | undefined;
  clientRequestToken?: string | undefined;
}
export interface UpdateMarketplaceModelEndpointResponse {
  marketplaceModelEndpoint: MarketplaceModelEndpoint | undefined;
}
export interface CreateCustomModelDeploymentRequest {
  modelDeploymentName: string | undefined;
  modelArn: string | undefined;
  description?: string | undefined;
  tags?: Tag[] | undefined;
  clientRequestToken?: string | undefined;
}
export interface CreateCustomModelDeploymentResponse {
  customModelDeploymentArn: string | undefined;
}
export interface DeleteCustomModelDeploymentRequest {
  customModelDeploymentIdentifier: string | undefined;
}
export interface DeleteCustomModelDeploymentResponse {}
export interface GetCustomModelDeploymentRequest {
  customModelDeploymentIdentifier: string | undefined;
}
export interface CustomModelDeploymentUpdateDetails {
  modelArn: string | undefined;
  updateStatus: CustomModelDeploymentUpdateStatus | undefined;
}
export interface GetCustomModelDeploymentResponse {
  customModelDeploymentArn: string | undefined;
  modelDeploymentName: string | undefined;
  modelArn: string | undefined;
  createdAt: Date | undefined;
  status: CustomModelDeploymentStatus | undefined;
  description?: string | undefined;
  updateDetails?: CustomModelDeploymentUpdateDetails | undefined;
  failureMessage?: string | undefined;
  lastUpdatedAt?: Date | undefined;
}
export interface ListCustomModelDeploymentsRequest {
  createdBefore?: Date | undefined;
  createdAfter?: Date | undefined;
  nameContains?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  sortBy?: SortModelsBy | undefined;
  sortOrder?: SortOrder | undefined;
  statusEquals?: CustomModelDeploymentStatus | undefined;
  modelArnEquals?: string | undefined;
}
export interface CustomModelDeploymentSummary {
  customModelDeploymentArn: string | undefined;
  customModelDeploymentName: string | undefined;
  modelArn: string | undefined;
  createdAt: Date | undefined;
  status: CustomModelDeploymentStatus | undefined;
  lastUpdatedAt?: Date | undefined;
  failureMessage?: string | undefined;
}
export interface ListCustomModelDeploymentsResponse {
  nextToken?: string | undefined;
  modelDeploymentSummaries?: CustomModelDeploymentSummary[] | undefined;
}
export interface UpdateCustomModelDeploymentRequest {
  modelArn: string | undefined;
  customModelDeploymentIdentifier: string | undefined;
}
export interface UpdateCustomModelDeploymentResponse {
  customModelDeploymentArn: string | undefined;
}
export interface S3DataSource {
  s3Uri: string | undefined;
}
export type ModelDataSource =
  | ModelDataSource.S3DataSourceMember
  | ModelDataSource.$UnknownMember;
export declare namespace ModelDataSource {
  interface S3DataSourceMember {
    s3DataSource: S3DataSource;
    $unknown?: never;
  }
  interface $UnknownMember {
    s3DataSource?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    s3DataSource: (value: S3DataSource) => T;
    _: (name: string, value: any) => T;
  }
}
export interface CreateCustomModelRequest {
  modelName: string | undefined;
  modelSourceConfig: ModelDataSource | undefined;
  modelKmsKeyArn?: string | undefined;
  roleArn?: string | undefined;
  modelTags?: Tag[] | undefined;
  clientRequestToken?: string | undefined;
}
export interface CreateCustomModelResponse {
  modelArn: string | undefined;
}
export interface DeleteCustomModelRequest {
  modelIdentifier: string | undefined;
}
export interface DeleteCustomModelResponse {}
export interface GetCustomModelRequest {
  modelIdentifier: string | undefined;
}
export interface TeacherModelConfig {
  teacherModelIdentifier: string | undefined;
  maxResponseLengthForInference?: number | undefined;
}
export interface DistillationConfig {
  teacherModelConfig: TeacherModelConfig | undefined;
}
export interface LambdaGraderConfig {
  lambdaArn: string | undefined;
}
export type GraderConfig =
  | GraderConfig.LambdaGraderMember
  | GraderConfig.$UnknownMember;
export declare namespace GraderConfig {
  interface LambdaGraderMember {
    lambdaGrader: LambdaGraderConfig;
    $unknown?: never;
  }
  interface $UnknownMember {
    lambdaGrader?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    lambdaGrader: (value: LambdaGraderConfig) => T;
    _: (name: string, value: any) => T;
  }
}
export interface RFTHyperParameters {
  epochCount?: number | undefined;
  batchSize?: number | undefined;
  learningRate?: number | undefined;
  maxPromptLength?: number | undefined;
  trainingSamplePerPrompt?: number | undefined;
  inferenceMaxTokens?: number | undefined;
  reasoningEffort?: ReasoningEffort | undefined;
  evalInterval?: number | undefined;
}
export interface RFTConfig {
  graderConfig?: GraderConfig | undefined;
  hyperParameters?: RFTHyperParameters | undefined;
}
export type CustomizationConfig =
  | CustomizationConfig.DistillationConfigMember
  | CustomizationConfig.RftConfigMember
  | CustomizationConfig.$UnknownMember;
export declare namespace CustomizationConfig {
  interface DistillationConfigMember {
    distillationConfig: DistillationConfig;
    rftConfig?: never;
    $unknown?: never;
  }
  interface RftConfigMember {
    distillationConfig?: never;
    rftConfig: RFTConfig;
    $unknown?: never;
  }
  interface $UnknownMember {
    distillationConfig?: never;
    rftConfig?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    distillationConfig: (value: DistillationConfig) => T;
    rftConfig: (value: RFTConfig) => T;
    _: (name: string, value: any) => T;
  }
}
export interface OutputDataConfig {
  s3Uri: string | undefined;
}
export type InvocationLogSource =
  | InvocationLogSource.S3UriMember
  | InvocationLogSource.$UnknownMember;
export declare namespace InvocationLogSource {
  interface S3UriMember {
    s3Uri: string;
    $unknown?: never;
  }
  interface $UnknownMember {
    s3Uri?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    s3Uri: (value: string) => T;
    _: (name: string, value: any) => T;
  }
}
export interface RequestMetadataBaseFilters {
  equals?: Record<string, string> | undefined;
  notEquals?: Record<string, string> | undefined;
}
export type RequestMetadataFilters =
  | RequestMetadataFilters.AndAllMember
  | RequestMetadataFilters.EqualsMember
  | RequestMetadataFilters.NotEqualsMember
  | RequestMetadataFilters.OrAllMember
  | RequestMetadataFilters.$UnknownMember;
export declare namespace RequestMetadataFilters {
  interface EqualsMember {
    equals: Record<string, string>;
    notEquals?: never;
    andAll?: never;
    orAll?: never;
    $unknown?: never;
  }
  interface NotEqualsMember {
    equals?: never;
    notEquals: Record<string, string>;
    andAll?: never;
    orAll?: never;
    $unknown?: never;
  }
  interface AndAllMember {
    equals?: never;
    notEquals?: never;
    andAll: RequestMetadataBaseFilters[];
    orAll?: never;
    $unknown?: never;
  }
  interface OrAllMember {
    equals?: never;
    notEquals?: never;
    andAll?: never;
    orAll: RequestMetadataBaseFilters[];
    $unknown?: never;
  }
  interface $UnknownMember {
    equals?: never;
    notEquals?: never;
    andAll?: never;
    orAll?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    equals: (value: Record<string, string>) => T;
    notEquals: (value: Record<string, string>) => T;
    andAll: (value: RequestMetadataBaseFilters[]) => T;
    orAll: (value: RequestMetadataBaseFilters[]) => T;
    _: (name: string, value: any) => T;
  }
}
export interface InvocationLogsConfig {
  usePromptResponse?: boolean | undefined;
  invocationLogSource: InvocationLogSource | undefined;
  requestMetadataFilters?: RequestMetadataFilters | undefined;
}
export interface TrainingDataConfig {
  s3Uri?: string | undefined;
  invocationLogsConfig?: InvocationLogsConfig | undefined;
}
export interface TrainingMetrics {
  trainingLoss?: number | undefined;
}
export interface Validator {
  s3Uri: string | undefined;
}
export interface ValidationDataConfig {
  validators: Validator[] | undefined;
}
export interface ValidatorMetric {
  validationLoss?: number | undefined;
}
export interface GetCustomModelResponse {
  modelArn: string | undefined;
  modelName: string | undefined;
  jobName?: string | undefined;
  jobArn?: string | undefined;
  baseModelArn?: string | undefined;
  customizationType?: CustomizationType | undefined;
  modelKmsKeyArn?: string | undefined;
  hyperParameters?: Record<string, string> | undefined;
  trainingDataConfig?: TrainingDataConfig | undefined;
  validationDataConfig?: ValidationDataConfig | undefined;
  outputDataConfig?: OutputDataConfig | undefined;
  trainingMetrics?: TrainingMetrics | undefined;
  validationMetrics?: ValidatorMetric[] | undefined;
  creationTime: Date | undefined;
  customizationConfig?: CustomizationConfig | undefined;
  modelStatus?: ModelStatus | undefined;
  failureMessage?: string | undefined;
}
export interface ListCustomModelsRequest {
  creationTimeBefore?: Date | undefined;
  creationTimeAfter?: Date | undefined;
  nameContains?: string | undefined;
  baseModelArnEquals?: string | undefined;
  foundationModelArnEquals?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  sortBy?: SortModelsBy | undefined;
  sortOrder?: SortOrder | undefined;
  isOwned?: boolean | undefined;
  modelStatus?: ModelStatus | undefined;
}
export interface CustomModelSummary {
  modelArn: string | undefined;
  modelName: string | undefined;
  creationTime: Date | undefined;
  baseModelArn: string | undefined;
  baseModelName: string | undefined;
  customizationType?: CustomizationType | undefined;
  ownerAccountId?: string | undefined;
  modelStatus?: ModelStatus | undefined;
}
export interface ListCustomModelsResponse {
  nextToken?: string | undefined;
  modelSummaries?: CustomModelSummary[] | undefined;
}
export interface DeleteEnforcedGuardrailConfigurationRequest {
  configId: string | undefined;
}
export interface DeleteEnforcedGuardrailConfigurationResponse {}
export interface ListEnforcedGuardrailsConfigurationRequest {
  nextToken?: string | undefined;
}
export interface ListEnforcedGuardrailsConfigurationResponse {
  guardrailsConfig: AccountEnforcedGuardrailOutputConfiguration[] | undefined;
  nextToken?: string | undefined;
}
export interface PutEnforcedGuardrailConfigurationRequest {
  configId?: string | undefined;
  guardrailInferenceConfig:
    | AccountEnforcedGuardrailInferenceInputConfiguration
    | undefined;
}
export interface PutEnforcedGuardrailConfigurationResponse {
  configId?: string | undefined;
  updatedAt?: Date | undefined;
  updatedBy?: string | undefined;
}
export interface BatchDeleteEvaluationJobRequest {
  jobIdentifiers: string[] | undefined;
}
export interface BatchDeleteEvaluationJobError {
  jobIdentifier: string | undefined;
  code: string | undefined;
  message?: string | undefined;
}
export interface BatchDeleteEvaluationJobItem {
  jobIdentifier: string | undefined;
  jobStatus: EvaluationJobStatus | undefined;
}
export interface BatchDeleteEvaluationJobResponse {
  errors: BatchDeleteEvaluationJobError[] | undefined;
  evaluationJobs: BatchDeleteEvaluationJobItem[] | undefined;
}
export type RatingScaleItemValue =
  | RatingScaleItemValue.FloatValueMember
  | RatingScaleItemValue.StringValueMember
  | RatingScaleItemValue.$UnknownMember;
export declare namespace RatingScaleItemValue {
  interface StringValueMember {
    stringValue: string;
    floatValue?: never;
    $unknown?: never;
  }
  interface FloatValueMember {
    stringValue?: never;
    floatValue: number;
    $unknown?: never;
  }
  interface $UnknownMember {
    stringValue?: never;
    floatValue?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    stringValue: (value: string) => T;
    floatValue: (value: number) => T;
    _: (name: string, value: any) => T;
  }
}
export interface RatingScaleItem {
  definition: string | undefined;
  value: RatingScaleItemValue | undefined;
}
export interface CustomMetricDefinition {
  name: string | undefined;
  instructions: string | undefined;
  ratingScale?: RatingScaleItem[] | undefined;
}
export type AutomatedEvaluationCustomMetricSource =
  | AutomatedEvaluationCustomMetricSource.CustomMetricDefinitionMember
  | AutomatedEvaluationCustomMetricSource.$UnknownMember;
export declare namespace AutomatedEvaluationCustomMetricSource {
  interface CustomMetricDefinitionMember {
    customMetricDefinition: CustomMetricDefinition;
    $unknown?: never;
  }
  interface $UnknownMember {
    customMetricDefinition?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    customMetricDefinition: (value: CustomMetricDefinition) => T;
    _: (name: string, value: any) => T;
  }
}
export interface CustomMetricBedrockEvaluatorModel {
  modelIdentifier: string | undefined;
}
export interface CustomMetricEvaluatorModelConfig {
  bedrockEvaluatorModels: CustomMetricBedrockEvaluatorModel[] | undefined;
}
export interface AutomatedEvaluationCustomMetricConfig {
  customMetrics: AutomatedEvaluationCustomMetricSource[] | undefined;
  evaluatorModelConfig: CustomMetricEvaluatorModelConfig | undefined;
}
export type EvaluationDatasetLocation =
  | EvaluationDatasetLocation.S3UriMember
  | EvaluationDatasetLocation.$UnknownMember;
export declare namespace EvaluationDatasetLocation {
  interface S3UriMember {
    s3Uri: string;
    $unknown?: never;
  }
  interface $UnknownMember {
    s3Uri?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    s3Uri: (value: string) => T;
    _: (name: string, value: any) => T;
  }
}
export interface EvaluationDataset {
  name: string | undefined;
  datasetLocation?: EvaluationDatasetLocation | undefined;
}
export interface EvaluationDatasetMetricConfig {
  taskType: EvaluationTaskType | undefined;
  dataset: EvaluationDataset | undefined;
  metricNames: string[] | undefined;
}
export interface BedrockEvaluatorModel {
  modelIdentifier: string | undefined;
}
export type EvaluatorModelConfig =
  | EvaluatorModelConfig.BedrockEvaluatorModelsMember
  | EvaluatorModelConfig.$UnknownMember;
export declare namespace EvaluatorModelConfig {
  interface BedrockEvaluatorModelsMember {
    bedrockEvaluatorModels: BedrockEvaluatorModel[];
    $unknown?: never;
  }
  interface $UnknownMember {
    bedrockEvaluatorModels?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    bedrockEvaluatorModels: (value: BedrockEvaluatorModel[]) => T;
    _: (name: string, value: any) => T;
  }
}
export interface AutomatedEvaluationConfig {
  datasetMetricConfigs: EvaluationDatasetMetricConfig[] | undefined;
  evaluatorModelConfig?: EvaluatorModelConfig | undefined;
  customMetricConfig?: AutomatedEvaluationCustomMetricConfig | undefined;
}
export interface HumanEvaluationCustomMetric {
  name: string | undefined;
  description?: string | undefined;
  ratingMethod: string | undefined;
}
export interface HumanWorkflowConfig {
  flowDefinitionArn: string | undefined;
  instructions?: string | undefined;
}
export interface HumanEvaluationConfig {
  humanWorkflowConfig?: HumanWorkflowConfig | undefined;
  customMetrics?: HumanEvaluationCustomMetric[] | undefined;
  datasetMetricConfigs: EvaluationDatasetMetricConfig[] | undefined;
}
export type EvaluationConfig =
  | EvaluationConfig.AutomatedMember
  | EvaluationConfig.HumanMember
  | EvaluationConfig.$UnknownMember;
export declare namespace EvaluationConfig {
  interface AutomatedMember {
    automated: AutomatedEvaluationConfig;
    human?: never;
    $unknown?: never;
  }
  interface HumanMember {
    automated?: never;
    human: HumanEvaluationConfig;
    $unknown?: never;
  }
  interface $UnknownMember {
    automated?: never;
    human?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    automated: (value: AutomatedEvaluationConfig) => T;
    human: (value: HumanEvaluationConfig) => T;
    _: (name: string, value: any) => T;
  }
}
export interface PerformanceConfiguration {
  latency?: PerformanceConfigLatency | undefined;
}
export interface EvaluationBedrockModel {
  modelIdentifier: string | undefined;
  inferenceParams?: string | undefined;
  performanceConfig?: PerformanceConfiguration | undefined;
}
export interface EvaluationPrecomputedInferenceSource {
  inferenceSourceIdentifier: string | undefined;
}
export type EvaluationModelConfig =
  | EvaluationModelConfig.BedrockModelMember
  | EvaluationModelConfig.PrecomputedInferenceSourceMember
  | EvaluationModelConfig.$UnknownMember;
export declare namespace EvaluationModelConfig {
  interface BedrockModelMember {
    bedrockModel: EvaluationBedrockModel;
    precomputedInferenceSource?: never;
    $unknown?: never;
  }
  interface PrecomputedInferenceSourceMember {
    bedrockModel?: never;
    precomputedInferenceSource: EvaluationPrecomputedInferenceSource;
    $unknown?: never;
  }
  interface $UnknownMember {
    bedrockModel?: never;
    precomputedInferenceSource?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    bedrockModel: (value: EvaluationBedrockModel) => T;
    precomputedInferenceSource: (
      value: EvaluationPrecomputedInferenceSource
    ) => T;
    _: (name: string, value: any) => T;
  }
}
export interface GuardrailConfiguration {
  guardrailId: string | undefined;
  guardrailVersion: string | undefined;
}
export interface TextInferenceConfig {
  temperature?: number | undefined;
  topP?: number | undefined;
  maxTokens?: number | undefined;
  stopSequences?: string[] | undefined;
}
export interface KbInferenceConfig {
  textInferenceConfig?: TextInferenceConfig | undefined;
}
export interface PromptTemplate {
  textPromptTemplate?: string | undefined;
}
export interface ExternalSourcesGenerationConfiguration {
  promptTemplate?: PromptTemplate | undefined;
  guardrailConfiguration?: GuardrailConfiguration | undefined;
  kbInferenceConfig?: KbInferenceConfig | undefined;
  additionalModelRequestFields?: Record<string, __DocumentType> | undefined;
}
export interface ByteContentDoc {
  identifier: string | undefined;
  contentType: string | undefined;
  data: Uint8Array | undefined;
}
export interface S3ObjectDoc {
  uri: string | undefined;
}
export interface ExternalSource {
  sourceType: ExternalSourceType | undefined;
  s3Location?: S3ObjectDoc | undefined;
  byteContent?: ByteContentDoc | undefined;
}
export interface ExternalSourcesRetrieveAndGenerateConfiguration {
  modelArn: string | undefined;
  sources: ExternalSource[] | undefined;
  generationConfiguration?: ExternalSourcesGenerationConfiguration | undefined;
}
export interface GenerationConfiguration {
  promptTemplate?: PromptTemplate | undefined;
  guardrailConfiguration?: GuardrailConfiguration | undefined;
  kbInferenceConfig?: KbInferenceConfig | undefined;
  additionalModelRequestFields?: Record<string, __DocumentType> | undefined;
}
export interface QueryTransformationConfiguration {
  type: QueryTransformationType | undefined;
}
export interface OrchestrationConfiguration {
  queryTransformationConfiguration:
    | QueryTransformationConfiguration
    | undefined;
}
export interface FilterAttribute {
  key: string | undefined;
  value: __DocumentType | undefined;
}
export interface MetadataAttributeSchema {
  key: string | undefined;
  type: AttributeType | undefined;
  description: string | undefined;
}
export interface ImplicitFilterConfiguration {
  metadataAttributes: MetadataAttributeSchema[] | undefined;
  modelArn: string | undefined;
}
export interface FieldForReranking {
  fieldName: string | undefined;
}
export type RerankingMetadataSelectiveModeConfiguration =
  | RerankingMetadataSelectiveModeConfiguration.FieldsToExcludeMember
  | RerankingMetadataSelectiveModeConfiguration.FieldsToIncludeMember
  | RerankingMetadataSelectiveModeConfiguration.$UnknownMember;
export declare namespace RerankingMetadataSelectiveModeConfiguration {
  interface FieldsToIncludeMember {
    fieldsToInclude: FieldForReranking[];
    fieldsToExclude?: never;
    $unknown?: never;
  }
  interface FieldsToExcludeMember {
    fieldsToInclude?: never;
    fieldsToExclude: FieldForReranking[];
    $unknown?: never;
  }
  interface $UnknownMember {
    fieldsToInclude?: never;
    fieldsToExclude?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    fieldsToInclude: (value: FieldForReranking[]) => T;
    fieldsToExclude: (value: FieldForReranking[]) => T;
    _: (name: string, value: any) => T;
  }
}
export interface MetadataConfigurationForReranking {
  selectionMode: RerankingMetadataSelectionMode | undefined;
  selectiveModeConfiguration?:
    | RerankingMetadataSelectiveModeConfiguration
    | undefined;
}
export interface VectorSearchBedrockRerankingModelConfiguration {
  modelArn: string | undefined;
  additionalModelRequestFields?: Record<string, __DocumentType> | undefined;
}
export interface VectorSearchBedrockRerankingConfiguration {
  modelConfiguration:
    | VectorSearchBedrockRerankingModelConfiguration
    | undefined;
  numberOfRerankedResults?: number | undefined;
  metadataConfiguration?: MetadataConfigurationForReranking | undefined;
}
export interface VectorSearchRerankingConfiguration {
  type: VectorSearchRerankingConfigurationType | undefined;
  bedrockRerankingConfiguration?:
    | VectorSearchBedrockRerankingConfiguration
    | undefined;
}
export interface EvaluationPrecomputedRetrieveAndGenerateSourceConfig {
  ragSourceIdentifier: string | undefined;
}
export interface EvaluationPrecomputedRetrieveSourceConfig {
  ragSourceIdentifier: string | undefined;
}
export type EvaluationPrecomputedRagSourceConfig =
  | EvaluationPrecomputedRagSourceConfig.RetrieveAndGenerateSourceConfigMember
  | EvaluationPrecomputedRagSourceConfig.RetrieveSourceConfigMember
  | EvaluationPrecomputedRagSourceConfig.$UnknownMember;
export declare namespace EvaluationPrecomputedRagSourceConfig {
  interface RetrieveSourceConfigMember {
    retrieveSourceConfig: EvaluationPrecomputedRetrieveSourceConfig;
    retrieveAndGenerateSourceConfig?: never;
    $unknown?: never;
  }
  interface RetrieveAndGenerateSourceConfigMember {
    retrieveSourceConfig?: never;
    retrieveAndGenerateSourceConfig: EvaluationPrecomputedRetrieveAndGenerateSourceConfig;
    $unknown?: never;
  }
  interface $UnknownMember {
    retrieveSourceConfig?: never;
    retrieveAndGenerateSourceConfig?: never;
    $unknown: [string, any];
  }
  interface Visitor<T> {
    retrieveSourceConfig: (
      value: EvaluationPrecomputedRetrieveSourceConfig
    ) => T;
    retrieveAndGenerateSourceConfig: (
      value: EvaluationPrecomputedRetrieveAndGenerateSourceConfig
    ) => T;
    _: (name: string, value: any) => T;
  }
}
export interface EvaluationOutputDataConfig {
  s3Uri: string | undefined;
}
export interface CreateEvaluationJobResponse {
  jobArn: string | undefined;
}
export interface GetEvaluationJobRequest {
  jobIdentifier: string | undefined;
}
export interface ListEvaluationJobsRequest {
  creationTimeAfter?: Date | undefined;
  creationTimeBefore?: Date | undefined;
  statusEquals?: EvaluationJobStatus | undefined;
  applicationTypeEquals?: ApplicationType | undefined;
  nameContains?: string | undefined;
  maxResults?: number | undefined;
  nextToken?: string | undefined;
  sortBy?: SortJobsBy | undefined;
  sortOrder?: SortOrder | undefined;
}
export interface EvaluationModelConfigSummary {
  bedrockModelIdentifiers?: string[] | undefined;
  precomputedInferenceSourceIdentifiers?: string[] | undefined;
}
export interface EvaluationRagConfigSummary {
  bedrockKnowledgeBaseIdentifiers?: string[] | undefined;
  precomputedRagSourceIdentifiers?: string[] | undefined;
}
export interface EvaluationInferenceConfigSummary {
  modelConfigSummary?: EvaluationModelConfigSummary | undefined;
  ragConfigSummary?: EvaluationRagConfigSummary | undefined;
}
export interface EvaluationSummary {
  jobArn: string | undefined;
  jobName: string | undefined;
  status: EvaluationJobStatus | undefined;
  creationTime: Date | undefined;
  jobType: EvaluationJobType | undefined;
  evaluationTaskTypes: EvaluationTaskType[] | undefined;
  modelIdentifiers?: string[] | undefined;
  ragIdentifiers?: string[] | undefined;
  evaluatorModelIdentifiers?: string[] | undefined;
  customMetricsEvaluatorModelIdentifiers?: string[] | undefined;
  inferenceConfigSummary?: EvaluationInferenceConfigSummary | undefined;
  applicationType?: ApplicationType | undefined;
}
export interface ListEvaluationJobsResponse {
  nextToken?: string | undefined;
  jobSummaries?: EvaluationSummary[] | undefined;
}
export interface StopEvaluationJobRequest {
  jobIdentifier: string | undefined;
}
export interface StopEvaluationJobResponse {}
export interface GuardrailAutomatedReasoningPolicyConfig {
  policies: string[] | undefined;
  confidenceThreshold?: number | undefined;
}
export interface GuardrailContentFilterConfig {
  type: GuardrailContentFilterType | undefined;
  inputStrength: GuardrailFilterStrength | undefined;
  outputStrength: GuardrailFilterStrength | undefined;
  inputModalities?: GuardrailModality[] | undefined;
  outputModalities?: GuardrailModality[] | undefined;
  inputAction?: GuardrailContentFilterAction | undefined;
  outputAction?: GuardrailContentFilterAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailContentFiltersTierConfig {
  tierName: GuardrailContentFiltersTierName | undefined;
}
export interface GuardrailContentPolicyConfig {
  filtersConfig: GuardrailContentFilterConfig[] | undefined;
  tierConfig?: GuardrailContentFiltersTierConfig | undefined;
}
export interface GuardrailContextualGroundingFilterConfig {
  type: GuardrailContextualGroundingFilterType | undefined;
  threshold: number | undefined;
  action?: GuardrailContextualGroundingAction | undefined;
  enabled?: boolean | undefined;
}
export interface GuardrailContextualGroundingPolicyConfig {
  filtersConfig: GuardrailContextualGroundingFilterConfig[] | undefined;
}
export interface GuardrailCrossRegionConfig {
  guardrailProfileIdentifier: string | undefined;
}
export interface GuardrailPiiEntityConfig {
  type: GuardrailPiiEntityType | undefined;
  action: GuardrailSensitiveInformationAction | undefined;
  inputAction?: GuardrailSensitiveInformationAction | undefined;
  outputAction?: GuardrailSensitiveInformationAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailRegexConfig {
  name: string | undefined;
  description?: string | undefined;
  pattern: string | undefined;
  action: GuardrailSensitiveInformationAction | undefined;
  inputAction?: GuardrailSensitiveInformationAction | undefined;
  outputAction?: GuardrailSensitiveInformationAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailSensitiveInformationPolicyConfig {
  piiEntitiesConfig?: GuardrailPiiEntityConfig[] | undefined;
  regexesConfig?: GuardrailRegexConfig[] | undefined;
}
export interface GuardrailTopicsTierConfig {
  tierName: GuardrailTopicsTierName | undefined;
}
export interface GuardrailTopicConfig {
  name: string | undefined;
  definition: string | undefined;
  examples?: string[] | undefined;
  type: GuardrailTopicType | undefined;
  inputAction?: GuardrailTopicAction | undefined;
  outputAction?: GuardrailTopicAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailTopicPolicyConfig {
  topicsConfig: GuardrailTopicConfig[] | undefined;
  tierConfig?: GuardrailTopicsTierConfig | undefined;
}
export interface GuardrailManagedWordsConfig {
  type: GuardrailManagedWordsType | undefined;
  inputAction?: GuardrailWordAction | undefined;
  outputAction?: GuardrailWordAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailWordConfig {
  text: string | undefined;
  inputAction?: GuardrailWordAction | undefined;
  outputAction?: GuardrailWordAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailWordPolicyConfig {
  wordsConfig?: GuardrailWordConfig[] | undefined;
  managedWordListsConfig?: GuardrailManagedWordsConfig[] | undefined;
}
export interface CreateGuardrailRequest {
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
  tags?: Tag[] | undefined;
  clientRequestToken?: string | undefined;
}
export interface CreateGuardrailResponse {
  guardrailId: string | undefined;
  guardrailArn: string | undefined;
  version: string | undefined;
  createdAt: Date | undefined;
}
export interface CreateGuardrailVersionRequest {
  guardrailIdentifier: string | undefined;
  description?: string | undefined;
  clientRequestToken?: string | undefined;
}
export interface CreateGuardrailVersionResponse {
  guardrailId: string | undefined;
  version: string | undefined;
}
export interface DeleteGuardrailRequest {
  guardrailIdentifier: string | undefined;
  guardrailVersion?: string | undefined;
}
export interface DeleteGuardrailResponse {}
export interface GetGuardrailRequest {
  guardrailIdentifier: string | undefined;
  guardrailVersion?: string | undefined;
}
export interface GuardrailAutomatedReasoningPolicy {
  policies: string[] | undefined;
  confidenceThreshold?: number | undefined;
}
export interface GuardrailContentFilter {
  type: GuardrailContentFilterType | undefined;
  inputStrength: GuardrailFilterStrength | undefined;
  outputStrength: GuardrailFilterStrength | undefined;
  inputModalities?: GuardrailModality[] | undefined;
  outputModalities?: GuardrailModality[] | undefined;
  inputAction?: GuardrailContentFilterAction | undefined;
  outputAction?: GuardrailContentFilterAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailContentFiltersTier {
  tierName: GuardrailContentFiltersTierName | undefined;
}
export interface GuardrailContentPolicy {
  filters?: GuardrailContentFilter[] | undefined;
  tier?: GuardrailContentFiltersTier | undefined;
}
export interface GuardrailContextualGroundingFilter {
  type: GuardrailContextualGroundingFilterType | undefined;
  threshold: number | undefined;
  action?: GuardrailContextualGroundingAction | undefined;
  enabled?: boolean | undefined;
}
export interface GuardrailContextualGroundingPolicy {
  filters: GuardrailContextualGroundingFilter[] | undefined;
}
export interface GuardrailCrossRegionDetails {
  guardrailProfileId?: string | undefined;
  guardrailProfileArn?: string | undefined;
}
export interface GuardrailPiiEntity {
  type: GuardrailPiiEntityType | undefined;
  action: GuardrailSensitiveInformationAction | undefined;
  inputAction?: GuardrailSensitiveInformationAction | undefined;
  outputAction?: GuardrailSensitiveInformationAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailRegex {
  name: string | undefined;
  description?: string | undefined;
  pattern: string | undefined;
  action: GuardrailSensitiveInformationAction | undefined;
  inputAction?: GuardrailSensitiveInformationAction | undefined;
  outputAction?: GuardrailSensitiveInformationAction | undefined;
  inputEnabled?: boolean | undefined;
  outputEnabled?: boolean | undefined;
}
export interface GuardrailSensitiveInformationPolicy {
  piiEntities?: GuardrailPiiEntity[] | undefined;
  regexes?: GuardrailRegex[] | undefined;
}
