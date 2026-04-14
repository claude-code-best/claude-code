import {
  HttpHandlerOptions as __HttpHandlerOptions,
  PaginationConfiguration,
  Paginator,
} from "@smithy/types";
import { BedrockClient } from "./BedrockClient";
import {
  BatchDeleteEvaluationJobCommandInput,
  BatchDeleteEvaluationJobCommandOutput,
} from "./commands/BatchDeleteEvaluationJobCommand";
import {
  CancelAutomatedReasoningPolicyBuildWorkflowCommandInput,
  CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput,
} from "./commands/CancelAutomatedReasoningPolicyBuildWorkflowCommand";
import {
  CreateAutomatedReasoningPolicyCommandInput,
  CreateAutomatedReasoningPolicyCommandOutput,
} from "./commands/CreateAutomatedReasoningPolicyCommand";
import {
  CreateAutomatedReasoningPolicyTestCaseCommandInput,
  CreateAutomatedReasoningPolicyTestCaseCommandOutput,
} from "./commands/CreateAutomatedReasoningPolicyTestCaseCommand";
import {
  CreateAutomatedReasoningPolicyVersionCommandInput,
  CreateAutomatedReasoningPolicyVersionCommandOutput,
} from "./commands/CreateAutomatedReasoningPolicyVersionCommand";
import {
  CreateCustomModelCommandInput,
  CreateCustomModelCommandOutput,
} from "./commands/CreateCustomModelCommand";
import {
  CreateCustomModelDeploymentCommandInput,
  CreateCustomModelDeploymentCommandOutput,
} from "./commands/CreateCustomModelDeploymentCommand";
import {
  CreateEvaluationJobCommandInput,
  CreateEvaluationJobCommandOutput,
} from "./commands/CreateEvaluationJobCommand";
import {
  CreateFoundationModelAgreementCommandInput,
  CreateFoundationModelAgreementCommandOutput,
} from "./commands/CreateFoundationModelAgreementCommand";
import {
  CreateGuardrailCommandInput,
  CreateGuardrailCommandOutput,
} from "./commands/CreateGuardrailCommand";
import {
  CreateGuardrailVersionCommandInput,
  CreateGuardrailVersionCommandOutput,
} from "./commands/CreateGuardrailVersionCommand";
import {
  CreateInferenceProfileCommandInput,
  CreateInferenceProfileCommandOutput,
} from "./commands/CreateInferenceProfileCommand";
import {
  CreateMarketplaceModelEndpointCommandInput,
  CreateMarketplaceModelEndpointCommandOutput,
} from "./commands/CreateMarketplaceModelEndpointCommand";
import {
  CreateModelCopyJobCommandInput,
  CreateModelCopyJobCommandOutput,
} from "./commands/CreateModelCopyJobCommand";
import {
  CreateModelCustomizationJobCommandInput,
  CreateModelCustomizationJobCommandOutput,
} from "./commands/CreateModelCustomizationJobCommand";
import {
  CreateModelImportJobCommandInput,
  CreateModelImportJobCommandOutput,
} from "./commands/CreateModelImportJobCommand";
import {
  CreateModelInvocationJobCommandInput,
  CreateModelInvocationJobCommandOutput,
} from "./commands/CreateModelInvocationJobCommand";
import {
  CreatePromptRouterCommandInput,
  CreatePromptRouterCommandOutput,
} from "./commands/CreatePromptRouterCommand";
import {
  CreateProvisionedModelThroughputCommandInput,
  CreateProvisionedModelThroughputCommandOutput,
} from "./commands/CreateProvisionedModelThroughputCommand";
import {
  DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput,
  DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput,
} from "./commands/DeleteAutomatedReasoningPolicyBuildWorkflowCommand";
import {
  DeleteAutomatedReasoningPolicyCommandInput,
  DeleteAutomatedReasoningPolicyCommandOutput,
} from "./commands/DeleteAutomatedReasoningPolicyCommand";
import {
  DeleteAutomatedReasoningPolicyTestCaseCommandInput,
  DeleteAutomatedReasoningPolicyTestCaseCommandOutput,
} from "./commands/DeleteAutomatedReasoningPolicyTestCaseCommand";
import {
  DeleteCustomModelCommandInput,
  DeleteCustomModelCommandOutput,
} from "./commands/DeleteCustomModelCommand";
import {
  DeleteCustomModelDeploymentCommandInput,
  DeleteCustomModelDeploymentCommandOutput,
} from "./commands/DeleteCustomModelDeploymentCommand";
import {
  DeleteEnforcedGuardrailConfigurationCommandInput,
  DeleteEnforcedGuardrailConfigurationCommandOutput,
} from "./commands/DeleteEnforcedGuardrailConfigurationCommand";
import {
  DeleteFoundationModelAgreementCommandInput,
  DeleteFoundationModelAgreementCommandOutput,
} from "./commands/DeleteFoundationModelAgreementCommand";
import {
  DeleteGuardrailCommandInput,
  DeleteGuardrailCommandOutput,
} from "./commands/DeleteGuardrailCommand";
import {
  DeleteImportedModelCommandInput,
  DeleteImportedModelCommandOutput,
} from "./commands/DeleteImportedModelCommand";
import {
  DeleteInferenceProfileCommandInput,
  DeleteInferenceProfileCommandOutput,
} from "./commands/DeleteInferenceProfileCommand";
import {
  DeleteMarketplaceModelEndpointCommandInput,
  DeleteMarketplaceModelEndpointCommandOutput,
} from "./commands/DeleteMarketplaceModelEndpointCommand";
import {
  DeleteModelInvocationLoggingConfigurationCommandInput,
  DeleteModelInvocationLoggingConfigurationCommandOutput,
} from "./commands/DeleteModelInvocationLoggingConfigurationCommand";
import {
  DeletePromptRouterCommandInput,
  DeletePromptRouterCommandOutput,
} from "./commands/DeletePromptRouterCommand";
import {
  DeleteProvisionedModelThroughputCommandInput,
  DeleteProvisionedModelThroughputCommandOutput,
} from "./commands/DeleteProvisionedModelThroughputCommand";
import {
  DeregisterMarketplaceModelEndpointCommandInput,
  DeregisterMarketplaceModelEndpointCommandOutput,
} from "./commands/DeregisterMarketplaceModelEndpointCommand";
import {
  ExportAutomatedReasoningPolicyVersionCommandInput,
  ExportAutomatedReasoningPolicyVersionCommandOutput,
} from "./commands/ExportAutomatedReasoningPolicyVersionCommand";
import {
  GetAutomatedReasoningPolicyAnnotationsCommandInput,
  GetAutomatedReasoningPolicyAnnotationsCommandOutput,
} from "./commands/GetAutomatedReasoningPolicyAnnotationsCommand";
import {
  GetAutomatedReasoningPolicyBuildWorkflowCommandInput,
  GetAutomatedReasoningPolicyBuildWorkflowCommandOutput,
} from "./commands/GetAutomatedReasoningPolicyBuildWorkflowCommand";
import {
  GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput,
  GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput,
} from "./commands/GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand";
import {
  GetAutomatedReasoningPolicyCommandInput,
  GetAutomatedReasoningPolicyCommandOutput,
} from "./commands/GetAutomatedReasoningPolicyCommand";
import {
  GetAutomatedReasoningPolicyNextScenarioCommandInput,
  GetAutomatedReasoningPolicyNextScenarioCommandOutput,
} from "./commands/GetAutomatedReasoningPolicyNextScenarioCommand";
import {
  GetAutomatedReasoningPolicyTestCaseCommandInput,
  GetAutomatedReasoningPolicyTestCaseCommandOutput,
} from "./commands/GetAutomatedReasoningPolicyTestCaseCommand";
import {
  GetAutomatedReasoningPolicyTestResultCommandInput,
  GetAutomatedReasoningPolicyTestResultCommandOutput,
} from "./commands/GetAutomatedReasoningPolicyTestResultCommand";
import {
  GetCustomModelCommandInput,
  GetCustomModelCommandOutput,
} from "./commands/GetCustomModelCommand";
import {
  GetCustomModelDeploymentCommandInput,
  GetCustomModelDeploymentCommandOutput,
} from "./commands/GetCustomModelDeploymentCommand";
import {
  GetEvaluationJobCommandInput,
  GetEvaluationJobCommandOutput,
} from "./commands/GetEvaluationJobCommand";
import {
  GetFoundationModelAvailabilityCommandInput,
  GetFoundationModelAvailabilityCommandOutput,
} from "./commands/GetFoundationModelAvailabilityCommand";
import {
  GetFoundationModelCommandInput,
  GetFoundationModelCommandOutput,
} from "./commands/GetFoundationModelCommand";
import {
  GetGuardrailCommandInput,
  GetGuardrailCommandOutput,
} from "./commands/GetGuardrailCommand";
import {
  GetImportedModelCommandInput,
  GetImportedModelCommandOutput,
} from "./commands/GetImportedModelCommand";
import {
  GetInferenceProfileCommandInput,
  GetInferenceProfileCommandOutput,
} from "./commands/GetInferenceProfileCommand";
import {
  GetMarketplaceModelEndpointCommandInput,
  GetMarketplaceModelEndpointCommandOutput,
} from "./commands/GetMarketplaceModelEndpointCommand";
import {
  GetModelCopyJobCommandInput,
  GetModelCopyJobCommandOutput,
} from "./commands/GetModelCopyJobCommand";
import {
  GetModelCustomizationJobCommandInput,
  GetModelCustomizationJobCommandOutput,
} from "./commands/GetModelCustomizationJobCommand";
import {
  GetModelImportJobCommandInput,
  GetModelImportJobCommandOutput,
} from "./commands/GetModelImportJobCommand";
import {
  GetModelInvocationJobCommandInput,
  GetModelInvocationJobCommandOutput,
} from "./commands/GetModelInvocationJobCommand";
import {
  GetModelInvocationLoggingConfigurationCommandInput,
  GetModelInvocationLoggingConfigurationCommandOutput,
} from "./commands/GetModelInvocationLoggingConfigurationCommand";
import {
  GetPromptRouterCommandInput,
  GetPromptRouterCommandOutput,
} from "./commands/GetPromptRouterCommand";
import {
  GetProvisionedModelThroughputCommandInput,
  GetProvisionedModelThroughputCommandOutput,
} from "./commands/GetProvisionedModelThroughputCommand";
import {
  GetUseCaseForModelAccessCommandInput,
  GetUseCaseForModelAccessCommandOutput,
} from "./commands/GetUseCaseForModelAccessCommand";
import {
  ListAutomatedReasoningPoliciesCommandInput,
  ListAutomatedReasoningPoliciesCommandOutput,
} from "./commands/ListAutomatedReasoningPoliciesCommand";
import {
  ListAutomatedReasoningPolicyBuildWorkflowsCommandInput,
  ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput,
} from "./commands/ListAutomatedReasoningPolicyBuildWorkflowsCommand";
import {
  ListAutomatedReasoningPolicyTestCasesCommandInput,
  ListAutomatedReasoningPolicyTestCasesCommandOutput,
} from "./commands/ListAutomatedReasoningPolicyTestCasesCommand";
import {
  ListAutomatedReasoningPolicyTestResultsCommandInput,
  ListAutomatedReasoningPolicyTestResultsCommandOutput,
} from "./commands/ListAutomatedReasoningPolicyTestResultsCommand";
import {
  ListCustomModelDeploymentsCommandInput,
  ListCustomModelDeploymentsCommandOutput,
} from "./commands/ListCustomModelDeploymentsCommand";
import {
  ListCustomModelsCommandInput,
  ListCustomModelsCommandOutput,
} from "./commands/ListCustomModelsCommand";
import {
  ListEnforcedGuardrailsConfigurationCommandInput,
  ListEnforcedGuardrailsConfigurationCommandOutput,
} from "./commands/ListEnforcedGuardrailsConfigurationCommand";
import {
  ListEvaluationJobsCommandInput,
  ListEvaluationJobsCommandOutput,
} from "./commands/ListEvaluationJobsCommand";
import {
  ListFoundationModelAgreementOffersCommandInput,
  ListFoundationModelAgreementOffersCommandOutput,
} from "./commands/ListFoundationModelAgreementOffersCommand";
import {
  ListFoundationModelsCommandInput,
  ListFoundationModelsCommandOutput,
} from "./commands/ListFoundationModelsCommand";
import {
  ListGuardrailsCommandInput,
  ListGuardrailsCommandOutput,
} from "./commands/ListGuardrailsCommand";
import {
  ListImportedModelsCommandInput,
  ListImportedModelsCommandOutput,
} from "./commands/ListImportedModelsCommand";
import {
  ListInferenceProfilesCommandInput,
  ListInferenceProfilesCommandOutput,
} from "./commands/ListInferenceProfilesCommand";
import {
  ListMarketplaceModelEndpointsCommandInput,
  ListMarketplaceModelEndpointsCommandOutput,
} from "./commands/ListMarketplaceModelEndpointsCommand";
import {
  ListModelCopyJobsCommandInput,
  ListModelCopyJobsCommandOutput,
} from "./commands/ListModelCopyJobsCommand";
import {
  ListModelCustomizationJobsCommandInput,
  ListModelCustomizationJobsCommandOutput,
} from "./commands/ListModelCustomizationJobsCommand";
import {
  ListModelImportJobsCommandInput,
  ListModelImportJobsCommandOutput,
} from "./commands/ListModelImportJobsCommand";
import {
  ListModelInvocationJobsCommandInput,
  ListModelInvocationJobsCommandOutput,
} from "./commands/ListModelInvocationJobsCommand";
import {
  ListPromptRoutersCommandInput,
  ListPromptRoutersCommandOutput,
} from "./commands/ListPromptRoutersCommand";
import {
  ListProvisionedModelThroughputsCommandInput,
  ListProvisionedModelThroughputsCommandOutput,
} from "./commands/ListProvisionedModelThroughputsCommand";
import {
  ListTagsForResourceCommandInput,
  ListTagsForResourceCommandOutput,
} from "./commands/ListTagsForResourceCommand";
import {
  PutEnforcedGuardrailConfigurationCommandInput,
  PutEnforcedGuardrailConfigurationCommandOutput,
} from "./commands/PutEnforcedGuardrailConfigurationCommand";
import {
  PutModelInvocationLoggingConfigurationCommandInput,
  PutModelInvocationLoggingConfigurationCommandOutput,
} from "./commands/PutModelInvocationLoggingConfigurationCommand";
import {
  PutUseCaseForModelAccessCommandInput,
  PutUseCaseForModelAccessCommandOutput,
} from "./commands/PutUseCaseForModelAccessCommand";
import {
  RegisterMarketplaceModelEndpointCommandInput,
  RegisterMarketplaceModelEndpointCommandOutput,
} from "./commands/RegisterMarketplaceModelEndpointCommand";
import {
  StartAutomatedReasoningPolicyBuildWorkflowCommandInput,
  StartAutomatedReasoningPolicyBuildWorkflowCommandOutput,
} from "./commands/StartAutomatedReasoningPolicyBuildWorkflowCommand";
import {
  StartAutomatedReasoningPolicyTestWorkflowCommandInput,
  StartAutomatedReasoningPolicyTestWorkflowCommandOutput,
} from "./commands/StartAutomatedReasoningPolicyTestWorkflowCommand";
import {
  StopEvaluationJobCommandInput,
  StopEvaluationJobCommandOutput,
} from "./commands/StopEvaluationJobCommand";
import {
  StopModelCustomizationJobCommandInput,
  StopModelCustomizationJobCommandOutput,
} from "./commands/StopModelCustomizationJobCommand";
import {
  StopModelInvocationJobCommandInput,
  StopModelInvocationJobCommandOutput,
} from "./commands/StopModelInvocationJobCommand";
import {
  TagResourceCommandInput,
  TagResourceCommandOutput,
} from "./commands/TagResourceCommand";
import {
  UntagResourceCommandInput,
  UntagResourceCommandOutput,
} from "./commands/UntagResourceCommand";
import {
  UpdateAutomatedReasoningPolicyAnnotationsCommandInput,
  UpdateAutomatedReasoningPolicyAnnotationsCommandOutput,
} from "./commands/UpdateAutomatedReasoningPolicyAnnotationsCommand";
import {
  UpdateAutomatedReasoningPolicyCommandInput,
  UpdateAutomatedReasoningPolicyCommandOutput,
} from "./commands/UpdateAutomatedReasoningPolicyCommand";
import {
  UpdateAutomatedReasoningPolicyTestCaseCommandInput,
  UpdateAutomatedReasoningPolicyTestCaseCommandOutput,
} from "./commands/UpdateAutomatedReasoningPolicyTestCaseCommand";
import {
  UpdateCustomModelDeploymentCommandInput,
  UpdateCustomModelDeploymentCommandOutput,
} from "./commands/UpdateCustomModelDeploymentCommand";
import {
  UpdateGuardrailCommandInput,
  UpdateGuardrailCommandOutput,
} from "./commands/UpdateGuardrailCommand";
import {
  UpdateMarketplaceModelEndpointCommandInput,
  UpdateMarketplaceModelEndpointCommandOutput,
} from "./commands/UpdateMarketplaceModelEndpointCommand";
import {
  UpdateProvisionedModelThroughputCommandInput,
  UpdateProvisionedModelThroughputCommandOutput,
} from "./commands/UpdateProvisionedModelThroughputCommand";
export interface Bedrock {
  batchDeleteEvaluationJob(
    args: BatchDeleteEvaluationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<BatchDeleteEvaluationJobCommandOutput>;
  batchDeleteEvaluationJob(
    args: BatchDeleteEvaluationJobCommandInput,
    cb: (err: any, data?: BatchDeleteEvaluationJobCommandOutput) => void
  ): void;
  batchDeleteEvaluationJob(
    args: BatchDeleteEvaluationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: BatchDeleteEvaluationJobCommandOutput) => void
  ): void;
  cancelAutomatedReasoningPolicyBuildWorkflow(
    args: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput>;
  cancelAutomatedReasoningPolicyBuildWorkflow(
    args: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput,
    cb: (
      err: any,
      data?: CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput
    ) => void
  ): void;
  cancelAutomatedReasoningPolicyBuildWorkflow(
    args: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput
    ) => void
  ): void;
  createAutomatedReasoningPolicy(
    args: CreateAutomatedReasoningPolicyCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateAutomatedReasoningPolicyCommandOutput>;
  createAutomatedReasoningPolicy(
    args: CreateAutomatedReasoningPolicyCommandInput,
    cb: (err: any, data?: CreateAutomatedReasoningPolicyCommandOutput) => void
  ): void;
  createAutomatedReasoningPolicy(
    args: CreateAutomatedReasoningPolicyCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateAutomatedReasoningPolicyCommandOutput) => void
  ): void;
  createAutomatedReasoningPolicyTestCase(
    args: CreateAutomatedReasoningPolicyTestCaseCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateAutomatedReasoningPolicyTestCaseCommandOutput>;
  createAutomatedReasoningPolicyTestCase(
    args: CreateAutomatedReasoningPolicyTestCaseCommandInput,
    cb: (
      err: any,
      data?: CreateAutomatedReasoningPolicyTestCaseCommandOutput
    ) => void
  ): void;
  createAutomatedReasoningPolicyTestCase(
    args: CreateAutomatedReasoningPolicyTestCaseCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: CreateAutomatedReasoningPolicyTestCaseCommandOutput
    ) => void
  ): void;
  createAutomatedReasoningPolicyVersion(
    args: CreateAutomatedReasoningPolicyVersionCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateAutomatedReasoningPolicyVersionCommandOutput>;
  createAutomatedReasoningPolicyVersion(
    args: CreateAutomatedReasoningPolicyVersionCommandInput,
    cb: (
      err: any,
      data?: CreateAutomatedReasoningPolicyVersionCommandOutput
    ) => void
  ): void;
  createAutomatedReasoningPolicyVersion(
    args: CreateAutomatedReasoningPolicyVersionCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: CreateAutomatedReasoningPolicyVersionCommandOutput
    ) => void
  ): void;
  createCustomModel(
    args: CreateCustomModelCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateCustomModelCommandOutput>;
  createCustomModel(
    args: CreateCustomModelCommandInput,
    cb: (err: any, data?: CreateCustomModelCommandOutput) => void
  ): void;
  createCustomModel(
    args: CreateCustomModelCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateCustomModelCommandOutput) => void
  ): void;
  createCustomModelDeployment(
    args: CreateCustomModelDeploymentCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateCustomModelDeploymentCommandOutput>;
  createCustomModelDeployment(
    args: CreateCustomModelDeploymentCommandInput,
    cb: (err: any, data?: CreateCustomModelDeploymentCommandOutput) => void
  ): void;
  createCustomModelDeployment(
    args: CreateCustomModelDeploymentCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateCustomModelDeploymentCommandOutput) => void
  ): void;
  createEvaluationJob(
    args: CreateEvaluationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateEvaluationJobCommandOutput>;
  createEvaluationJob(
    args: CreateEvaluationJobCommandInput,
    cb: (err: any, data?: CreateEvaluationJobCommandOutput) => void
  ): void;
  createEvaluationJob(
    args: CreateEvaluationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateEvaluationJobCommandOutput) => void
  ): void;
  createFoundationModelAgreement(
    args: CreateFoundationModelAgreementCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateFoundationModelAgreementCommandOutput>;
  createFoundationModelAgreement(
    args: CreateFoundationModelAgreementCommandInput,
    cb: (err: any, data?: CreateFoundationModelAgreementCommandOutput) => void
  ): void;
  createFoundationModelAgreement(
    args: CreateFoundationModelAgreementCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateFoundationModelAgreementCommandOutput) => void
  ): void;
  createGuardrail(
    args: CreateGuardrailCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateGuardrailCommandOutput>;
  createGuardrail(
    args: CreateGuardrailCommandInput,
    cb: (err: any, data?: CreateGuardrailCommandOutput) => void
  ): void;
  createGuardrail(
    args: CreateGuardrailCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateGuardrailCommandOutput) => void
  ): void;
  createGuardrailVersion(
    args: CreateGuardrailVersionCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateGuardrailVersionCommandOutput>;
  createGuardrailVersion(
    args: CreateGuardrailVersionCommandInput,
    cb: (err: any, data?: CreateGuardrailVersionCommandOutput) => void
  ): void;
  createGuardrailVersion(
    args: CreateGuardrailVersionCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateGuardrailVersionCommandOutput) => void
  ): void;
  createInferenceProfile(
    args: CreateInferenceProfileCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateInferenceProfileCommandOutput>;
  createInferenceProfile(
    args: CreateInferenceProfileCommandInput,
    cb: (err: any, data?: CreateInferenceProfileCommandOutput) => void
  ): void;
  createInferenceProfile(
    args: CreateInferenceProfileCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateInferenceProfileCommandOutput) => void
  ): void;
  createMarketplaceModelEndpoint(
    args: CreateMarketplaceModelEndpointCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateMarketplaceModelEndpointCommandOutput>;
  createMarketplaceModelEndpoint(
    args: CreateMarketplaceModelEndpointCommandInput,
    cb: (err: any, data?: CreateMarketplaceModelEndpointCommandOutput) => void
  ): void;
  createMarketplaceModelEndpoint(
    args: CreateMarketplaceModelEndpointCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateMarketplaceModelEndpointCommandOutput) => void
  ): void;
  createModelCopyJob(
    args: CreateModelCopyJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateModelCopyJobCommandOutput>;
  createModelCopyJob(
    args: CreateModelCopyJobCommandInput,
    cb: (err: any, data?: CreateModelCopyJobCommandOutput) => void
  ): void;
  createModelCopyJob(
    args: CreateModelCopyJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateModelCopyJobCommandOutput) => void
  ): void;
  createModelCustomizationJob(
    args: CreateModelCustomizationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateModelCustomizationJobCommandOutput>;
  createModelCustomizationJob(
    args: CreateModelCustomizationJobCommandInput,
    cb: (err: any, data?: CreateModelCustomizationJobCommandOutput) => void
  ): void;
  createModelCustomizationJob(
    args: CreateModelCustomizationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateModelCustomizationJobCommandOutput) => void
  ): void;
  createModelImportJob(
    args: CreateModelImportJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateModelImportJobCommandOutput>;
  createModelImportJob(
    args: CreateModelImportJobCommandInput,
    cb: (err: any, data?: CreateModelImportJobCommandOutput) => void
  ): void;
  createModelImportJob(
    args: CreateModelImportJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateModelImportJobCommandOutput) => void
  ): void;
  createModelInvocationJob(
    args: CreateModelInvocationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateModelInvocationJobCommandOutput>;
  createModelInvocationJob(
    args: CreateModelInvocationJobCommandInput,
    cb: (err: any, data?: CreateModelInvocationJobCommandOutput) => void
  ): void;
  createModelInvocationJob(
    args: CreateModelInvocationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateModelInvocationJobCommandOutput) => void
  ): void;
  createPromptRouter(
    args: CreatePromptRouterCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreatePromptRouterCommandOutput>;
  createPromptRouter(
    args: CreatePromptRouterCommandInput,
    cb: (err: any, data?: CreatePromptRouterCommandOutput) => void
  ): void;
  createPromptRouter(
    args: CreatePromptRouterCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreatePromptRouterCommandOutput) => void
  ): void;
  createProvisionedModelThroughput(
    args: CreateProvisionedModelThroughputCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<CreateProvisionedModelThroughputCommandOutput>;
  createProvisionedModelThroughput(
    args: CreateProvisionedModelThroughputCommandInput,
    cb: (err: any, data?: CreateProvisionedModelThroughputCommandOutput) => void
  ): void;
  createProvisionedModelThroughput(
    args: CreateProvisionedModelThroughputCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: CreateProvisionedModelThroughputCommandOutput) => void
  ): void;
  deleteAutomatedReasoningPolicy(
    args: DeleteAutomatedReasoningPolicyCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteAutomatedReasoningPolicyCommandOutput>;
  deleteAutomatedReasoningPolicy(
    args: DeleteAutomatedReasoningPolicyCommandInput,
    cb: (err: any, data?: DeleteAutomatedReasoningPolicyCommandOutput) => void
  ): void;
  deleteAutomatedReasoningPolicy(
    args: DeleteAutomatedReasoningPolicyCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeleteAutomatedReasoningPolicyCommandOutput) => void
  ): void;
  deleteAutomatedReasoningPolicyBuildWorkflow(
    args: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput>;
  deleteAutomatedReasoningPolicyBuildWorkflow(
    args: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput,
    cb: (
      err: any,
      data?: DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput
    ) => void
  ): void;
  deleteAutomatedReasoningPolicyBuildWorkflow(
    args: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput
    ) => void
  ): void;
  deleteAutomatedReasoningPolicyTestCase(
    args: DeleteAutomatedReasoningPolicyTestCaseCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteAutomatedReasoningPolicyTestCaseCommandOutput>;
  deleteAutomatedReasoningPolicyTestCase(
    args: DeleteAutomatedReasoningPolicyTestCaseCommandInput,
    cb: (
      err: any,
      data?: DeleteAutomatedReasoningPolicyTestCaseCommandOutput
    ) => void
  ): void;
  deleteAutomatedReasoningPolicyTestCase(
    args: DeleteAutomatedReasoningPolicyTestCaseCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: DeleteAutomatedReasoningPolicyTestCaseCommandOutput
    ) => void
  ): void;
  deleteCustomModel(
    args: DeleteCustomModelCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteCustomModelCommandOutput>;
  deleteCustomModel(
    args: DeleteCustomModelCommandInput,
    cb: (err: any, data?: DeleteCustomModelCommandOutput) => void
  ): void;
  deleteCustomModel(
    args: DeleteCustomModelCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeleteCustomModelCommandOutput) => void
  ): void;
  deleteCustomModelDeployment(
    args: DeleteCustomModelDeploymentCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteCustomModelDeploymentCommandOutput>;
  deleteCustomModelDeployment(
    args: DeleteCustomModelDeploymentCommandInput,
    cb: (err: any, data?: DeleteCustomModelDeploymentCommandOutput) => void
  ): void;
  deleteCustomModelDeployment(
    args: DeleteCustomModelDeploymentCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeleteCustomModelDeploymentCommandOutput) => void
  ): void;
  deleteEnforcedGuardrailConfiguration(
    args: DeleteEnforcedGuardrailConfigurationCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteEnforcedGuardrailConfigurationCommandOutput>;
  deleteEnforcedGuardrailConfiguration(
    args: DeleteEnforcedGuardrailConfigurationCommandInput,
    cb: (
      err: any,
      data?: DeleteEnforcedGuardrailConfigurationCommandOutput
    ) => void
  ): void;
  deleteEnforcedGuardrailConfiguration(
    args: DeleteEnforcedGuardrailConfigurationCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: DeleteEnforcedGuardrailConfigurationCommandOutput
    ) => void
  ): void;
  deleteFoundationModelAgreement(
    args: DeleteFoundationModelAgreementCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteFoundationModelAgreementCommandOutput>;
  deleteFoundationModelAgreement(
    args: DeleteFoundationModelAgreementCommandInput,
    cb: (err: any, data?: DeleteFoundationModelAgreementCommandOutput) => void
  ): void;
  deleteFoundationModelAgreement(
    args: DeleteFoundationModelAgreementCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeleteFoundationModelAgreementCommandOutput) => void
  ): void;
  deleteGuardrail(
    args: DeleteGuardrailCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteGuardrailCommandOutput>;
  deleteGuardrail(
    args: DeleteGuardrailCommandInput,
    cb: (err: any, data?: DeleteGuardrailCommandOutput) => void
  ): void;
  deleteGuardrail(
    args: DeleteGuardrailCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeleteGuardrailCommandOutput) => void
  ): void;
  deleteImportedModel(
    args: DeleteImportedModelCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteImportedModelCommandOutput>;
  deleteImportedModel(
    args: DeleteImportedModelCommandInput,
    cb: (err: any, data?: DeleteImportedModelCommandOutput) => void
  ): void;
  deleteImportedModel(
    args: DeleteImportedModelCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeleteImportedModelCommandOutput) => void
  ): void;
  deleteInferenceProfile(
    args: DeleteInferenceProfileCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteInferenceProfileCommandOutput>;
  deleteInferenceProfile(
    args: DeleteInferenceProfileCommandInput,
    cb: (err: any, data?: DeleteInferenceProfileCommandOutput) => void
  ): void;
  deleteInferenceProfile(
    args: DeleteInferenceProfileCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeleteInferenceProfileCommandOutput) => void
  ): void;
  deleteMarketplaceModelEndpoint(
    args: DeleteMarketplaceModelEndpointCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteMarketplaceModelEndpointCommandOutput>;
  deleteMarketplaceModelEndpoint(
    args: DeleteMarketplaceModelEndpointCommandInput,
    cb: (err: any, data?: DeleteMarketplaceModelEndpointCommandOutput) => void
  ): void;
  deleteMarketplaceModelEndpoint(
    args: DeleteMarketplaceModelEndpointCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeleteMarketplaceModelEndpointCommandOutput) => void
  ): void;
  deleteModelInvocationLoggingConfiguration(): Promise<DeleteModelInvocationLoggingConfigurationCommandOutput>;
  deleteModelInvocationLoggingConfiguration(
    args: DeleteModelInvocationLoggingConfigurationCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteModelInvocationLoggingConfigurationCommandOutput>;
  deleteModelInvocationLoggingConfiguration(
    args: DeleteModelInvocationLoggingConfigurationCommandInput,
    cb: (
      err: any,
      data?: DeleteModelInvocationLoggingConfigurationCommandOutput
    ) => void
  ): void;
  deleteModelInvocationLoggingConfiguration(
    args: DeleteModelInvocationLoggingConfigurationCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: DeleteModelInvocationLoggingConfigurationCommandOutput
    ) => void
  ): void;
  deletePromptRouter(
    args: DeletePromptRouterCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeletePromptRouterCommandOutput>;
  deletePromptRouter(
    args: DeletePromptRouterCommandInput,
    cb: (err: any, data?: DeletePromptRouterCommandOutput) => void
  ): void;
  deletePromptRouter(
    args: DeletePromptRouterCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeletePromptRouterCommandOutput) => void
  ): void;
  deleteProvisionedModelThroughput(
    args: DeleteProvisionedModelThroughputCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeleteProvisionedModelThroughputCommandOutput>;
  deleteProvisionedModelThroughput(
    args: DeleteProvisionedModelThroughputCommandInput,
    cb: (err: any, data?: DeleteProvisionedModelThroughputCommandOutput) => void
  ): void;
  deleteProvisionedModelThroughput(
    args: DeleteProvisionedModelThroughputCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: DeleteProvisionedModelThroughputCommandOutput) => void
  ): void;
  deregisterMarketplaceModelEndpoint(
    args: DeregisterMarketplaceModelEndpointCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<DeregisterMarketplaceModelEndpointCommandOutput>;
  deregisterMarketplaceModelEndpoint(
    args: DeregisterMarketplaceModelEndpointCommandInput,
    cb: (
      err: any,
      data?: DeregisterMarketplaceModelEndpointCommandOutput
    ) => void
  ): void;
  deregisterMarketplaceModelEndpoint(
    args: DeregisterMarketplaceModelEndpointCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: DeregisterMarketplaceModelEndpointCommandOutput
    ) => void
  ): void;
  exportAutomatedReasoningPolicyVersion(
    args: ExportAutomatedReasoningPolicyVersionCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ExportAutomatedReasoningPolicyVersionCommandOutput>;
  exportAutomatedReasoningPolicyVersion(
    args: ExportAutomatedReasoningPolicyVersionCommandInput,
    cb: (
      err: any,
      data?: ExportAutomatedReasoningPolicyVersionCommandOutput
    ) => void
  ): void;
  exportAutomatedReasoningPolicyVersion(
    args: ExportAutomatedReasoningPolicyVersionCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: ExportAutomatedReasoningPolicyVersionCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicy(
    args: GetAutomatedReasoningPolicyCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetAutomatedReasoningPolicyCommandOutput>;
  getAutomatedReasoningPolicy(
    args: GetAutomatedReasoningPolicyCommandInput,
    cb: (err: any, data?: GetAutomatedReasoningPolicyCommandOutput) => void
  ): void;
  getAutomatedReasoningPolicy(
    args: GetAutomatedReasoningPolicyCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetAutomatedReasoningPolicyCommandOutput) => void
  ): void;
  getAutomatedReasoningPolicyAnnotations(
    args: GetAutomatedReasoningPolicyAnnotationsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetAutomatedReasoningPolicyAnnotationsCommandOutput>;
  getAutomatedReasoningPolicyAnnotations(
    args: GetAutomatedReasoningPolicyAnnotationsCommandInput,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyAnnotationsCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyAnnotations(
    args: GetAutomatedReasoningPolicyAnnotationsCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyAnnotationsCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyBuildWorkflow(
    args: GetAutomatedReasoningPolicyBuildWorkflowCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetAutomatedReasoningPolicyBuildWorkflowCommandOutput>;
  getAutomatedReasoningPolicyBuildWorkflow(
    args: GetAutomatedReasoningPolicyBuildWorkflowCommandInput,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyBuildWorkflowCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyBuildWorkflow(
    args: GetAutomatedReasoningPolicyBuildWorkflowCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyBuildWorkflowCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyBuildWorkflowResultAssets(
    args: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput>;
  getAutomatedReasoningPolicyBuildWorkflowResultAssets(
    args: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyBuildWorkflowResultAssets(
    args: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyNextScenario(
    args: GetAutomatedReasoningPolicyNextScenarioCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetAutomatedReasoningPolicyNextScenarioCommandOutput>;
  getAutomatedReasoningPolicyNextScenario(
    args: GetAutomatedReasoningPolicyNextScenarioCommandInput,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyNextScenarioCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyNextScenario(
    args: GetAutomatedReasoningPolicyNextScenarioCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyNextScenarioCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyTestCase(
    args: GetAutomatedReasoningPolicyTestCaseCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetAutomatedReasoningPolicyTestCaseCommandOutput>;
  getAutomatedReasoningPolicyTestCase(
    args: GetAutomatedReasoningPolicyTestCaseCommandInput,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyTestCaseCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyTestCase(
    args: GetAutomatedReasoningPolicyTestCaseCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyTestCaseCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyTestResult(
    args: GetAutomatedReasoningPolicyTestResultCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetAutomatedReasoningPolicyTestResultCommandOutput>;
  getAutomatedReasoningPolicyTestResult(
    args: GetAutomatedReasoningPolicyTestResultCommandInput,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyTestResultCommandOutput
    ) => void
  ): void;
  getAutomatedReasoningPolicyTestResult(
    args: GetAutomatedReasoningPolicyTestResultCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: GetAutomatedReasoningPolicyTestResultCommandOutput
    ) => void
  ): void;
  getCustomModel(
    args: GetCustomModelCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetCustomModelCommandOutput>;
  getCustomModel(
    args: GetCustomModelCommandInput,
    cb: (err: any, data?: GetCustomModelCommandOutput) => void
  ): void;
  getCustomModel(
    args: GetCustomModelCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetCustomModelCommandOutput) => void
  ): void;
  getCustomModelDeployment(
    args: GetCustomModelDeploymentCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetCustomModelDeploymentCommandOutput>;
  getCustomModelDeployment(
    args: GetCustomModelDeploymentCommandInput,
    cb: (err: any, data?: GetCustomModelDeploymentCommandOutput) => void
  ): void;
  getCustomModelDeployment(
    args: GetCustomModelDeploymentCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetCustomModelDeploymentCommandOutput) => void
  ): void;
  getEvaluationJob(
    args: GetEvaluationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetEvaluationJobCommandOutput>;
  getEvaluationJob(
    args: GetEvaluationJobCommandInput,
    cb: (err: any, data?: GetEvaluationJobCommandOutput) => void
  ): void;
  getEvaluationJob(
    args: GetEvaluationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetEvaluationJobCommandOutput) => void
  ): void;
  getFoundationModel(
    args: GetFoundationModelCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetFoundationModelCommandOutput>;
  getFoundationModel(
    args: GetFoundationModelCommandInput,
    cb: (err: any, data?: GetFoundationModelCommandOutput) => void
  ): void;
  getFoundationModel(
    args: GetFoundationModelCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetFoundationModelCommandOutput) => void
  ): void;
  getFoundationModelAvailability(
    args: GetFoundationModelAvailabilityCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetFoundationModelAvailabilityCommandOutput>;
  getFoundationModelAvailability(
    args: GetFoundationModelAvailabilityCommandInput,
    cb: (err: any, data?: GetFoundationModelAvailabilityCommandOutput) => void
  ): void;
  getFoundationModelAvailability(
    args: GetFoundationModelAvailabilityCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetFoundationModelAvailabilityCommandOutput) => void
  ): void;
  getGuardrail(
    args: GetGuardrailCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetGuardrailCommandOutput>;
  getGuardrail(
    args: GetGuardrailCommandInput,
    cb: (err: any, data?: GetGuardrailCommandOutput) => void
  ): void;
  getGuardrail(
    args: GetGuardrailCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetGuardrailCommandOutput) => void
  ): void;
  getImportedModel(
    args: GetImportedModelCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetImportedModelCommandOutput>;
  getImportedModel(
    args: GetImportedModelCommandInput,
    cb: (err: any, data?: GetImportedModelCommandOutput) => void
  ): void;
  getImportedModel(
    args: GetImportedModelCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetImportedModelCommandOutput) => void
  ): void;
  getInferenceProfile(
    args: GetInferenceProfileCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetInferenceProfileCommandOutput>;
  getInferenceProfile(
    args: GetInferenceProfileCommandInput,
    cb: (err: any, data?: GetInferenceProfileCommandOutput) => void
  ): void;
  getInferenceProfile(
    args: GetInferenceProfileCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetInferenceProfileCommandOutput) => void
  ): void;
  getMarketplaceModelEndpoint(
    args: GetMarketplaceModelEndpointCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetMarketplaceModelEndpointCommandOutput>;
  getMarketplaceModelEndpoint(
    args: GetMarketplaceModelEndpointCommandInput,
    cb: (err: any, data?: GetMarketplaceModelEndpointCommandOutput) => void
  ): void;
  getMarketplaceModelEndpoint(
    args: GetMarketplaceModelEndpointCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetMarketplaceModelEndpointCommandOutput) => void
  ): void;
  getModelCopyJob(
    args: GetModelCopyJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetModelCopyJobCommandOutput>;
  getModelCopyJob(
    args: GetModelCopyJobCommandInput,
    cb: (err: any, data?: GetModelCopyJobCommandOutput) => void
  ): void;
  getModelCopyJob(
    args: GetModelCopyJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetModelCopyJobCommandOutput) => void
  ): void;
  getModelCustomizationJob(
    args: GetModelCustomizationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetModelCustomizationJobCommandOutput>;
  getModelCustomizationJob(
    args: GetModelCustomizationJobCommandInput,
    cb: (err: any, data?: GetModelCustomizationJobCommandOutput) => void
  ): void;
  getModelCustomizationJob(
    args: GetModelCustomizationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetModelCustomizationJobCommandOutput) => void
  ): void;
  getModelImportJob(
    args: GetModelImportJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetModelImportJobCommandOutput>;
  getModelImportJob(
    args: GetModelImportJobCommandInput,
    cb: (err: any, data?: GetModelImportJobCommandOutput) => void
  ): void;
  getModelImportJob(
    args: GetModelImportJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetModelImportJobCommandOutput) => void
  ): void;
  getModelInvocationJob(
    args: GetModelInvocationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetModelInvocationJobCommandOutput>;
  getModelInvocationJob(
    args: GetModelInvocationJobCommandInput,
    cb: (err: any, data?: GetModelInvocationJobCommandOutput) => void
  ): void;
  getModelInvocationJob(
    args: GetModelInvocationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetModelInvocationJobCommandOutput) => void
  ): void;
  getModelInvocationLoggingConfiguration(): Promise<GetModelInvocationLoggingConfigurationCommandOutput>;
  getModelInvocationLoggingConfiguration(
    args: GetModelInvocationLoggingConfigurationCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetModelInvocationLoggingConfigurationCommandOutput>;
  getModelInvocationLoggingConfiguration(
    args: GetModelInvocationLoggingConfigurationCommandInput,
    cb: (
      err: any,
      data?: GetModelInvocationLoggingConfigurationCommandOutput
    ) => void
  ): void;
  getModelInvocationLoggingConfiguration(
    args: GetModelInvocationLoggingConfigurationCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: GetModelInvocationLoggingConfigurationCommandOutput
    ) => void
  ): void;
  getPromptRouter(
    args: GetPromptRouterCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetPromptRouterCommandOutput>;
  getPromptRouter(
    args: GetPromptRouterCommandInput,
    cb: (err: any, data?: GetPromptRouterCommandOutput) => void
  ): void;
  getPromptRouter(
    args: GetPromptRouterCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetPromptRouterCommandOutput) => void
  ): void;
  getProvisionedModelThroughput(
    args: GetProvisionedModelThroughputCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetProvisionedModelThroughputCommandOutput>;
  getProvisionedModelThroughput(
    args: GetProvisionedModelThroughputCommandInput,
    cb: (err: any, data?: GetProvisionedModelThroughputCommandOutput) => void
  ): void;
  getProvisionedModelThroughput(
    args: GetProvisionedModelThroughputCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetProvisionedModelThroughputCommandOutput) => void
  ): void;
  getUseCaseForModelAccess(): Promise<GetUseCaseForModelAccessCommandOutput>;
  getUseCaseForModelAccess(
    args: GetUseCaseForModelAccessCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<GetUseCaseForModelAccessCommandOutput>;
  getUseCaseForModelAccess(
    args: GetUseCaseForModelAccessCommandInput,
    cb: (err: any, data?: GetUseCaseForModelAccessCommandOutput) => void
  ): void;
  getUseCaseForModelAccess(
    args: GetUseCaseForModelAccessCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: GetUseCaseForModelAccessCommandOutput) => void
  ): void;
  listAutomatedReasoningPolicies(): Promise<ListAutomatedReasoningPoliciesCommandOutput>;
  listAutomatedReasoningPolicies(
    args: ListAutomatedReasoningPoliciesCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListAutomatedReasoningPoliciesCommandOutput>;
  listAutomatedReasoningPolicies(
    args: ListAutomatedReasoningPoliciesCommandInput,
    cb: (err: any, data?: ListAutomatedReasoningPoliciesCommandOutput) => void
  ): void;
  listAutomatedReasoningPolicies(
    args: ListAutomatedReasoningPoliciesCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListAutomatedReasoningPoliciesCommandOutput) => void
  ): void;
  listAutomatedReasoningPolicyBuildWorkflows(
    args: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput>;
  listAutomatedReasoningPolicyBuildWorkflows(
    args: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput,
    cb: (
      err: any,
      data?: ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput
    ) => void
  ): void;
  listAutomatedReasoningPolicyBuildWorkflows(
    args: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput
    ) => void
  ): void;
  listAutomatedReasoningPolicyTestCases(
    args: ListAutomatedReasoningPolicyTestCasesCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListAutomatedReasoningPolicyTestCasesCommandOutput>;
  listAutomatedReasoningPolicyTestCases(
    args: ListAutomatedReasoningPolicyTestCasesCommandInput,
    cb: (
      err: any,
      data?: ListAutomatedReasoningPolicyTestCasesCommandOutput
    ) => void
  ): void;
  listAutomatedReasoningPolicyTestCases(
    args: ListAutomatedReasoningPolicyTestCasesCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: ListAutomatedReasoningPolicyTestCasesCommandOutput
    ) => void
  ): void;
  listAutomatedReasoningPolicyTestResults(
    args: ListAutomatedReasoningPolicyTestResultsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListAutomatedReasoningPolicyTestResultsCommandOutput>;
  listAutomatedReasoningPolicyTestResults(
    args: ListAutomatedReasoningPolicyTestResultsCommandInput,
    cb: (
      err: any,
      data?: ListAutomatedReasoningPolicyTestResultsCommandOutput
    ) => void
  ): void;
  listAutomatedReasoningPolicyTestResults(
    args: ListAutomatedReasoningPolicyTestResultsCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: ListAutomatedReasoningPolicyTestResultsCommandOutput
    ) => void
  ): void;
  listCustomModelDeployments(): Promise<ListCustomModelDeploymentsCommandOutput>;
  listCustomModelDeployments(
    args: ListCustomModelDeploymentsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListCustomModelDeploymentsCommandOutput>;
  listCustomModelDeployments(
    args: ListCustomModelDeploymentsCommandInput,
    cb: (err: any, data?: ListCustomModelDeploymentsCommandOutput) => void
  ): void;
  listCustomModelDeployments(
    args: ListCustomModelDeploymentsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListCustomModelDeploymentsCommandOutput) => void
  ): void;
  listCustomModels(): Promise<ListCustomModelsCommandOutput>;
  listCustomModels(
    args: ListCustomModelsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListCustomModelsCommandOutput>;
  listCustomModels(
    args: ListCustomModelsCommandInput,
    cb: (err: any, data?: ListCustomModelsCommandOutput) => void
  ): void;
  listCustomModels(
    args: ListCustomModelsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListCustomModelsCommandOutput) => void
  ): void;
  listEnforcedGuardrailsConfiguration(): Promise<ListEnforcedGuardrailsConfigurationCommandOutput>;
  listEnforcedGuardrailsConfiguration(
    args: ListEnforcedGuardrailsConfigurationCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListEnforcedGuardrailsConfigurationCommandOutput>;
  listEnforcedGuardrailsConfiguration(
    args: ListEnforcedGuardrailsConfigurationCommandInput,
    cb: (
      err: any,
      data?: ListEnforcedGuardrailsConfigurationCommandOutput
    ) => void
  ): void;
  listEnforcedGuardrailsConfiguration(
    args: ListEnforcedGuardrailsConfigurationCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: ListEnforcedGuardrailsConfigurationCommandOutput
    ) => void
  ): void;
  listEvaluationJobs(): Promise<ListEvaluationJobsCommandOutput>;
  listEvaluationJobs(
    args: ListEvaluationJobsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListEvaluationJobsCommandOutput>;
  listEvaluationJobs(
    args: ListEvaluationJobsCommandInput,
    cb: (err: any, data?: ListEvaluationJobsCommandOutput) => void
  ): void;
  listEvaluationJobs(
    args: ListEvaluationJobsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListEvaluationJobsCommandOutput) => void
  ): void;
  listFoundationModelAgreementOffers(
    args: ListFoundationModelAgreementOffersCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListFoundationModelAgreementOffersCommandOutput>;
  listFoundationModelAgreementOffers(
    args: ListFoundationModelAgreementOffersCommandInput,
    cb: (
      err: any,
      data?: ListFoundationModelAgreementOffersCommandOutput
    ) => void
  ): void;
  listFoundationModelAgreementOffers(
    args: ListFoundationModelAgreementOffersCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: ListFoundationModelAgreementOffersCommandOutput
    ) => void
  ): void;
  listFoundationModels(): Promise<ListFoundationModelsCommandOutput>;
  listFoundationModels(
    args: ListFoundationModelsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListFoundationModelsCommandOutput>;
  listFoundationModels(
    args: ListFoundationModelsCommandInput,
    cb: (err: any, data?: ListFoundationModelsCommandOutput) => void
  ): void;
  listFoundationModels(
    args: ListFoundationModelsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListFoundationModelsCommandOutput) => void
  ): void;
  listGuardrails(): Promise<ListGuardrailsCommandOutput>;
  listGuardrails(
    args: ListGuardrailsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListGuardrailsCommandOutput>;
  listGuardrails(
    args: ListGuardrailsCommandInput,
    cb: (err: any, data?: ListGuardrailsCommandOutput) => void
  ): void;
  listGuardrails(
    args: ListGuardrailsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListGuardrailsCommandOutput) => void
  ): void;
  listImportedModels(): Promise<ListImportedModelsCommandOutput>;
  listImportedModels(
    args: ListImportedModelsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListImportedModelsCommandOutput>;
  listImportedModels(
    args: ListImportedModelsCommandInput,
    cb: (err: any, data?: ListImportedModelsCommandOutput) => void
  ): void;
  listImportedModels(
    args: ListImportedModelsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListImportedModelsCommandOutput) => void
  ): void;
  listInferenceProfiles(): Promise<ListInferenceProfilesCommandOutput>;
  listInferenceProfiles(
    args: ListInferenceProfilesCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListInferenceProfilesCommandOutput>;
  listInferenceProfiles(
    args: ListInferenceProfilesCommandInput,
    cb: (err: any, data?: ListInferenceProfilesCommandOutput) => void
  ): void;
  listInferenceProfiles(
    args: ListInferenceProfilesCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListInferenceProfilesCommandOutput) => void
  ): void;
  listMarketplaceModelEndpoints(): Promise<ListMarketplaceModelEndpointsCommandOutput>;
  listMarketplaceModelEndpoints(
    args: ListMarketplaceModelEndpointsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListMarketplaceModelEndpointsCommandOutput>;
  listMarketplaceModelEndpoints(
    args: ListMarketplaceModelEndpointsCommandInput,
    cb: (err: any, data?: ListMarketplaceModelEndpointsCommandOutput) => void
  ): void;
  listMarketplaceModelEndpoints(
    args: ListMarketplaceModelEndpointsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListMarketplaceModelEndpointsCommandOutput) => void
  ): void;
  listModelCopyJobs(): Promise<ListModelCopyJobsCommandOutput>;
  listModelCopyJobs(
    args: ListModelCopyJobsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListModelCopyJobsCommandOutput>;
  listModelCopyJobs(
    args: ListModelCopyJobsCommandInput,
    cb: (err: any, data?: ListModelCopyJobsCommandOutput) => void
  ): void;
  listModelCopyJobs(
    args: ListModelCopyJobsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListModelCopyJobsCommandOutput) => void
  ): void;
  listModelCustomizationJobs(): Promise<ListModelCustomizationJobsCommandOutput>;
  listModelCustomizationJobs(
    args: ListModelCustomizationJobsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListModelCustomizationJobsCommandOutput>;
  listModelCustomizationJobs(
    args: ListModelCustomizationJobsCommandInput,
    cb: (err: any, data?: ListModelCustomizationJobsCommandOutput) => void
  ): void;
  listModelCustomizationJobs(
    args: ListModelCustomizationJobsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListModelCustomizationJobsCommandOutput) => void
  ): void;
  listModelImportJobs(): Promise<ListModelImportJobsCommandOutput>;
  listModelImportJobs(
    args: ListModelImportJobsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListModelImportJobsCommandOutput>;
  listModelImportJobs(
    args: ListModelImportJobsCommandInput,
    cb: (err: any, data?: ListModelImportJobsCommandOutput) => void
  ): void;
  listModelImportJobs(
    args: ListModelImportJobsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListModelImportJobsCommandOutput) => void
  ): void;
  listModelInvocationJobs(): Promise<ListModelInvocationJobsCommandOutput>;
  listModelInvocationJobs(
    args: ListModelInvocationJobsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListModelInvocationJobsCommandOutput>;
  listModelInvocationJobs(
    args: ListModelInvocationJobsCommandInput,
    cb: (err: any, data?: ListModelInvocationJobsCommandOutput) => void
  ): void;
  listModelInvocationJobs(
    args: ListModelInvocationJobsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListModelInvocationJobsCommandOutput) => void
  ): void;
  listPromptRouters(): Promise<ListPromptRoutersCommandOutput>;
  listPromptRouters(
    args: ListPromptRoutersCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListPromptRoutersCommandOutput>;
  listPromptRouters(
    args: ListPromptRoutersCommandInput,
    cb: (err: any, data?: ListPromptRoutersCommandOutput) => void
  ): void;
  listPromptRouters(
    args: ListPromptRoutersCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListPromptRoutersCommandOutput) => void
  ): void;
  listProvisionedModelThroughputs(): Promise<ListProvisionedModelThroughputsCommandOutput>;
  listProvisionedModelThroughputs(
    args: ListProvisionedModelThroughputsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListProvisionedModelThroughputsCommandOutput>;
  listProvisionedModelThroughputs(
    args: ListProvisionedModelThroughputsCommandInput,
    cb: (err: any, data?: ListProvisionedModelThroughputsCommandOutput) => void
  ): void;
  listProvisionedModelThroughputs(
    args: ListProvisionedModelThroughputsCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListProvisionedModelThroughputsCommandOutput) => void
  ): void;
  listTagsForResource(
    args: ListTagsForResourceCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<ListTagsForResourceCommandOutput>;
  listTagsForResource(
    args: ListTagsForResourceCommandInput,
    cb: (err: any, data?: ListTagsForResourceCommandOutput) => void
  ): void;
  listTagsForResource(
    args: ListTagsForResourceCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: ListTagsForResourceCommandOutput) => void
  ): void;
  putEnforcedGuardrailConfiguration(
    args: PutEnforcedGuardrailConfigurationCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<PutEnforcedGuardrailConfigurationCommandOutput>;
  putEnforcedGuardrailConfiguration(
    args: PutEnforcedGuardrailConfigurationCommandInput,
    cb: (
      err: any,
      data?: PutEnforcedGuardrailConfigurationCommandOutput
    ) => void
  ): void;
  putEnforcedGuardrailConfiguration(
    args: PutEnforcedGuardrailConfigurationCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: PutEnforcedGuardrailConfigurationCommandOutput
    ) => void
  ): void;
  putModelInvocationLoggingConfiguration(
    args: PutModelInvocationLoggingConfigurationCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<PutModelInvocationLoggingConfigurationCommandOutput>;
  putModelInvocationLoggingConfiguration(
    args: PutModelInvocationLoggingConfigurationCommandInput,
    cb: (
      err: any,
      data?: PutModelInvocationLoggingConfigurationCommandOutput
    ) => void
  ): void;
  putModelInvocationLoggingConfiguration(
    args: PutModelInvocationLoggingConfigurationCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: PutModelInvocationLoggingConfigurationCommandOutput
    ) => void
  ): void;
  putUseCaseForModelAccess(
    args: PutUseCaseForModelAccessCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<PutUseCaseForModelAccessCommandOutput>;
  putUseCaseForModelAccess(
    args: PutUseCaseForModelAccessCommandInput,
    cb: (err: any, data?: PutUseCaseForModelAccessCommandOutput) => void
  ): void;
  putUseCaseForModelAccess(
    args: PutUseCaseForModelAccessCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: PutUseCaseForModelAccessCommandOutput) => void
  ): void;
  registerMarketplaceModelEndpoint(
    args: RegisterMarketplaceModelEndpointCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<RegisterMarketplaceModelEndpointCommandOutput>;
  registerMarketplaceModelEndpoint(
    args: RegisterMarketplaceModelEndpointCommandInput,
    cb: (err: any, data?: RegisterMarketplaceModelEndpointCommandOutput) => void
  ): void;
  registerMarketplaceModelEndpoint(
    args: RegisterMarketplaceModelEndpointCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: RegisterMarketplaceModelEndpointCommandOutput) => void
  ): void;
  startAutomatedReasoningPolicyBuildWorkflow(
    args: StartAutomatedReasoningPolicyBuildWorkflowCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<StartAutomatedReasoningPolicyBuildWorkflowCommandOutput>;
  startAutomatedReasoningPolicyBuildWorkflow(
    args: StartAutomatedReasoningPolicyBuildWorkflowCommandInput,
    cb: (
      err: any,
      data?: StartAutomatedReasoningPolicyBuildWorkflowCommandOutput
    ) => void
  ): void;
  startAutomatedReasoningPolicyBuildWorkflow(
    args: StartAutomatedReasoningPolicyBuildWorkflowCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: StartAutomatedReasoningPolicyBuildWorkflowCommandOutput
    ) => void
  ): void;
  startAutomatedReasoningPolicyTestWorkflow(
    args: StartAutomatedReasoningPolicyTestWorkflowCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<StartAutomatedReasoningPolicyTestWorkflowCommandOutput>;
  startAutomatedReasoningPolicyTestWorkflow(
    args: StartAutomatedReasoningPolicyTestWorkflowCommandInput,
    cb: (
      err: any,
      data?: StartAutomatedReasoningPolicyTestWorkflowCommandOutput
    ) => void
  ): void;
  startAutomatedReasoningPolicyTestWorkflow(
    args: StartAutomatedReasoningPolicyTestWorkflowCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: StartAutomatedReasoningPolicyTestWorkflowCommandOutput
    ) => void
  ): void;
  stopEvaluationJob(
    args: StopEvaluationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<StopEvaluationJobCommandOutput>;
  stopEvaluationJob(
    args: StopEvaluationJobCommandInput,
    cb: (err: any, data?: StopEvaluationJobCommandOutput) => void
  ): void;
  stopEvaluationJob(
    args: StopEvaluationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: StopEvaluationJobCommandOutput) => void
  ): void;
  stopModelCustomizationJob(
    args: StopModelCustomizationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<StopModelCustomizationJobCommandOutput>;
  stopModelCustomizationJob(
    args: StopModelCustomizationJobCommandInput,
    cb: (err: any, data?: StopModelCustomizationJobCommandOutput) => void
  ): void;
  stopModelCustomizationJob(
    args: StopModelCustomizationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: StopModelCustomizationJobCommandOutput) => void
  ): void;
  stopModelInvocationJob(
    args: StopModelInvocationJobCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<StopModelInvocationJobCommandOutput>;
  stopModelInvocationJob(
    args: StopModelInvocationJobCommandInput,
    cb: (err: any, data?: StopModelInvocationJobCommandOutput) => void
  ): void;
  stopModelInvocationJob(
    args: StopModelInvocationJobCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: StopModelInvocationJobCommandOutput) => void
  ): void;
  tagResource(
    args: TagResourceCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<TagResourceCommandOutput>;
  tagResource(
    args: TagResourceCommandInput,
    cb: (err: any, data?: TagResourceCommandOutput) => void
  ): void;
  tagResource(
    args: TagResourceCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: TagResourceCommandOutput) => void
  ): void;
  untagResource(
    args: UntagResourceCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<UntagResourceCommandOutput>;
  untagResource(
    args: UntagResourceCommandInput,
    cb: (err: any, data?: UntagResourceCommandOutput) => void
  ): void;
  untagResource(
    args: UntagResourceCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: UntagResourceCommandOutput) => void
  ): void;
  updateAutomatedReasoningPolicy(
    args: UpdateAutomatedReasoningPolicyCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<UpdateAutomatedReasoningPolicyCommandOutput>;
  updateAutomatedReasoningPolicy(
    args: UpdateAutomatedReasoningPolicyCommandInput,
    cb: (err: any, data?: UpdateAutomatedReasoningPolicyCommandOutput) => void
  ): void;
  updateAutomatedReasoningPolicy(
    args: UpdateAutomatedReasoningPolicyCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: UpdateAutomatedReasoningPolicyCommandOutput) => void
  ): void;
  updateAutomatedReasoningPolicyAnnotations(
    args: UpdateAutomatedReasoningPolicyAnnotationsCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<UpdateAutomatedReasoningPolicyAnnotationsCommandOutput>;
  updateAutomatedReasoningPolicyAnnotations(
    args: UpdateAutomatedReasoningPolicyAnnotationsCommandInput,
    cb: (
      err: any,
      data?: UpdateAutomatedReasoningPolicyAnnotationsCommandOutput
    ) => void
  ): void;
  updateAutomatedReasoningPolicyAnnotations(
    args: UpdateAutomatedReasoningPolicyAnnotationsCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: UpdateAutomatedReasoningPolicyAnnotationsCommandOutput
    ) => void
  ): void;
  updateAutomatedReasoningPolicyTestCase(
    args: UpdateAutomatedReasoningPolicyTestCaseCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<UpdateAutomatedReasoningPolicyTestCaseCommandOutput>;
  updateAutomatedReasoningPolicyTestCase(
    args: UpdateAutomatedReasoningPolicyTestCaseCommandInput,
    cb: (
      err: any,
      data?: UpdateAutomatedReasoningPolicyTestCaseCommandOutput
    ) => void
  ): void;
  updateAutomatedReasoningPolicyTestCase(
    args: UpdateAutomatedReasoningPolicyTestCaseCommandInput,
    options: __HttpHandlerOptions,
    cb: (
      err: any,
      data?: UpdateAutomatedReasoningPolicyTestCaseCommandOutput
    ) => void
  ): void;
  updateCustomModelDeployment(
    args: UpdateCustomModelDeploymentCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<UpdateCustomModelDeploymentCommandOutput>;
  updateCustomModelDeployment(
    args: UpdateCustomModelDeploymentCommandInput,
    cb: (err: any, data?: UpdateCustomModelDeploymentCommandOutput) => void
  ): void;
  updateCustomModelDeployment(
    args: UpdateCustomModelDeploymentCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: UpdateCustomModelDeploymentCommandOutput) => void
  ): void;
  updateGuardrail(
    args: UpdateGuardrailCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<UpdateGuardrailCommandOutput>;
  updateGuardrail(
    args: UpdateGuardrailCommandInput,
    cb: (err: any, data?: UpdateGuardrailCommandOutput) => void
  ): void;
  updateGuardrail(
    args: UpdateGuardrailCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: UpdateGuardrailCommandOutput) => void
  ): void;
  updateMarketplaceModelEndpoint(
    args: UpdateMarketplaceModelEndpointCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<UpdateMarketplaceModelEndpointCommandOutput>;
  updateMarketplaceModelEndpoint(
    args: UpdateMarketplaceModelEndpointCommandInput,
    cb: (err: any, data?: UpdateMarketplaceModelEndpointCommandOutput) => void
  ): void;
  updateMarketplaceModelEndpoint(
    args: UpdateMarketplaceModelEndpointCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: UpdateMarketplaceModelEndpointCommandOutput) => void
  ): void;
  updateProvisionedModelThroughput(
    args: UpdateProvisionedModelThroughputCommandInput,
    options?: __HttpHandlerOptions
  ): Promise<UpdateProvisionedModelThroughputCommandOutput>;
  updateProvisionedModelThroughput(
    args: UpdateProvisionedModelThroughputCommandInput,
    cb: (err: any, data?: UpdateProvisionedModelThroughputCommandOutput) => void
  ): void;
  updateProvisionedModelThroughput(
    args: UpdateProvisionedModelThroughputCommandInput,
    options: __HttpHandlerOptions,
    cb: (err: any, data?: UpdateProvisionedModelThroughputCommandOutput) => void
  ): void;
  paginateListAutomatedReasoningPolicies(
    args?: ListAutomatedReasoningPoliciesCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListAutomatedReasoningPoliciesCommandOutput>;
  paginateListAutomatedReasoningPolicyBuildWorkflows(
    args: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput>;
  paginateListAutomatedReasoningPolicyTestCases(
    args: ListAutomatedReasoningPolicyTestCasesCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListAutomatedReasoningPolicyTestCasesCommandOutput>;
  paginateListAutomatedReasoningPolicyTestResults(
    args: ListAutomatedReasoningPolicyTestResultsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListAutomatedReasoningPolicyTestResultsCommandOutput>;
  paginateListCustomModelDeployments(
    args?: ListCustomModelDeploymentsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListCustomModelDeploymentsCommandOutput>;
  paginateListCustomModels(
    args?: ListCustomModelsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListCustomModelsCommandOutput>;
  paginateListEnforcedGuardrailsConfiguration(
    args?: ListEnforcedGuardrailsConfigurationCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListEnforcedGuardrailsConfigurationCommandOutput>;
  paginateListEvaluationJobs(
    args?: ListEvaluationJobsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListEvaluationJobsCommandOutput>;
  paginateListGuardrails(
    args?: ListGuardrailsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListGuardrailsCommandOutput>;
  paginateListImportedModels(
    args?: ListImportedModelsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListImportedModelsCommandOutput>;
  paginateListInferenceProfiles(
    args?: ListInferenceProfilesCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListInferenceProfilesCommandOutput>;
  paginateListMarketplaceModelEndpoints(
    args?: ListMarketplaceModelEndpointsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListMarketplaceModelEndpointsCommandOutput>;
  paginateListModelCopyJobs(
    args?: ListModelCopyJobsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListModelCopyJobsCommandOutput>;
  paginateListModelCustomizationJobs(
    args?: ListModelCustomizationJobsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListModelCustomizationJobsCommandOutput>;
  paginateListModelImportJobs(
    args?: ListModelImportJobsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListModelImportJobsCommandOutput>;
  paginateListModelInvocationJobs(
    args?: ListModelInvocationJobsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListModelInvocationJobsCommandOutput>;
  paginateListPromptRouters(
    args?: ListPromptRoutersCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListPromptRoutersCommandOutput>;
  paginateListProvisionedModelThroughputs(
    args?: ListProvisionedModelThroughputsCommandInput,
    paginationConfig?: Pick<
      PaginationConfiguration,
      Exclude<keyof PaginationConfiguration, "client">
    >
  ): Paginator<ListProvisionedModelThroughputsCommandOutput>;
}
export declare class Bedrock extends BedrockClient implements Bedrock {}
