import type { HttpHandlerOptions as __HttpHandlerOptions, PaginationConfiguration, Paginator } from "@smithy/types";
import { BedrockClient } from "./BedrockClient";
import { type BatchDeleteEvaluationJobCommandInput, type BatchDeleteEvaluationJobCommandOutput } from "./commands/BatchDeleteEvaluationJobCommand";
import { type CancelAutomatedReasoningPolicyBuildWorkflowCommandInput, type CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput } from "./commands/CancelAutomatedReasoningPolicyBuildWorkflowCommand";
import { type CreateAutomatedReasoningPolicyCommandInput, type CreateAutomatedReasoningPolicyCommandOutput } from "./commands/CreateAutomatedReasoningPolicyCommand";
import { type CreateAutomatedReasoningPolicyTestCaseCommandInput, type CreateAutomatedReasoningPolicyTestCaseCommandOutput } from "./commands/CreateAutomatedReasoningPolicyTestCaseCommand";
import { type CreateAutomatedReasoningPolicyVersionCommandInput, type CreateAutomatedReasoningPolicyVersionCommandOutput } from "./commands/CreateAutomatedReasoningPolicyVersionCommand";
import { type CreateCustomModelCommandInput, type CreateCustomModelCommandOutput } from "./commands/CreateCustomModelCommand";
import { type CreateCustomModelDeploymentCommandInput, type CreateCustomModelDeploymentCommandOutput } from "./commands/CreateCustomModelDeploymentCommand";
import { type CreateEvaluationJobCommandInput, type CreateEvaluationJobCommandOutput } from "./commands/CreateEvaluationJobCommand";
import { type CreateFoundationModelAgreementCommandInput, type CreateFoundationModelAgreementCommandOutput } from "./commands/CreateFoundationModelAgreementCommand";
import { type CreateGuardrailCommandInput, type CreateGuardrailCommandOutput } from "./commands/CreateGuardrailCommand";
import { type CreateGuardrailVersionCommandInput, type CreateGuardrailVersionCommandOutput } from "./commands/CreateGuardrailVersionCommand";
import { type CreateInferenceProfileCommandInput, type CreateInferenceProfileCommandOutput } from "./commands/CreateInferenceProfileCommand";
import { type CreateMarketplaceModelEndpointCommandInput, type CreateMarketplaceModelEndpointCommandOutput } from "./commands/CreateMarketplaceModelEndpointCommand";
import { type CreateModelCopyJobCommandInput, type CreateModelCopyJobCommandOutput } from "./commands/CreateModelCopyJobCommand";
import { type CreateModelCustomizationJobCommandInput, type CreateModelCustomizationJobCommandOutput } from "./commands/CreateModelCustomizationJobCommand";
import { type CreateModelImportJobCommandInput, type CreateModelImportJobCommandOutput } from "./commands/CreateModelImportJobCommand";
import { type CreateModelInvocationJobCommandInput, type CreateModelInvocationJobCommandOutput } from "./commands/CreateModelInvocationJobCommand";
import { type CreatePromptRouterCommandInput, type CreatePromptRouterCommandOutput } from "./commands/CreatePromptRouterCommand";
import { type CreateProvisionedModelThroughputCommandInput, type CreateProvisionedModelThroughputCommandOutput } from "./commands/CreateProvisionedModelThroughputCommand";
import { type DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput, type DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput } from "./commands/DeleteAutomatedReasoningPolicyBuildWorkflowCommand";
import { type DeleteAutomatedReasoningPolicyCommandInput, type DeleteAutomatedReasoningPolicyCommandOutput } from "./commands/DeleteAutomatedReasoningPolicyCommand";
import { type DeleteAutomatedReasoningPolicyTestCaseCommandInput, type DeleteAutomatedReasoningPolicyTestCaseCommandOutput } from "./commands/DeleteAutomatedReasoningPolicyTestCaseCommand";
import { type DeleteCustomModelCommandInput, type DeleteCustomModelCommandOutput } from "./commands/DeleteCustomModelCommand";
import { type DeleteCustomModelDeploymentCommandInput, type DeleteCustomModelDeploymentCommandOutput } from "./commands/DeleteCustomModelDeploymentCommand";
import { type DeleteEnforcedGuardrailConfigurationCommandInput, type DeleteEnforcedGuardrailConfigurationCommandOutput } from "./commands/DeleteEnforcedGuardrailConfigurationCommand";
import { type DeleteFoundationModelAgreementCommandInput, type DeleteFoundationModelAgreementCommandOutput } from "./commands/DeleteFoundationModelAgreementCommand";
import { type DeleteGuardrailCommandInput, type DeleteGuardrailCommandOutput } from "./commands/DeleteGuardrailCommand";
import { type DeleteImportedModelCommandInput, type DeleteImportedModelCommandOutput } from "./commands/DeleteImportedModelCommand";
import { type DeleteInferenceProfileCommandInput, type DeleteInferenceProfileCommandOutput } from "./commands/DeleteInferenceProfileCommand";
import { type DeleteMarketplaceModelEndpointCommandInput, type DeleteMarketplaceModelEndpointCommandOutput } from "./commands/DeleteMarketplaceModelEndpointCommand";
import { type DeleteModelInvocationLoggingConfigurationCommandInput, type DeleteModelInvocationLoggingConfigurationCommandOutput } from "./commands/DeleteModelInvocationLoggingConfigurationCommand";
import { type DeletePromptRouterCommandInput, type DeletePromptRouterCommandOutput } from "./commands/DeletePromptRouterCommand";
import { type DeleteProvisionedModelThroughputCommandInput, type DeleteProvisionedModelThroughputCommandOutput } from "./commands/DeleteProvisionedModelThroughputCommand";
import { type DeleteResourcePolicyCommandInput, type DeleteResourcePolicyCommandOutput } from "./commands/DeleteResourcePolicyCommand";
import { type DeregisterMarketplaceModelEndpointCommandInput, type DeregisterMarketplaceModelEndpointCommandOutput } from "./commands/DeregisterMarketplaceModelEndpointCommand";
import { type ExportAutomatedReasoningPolicyVersionCommandInput, type ExportAutomatedReasoningPolicyVersionCommandOutput } from "./commands/ExportAutomatedReasoningPolicyVersionCommand";
import { type GetAutomatedReasoningPolicyAnnotationsCommandInput, type GetAutomatedReasoningPolicyAnnotationsCommandOutput } from "./commands/GetAutomatedReasoningPolicyAnnotationsCommand";
import { type GetAutomatedReasoningPolicyBuildWorkflowCommandInput, type GetAutomatedReasoningPolicyBuildWorkflowCommandOutput } from "./commands/GetAutomatedReasoningPolicyBuildWorkflowCommand";
import { type GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput, type GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput } from "./commands/GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand";
import { type GetAutomatedReasoningPolicyCommandInput, type GetAutomatedReasoningPolicyCommandOutput } from "./commands/GetAutomatedReasoningPolicyCommand";
import { type GetAutomatedReasoningPolicyNextScenarioCommandInput, type GetAutomatedReasoningPolicyNextScenarioCommandOutput } from "./commands/GetAutomatedReasoningPolicyNextScenarioCommand";
import { type GetAutomatedReasoningPolicyTestCaseCommandInput, type GetAutomatedReasoningPolicyTestCaseCommandOutput } from "./commands/GetAutomatedReasoningPolicyTestCaseCommand";
import { type GetAutomatedReasoningPolicyTestResultCommandInput, type GetAutomatedReasoningPolicyTestResultCommandOutput } from "./commands/GetAutomatedReasoningPolicyTestResultCommand";
import { type GetCustomModelCommandInput, type GetCustomModelCommandOutput } from "./commands/GetCustomModelCommand";
import { type GetCustomModelDeploymentCommandInput, type GetCustomModelDeploymentCommandOutput } from "./commands/GetCustomModelDeploymentCommand";
import { type GetEvaluationJobCommandInput, type GetEvaluationJobCommandOutput } from "./commands/GetEvaluationJobCommand";
import { type GetFoundationModelAvailabilityCommandInput, type GetFoundationModelAvailabilityCommandOutput } from "./commands/GetFoundationModelAvailabilityCommand";
import { type GetFoundationModelCommandInput, type GetFoundationModelCommandOutput } from "./commands/GetFoundationModelCommand";
import { type GetGuardrailCommandInput, type GetGuardrailCommandOutput } from "./commands/GetGuardrailCommand";
import { type GetImportedModelCommandInput, type GetImportedModelCommandOutput } from "./commands/GetImportedModelCommand";
import { type GetInferenceProfileCommandInput, type GetInferenceProfileCommandOutput } from "./commands/GetInferenceProfileCommand";
import { type GetMarketplaceModelEndpointCommandInput, type GetMarketplaceModelEndpointCommandOutput } from "./commands/GetMarketplaceModelEndpointCommand";
import { type GetModelCopyJobCommandInput, type GetModelCopyJobCommandOutput } from "./commands/GetModelCopyJobCommand";
import { type GetModelCustomizationJobCommandInput, type GetModelCustomizationJobCommandOutput } from "./commands/GetModelCustomizationJobCommand";
import { type GetModelImportJobCommandInput, type GetModelImportJobCommandOutput } from "./commands/GetModelImportJobCommand";
import { type GetModelInvocationJobCommandInput, type GetModelInvocationJobCommandOutput } from "./commands/GetModelInvocationJobCommand";
import { type GetModelInvocationLoggingConfigurationCommandInput, type GetModelInvocationLoggingConfigurationCommandOutput } from "./commands/GetModelInvocationLoggingConfigurationCommand";
import { type GetPromptRouterCommandInput, type GetPromptRouterCommandOutput } from "./commands/GetPromptRouterCommand";
import { type GetProvisionedModelThroughputCommandInput, type GetProvisionedModelThroughputCommandOutput } from "./commands/GetProvisionedModelThroughputCommand";
import { type GetResourcePolicyCommandInput, type GetResourcePolicyCommandOutput } from "./commands/GetResourcePolicyCommand";
import { type GetUseCaseForModelAccessCommandInput, type GetUseCaseForModelAccessCommandOutput } from "./commands/GetUseCaseForModelAccessCommand";
import { type ListAutomatedReasoningPoliciesCommandInput, type ListAutomatedReasoningPoliciesCommandOutput } from "./commands/ListAutomatedReasoningPoliciesCommand";
import { type ListAutomatedReasoningPolicyBuildWorkflowsCommandInput, type ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput } from "./commands/ListAutomatedReasoningPolicyBuildWorkflowsCommand";
import { type ListAutomatedReasoningPolicyTestCasesCommandInput, type ListAutomatedReasoningPolicyTestCasesCommandOutput } from "./commands/ListAutomatedReasoningPolicyTestCasesCommand";
import { type ListAutomatedReasoningPolicyTestResultsCommandInput, type ListAutomatedReasoningPolicyTestResultsCommandOutput } from "./commands/ListAutomatedReasoningPolicyTestResultsCommand";
import { type ListCustomModelDeploymentsCommandInput, type ListCustomModelDeploymentsCommandOutput } from "./commands/ListCustomModelDeploymentsCommand";
import { type ListCustomModelsCommandInput, type ListCustomModelsCommandOutput } from "./commands/ListCustomModelsCommand";
import { type ListEnforcedGuardrailsConfigurationCommandInput, type ListEnforcedGuardrailsConfigurationCommandOutput } from "./commands/ListEnforcedGuardrailsConfigurationCommand";
import { type ListEvaluationJobsCommandInput, type ListEvaluationJobsCommandOutput } from "./commands/ListEvaluationJobsCommand";
import { type ListFoundationModelAgreementOffersCommandInput, type ListFoundationModelAgreementOffersCommandOutput } from "./commands/ListFoundationModelAgreementOffersCommand";
import { type ListFoundationModelsCommandInput, type ListFoundationModelsCommandOutput } from "./commands/ListFoundationModelsCommand";
import { type ListGuardrailsCommandInput, type ListGuardrailsCommandOutput } from "./commands/ListGuardrailsCommand";
import { type ListImportedModelsCommandInput, type ListImportedModelsCommandOutput } from "./commands/ListImportedModelsCommand";
import { type ListInferenceProfilesCommandInput, type ListInferenceProfilesCommandOutput } from "./commands/ListInferenceProfilesCommand";
import { type ListMarketplaceModelEndpointsCommandInput, type ListMarketplaceModelEndpointsCommandOutput } from "./commands/ListMarketplaceModelEndpointsCommand";
import { type ListModelCopyJobsCommandInput, type ListModelCopyJobsCommandOutput } from "./commands/ListModelCopyJobsCommand";
import { type ListModelCustomizationJobsCommandInput, type ListModelCustomizationJobsCommandOutput } from "./commands/ListModelCustomizationJobsCommand";
import { type ListModelImportJobsCommandInput, type ListModelImportJobsCommandOutput } from "./commands/ListModelImportJobsCommand";
import { type ListModelInvocationJobsCommandInput, type ListModelInvocationJobsCommandOutput } from "./commands/ListModelInvocationJobsCommand";
import { type ListPromptRoutersCommandInput, type ListPromptRoutersCommandOutput } from "./commands/ListPromptRoutersCommand";
import { type ListProvisionedModelThroughputsCommandInput, type ListProvisionedModelThroughputsCommandOutput } from "./commands/ListProvisionedModelThroughputsCommand";
import { type ListTagsForResourceCommandInput, type ListTagsForResourceCommandOutput } from "./commands/ListTagsForResourceCommand";
import { type PutEnforcedGuardrailConfigurationCommandInput, type PutEnforcedGuardrailConfigurationCommandOutput } from "./commands/PutEnforcedGuardrailConfigurationCommand";
import { type PutModelInvocationLoggingConfigurationCommandInput, type PutModelInvocationLoggingConfigurationCommandOutput } from "./commands/PutModelInvocationLoggingConfigurationCommand";
import { type PutResourcePolicyCommandInput, type PutResourcePolicyCommandOutput } from "./commands/PutResourcePolicyCommand";
import { type PutUseCaseForModelAccessCommandInput, type PutUseCaseForModelAccessCommandOutput } from "./commands/PutUseCaseForModelAccessCommand";
import { type RegisterMarketplaceModelEndpointCommandInput, type RegisterMarketplaceModelEndpointCommandOutput } from "./commands/RegisterMarketplaceModelEndpointCommand";
import { type StartAutomatedReasoningPolicyBuildWorkflowCommandInput, type StartAutomatedReasoningPolicyBuildWorkflowCommandOutput } from "./commands/StartAutomatedReasoningPolicyBuildWorkflowCommand";
import { type StartAutomatedReasoningPolicyTestWorkflowCommandInput, type StartAutomatedReasoningPolicyTestWorkflowCommandOutput } from "./commands/StartAutomatedReasoningPolicyTestWorkflowCommand";
import { type StopEvaluationJobCommandInput, type StopEvaluationJobCommandOutput } from "./commands/StopEvaluationJobCommand";
import { type StopModelCustomizationJobCommandInput, type StopModelCustomizationJobCommandOutput } from "./commands/StopModelCustomizationJobCommand";
import { type StopModelInvocationJobCommandInput, type StopModelInvocationJobCommandOutput } from "./commands/StopModelInvocationJobCommand";
import { type TagResourceCommandInput, type TagResourceCommandOutput } from "./commands/TagResourceCommand";
import { type UntagResourceCommandInput, type UntagResourceCommandOutput } from "./commands/UntagResourceCommand";
import { type UpdateAutomatedReasoningPolicyAnnotationsCommandInput, type UpdateAutomatedReasoningPolicyAnnotationsCommandOutput } from "./commands/UpdateAutomatedReasoningPolicyAnnotationsCommand";
import { type UpdateAutomatedReasoningPolicyCommandInput, type UpdateAutomatedReasoningPolicyCommandOutput } from "./commands/UpdateAutomatedReasoningPolicyCommand";
import { type UpdateAutomatedReasoningPolicyTestCaseCommandInput, type UpdateAutomatedReasoningPolicyTestCaseCommandOutput } from "./commands/UpdateAutomatedReasoningPolicyTestCaseCommand";
import { type UpdateCustomModelDeploymentCommandInput, type UpdateCustomModelDeploymentCommandOutput } from "./commands/UpdateCustomModelDeploymentCommand";
import { type UpdateGuardrailCommandInput, type UpdateGuardrailCommandOutput } from "./commands/UpdateGuardrailCommand";
import { type UpdateMarketplaceModelEndpointCommandInput, type UpdateMarketplaceModelEndpointCommandOutput } from "./commands/UpdateMarketplaceModelEndpointCommand";
import { type UpdateProvisionedModelThroughputCommandInput, type UpdateProvisionedModelThroughputCommandOutput } from "./commands/UpdateProvisionedModelThroughputCommand";
export interface Bedrock {
    /**
     * @see {@link BatchDeleteEvaluationJobCommand}
     */
    batchDeleteEvaluationJob(args: BatchDeleteEvaluationJobCommandInput, options?: __HttpHandlerOptions): Promise<BatchDeleteEvaluationJobCommandOutput>;
    batchDeleteEvaluationJob(args: BatchDeleteEvaluationJobCommandInput, cb: (err: any, data?: BatchDeleteEvaluationJobCommandOutput) => void): void;
    batchDeleteEvaluationJob(args: BatchDeleteEvaluationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: BatchDeleteEvaluationJobCommandOutput) => void): void;
    /**
     * @see {@link CancelAutomatedReasoningPolicyBuildWorkflowCommand}
     */
    cancelAutomatedReasoningPolicyBuildWorkflow(args: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput, options?: __HttpHandlerOptions): Promise<CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput>;
    cancelAutomatedReasoningPolicyBuildWorkflow(args: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput, cb: (err: any, data?: CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput) => void): void;
    cancelAutomatedReasoningPolicyBuildWorkflow(args: CancelAutomatedReasoningPolicyBuildWorkflowCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CancelAutomatedReasoningPolicyBuildWorkflowCommandOutput) => void): void;
    /**
     * @see {@link CreateAutomatedReasoningPolicyCommand}
     */
    createAutomatedReasoningPolicy(args: CreateAutomatedReasoningPolicyCommandInput, options?: __HttpHandlerOptions): Promise<CreateAutomatedReasoningPolicyCommandOutput>;
    createAutomatedReasoningPolicy(args: CreateAutomatedReasoningPolicyCommandInput, cb: (err: any, data?: CreateAutomatedReasoningPolicyCommandOutput) => void): void;
    createAutomatedReasoningPolicy(args: CreateAutomatedReasoningPolicyCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateAutomatedReasoningPolicyCommandOutput) => void): void;
    /**
     * @see {@link CreateAutomatedReasoningPolicyTestCaseCommand}
     */
    createAutomatedReasoningPolicyTestCase(args: CreateAutomatedReasoningPolicyTestCaseCommandInput, options?: __HttpHandlerOptions): Promise<CreateAutomatedReasoningPolicyTestCaseCommandOutput>;
    createAutomatedReasoningPolicyTestCase(args: CreateAutomatedReasoningPolicyTestCaseCommandInput, cb: (err: any, data?: CreateAutomatedReasoningPolicyTestCaseCommandOutput) => void): void;
    createAutomatedReasoningPolicyTestCase(args: CreateAutomatedReasoningPolicyTestCaseCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateAutomatedReasoningPolicyTestCaseCommandOutput) => void): void;
    /**
     * @see {@link CreateAutomatedReasoningPolicyVersionCommand}
     */
    createAutomatedReasoningPolicyVersion(args: CreateAutomatedReasoningPolicyVersionCommandInput, options?: __HttpHandlerOptions): Promise<CreateAutomatedReasoningPolicyVersionCommandOutput>;
    createAutomatedReasoningPolicyVersion(args: CreateAutomatedReasoningPolicyVersionCommandInput, cb: (err: any, data?: CreateAutomatedReasoningPolicyVersionCommandOutput) => void): void;
    createAutomatedReasoningPolicyVersion(args: CreateAutomatedReasoningPolicyVersionCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateAutomatedReasoningPolicyVersionCommandOutput) => void): void;
    /**
     * @see {@link CreateCustomModelCommand}
     */
    createCustomModel(args: CreateCustomModelCommandInput, options?: __HttpHandlerOptions): Promise<CreateCustomModelCommandOutput>;
    createCustomModel(args: CreateCustomModelCommandInput, cb: (err: any, data?: CreateCustomModelCommandOutput) => void): void;
    createCustomModel(args: CreateCustomModelCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateCustomModelCommandOutput) => void): void;
    /**
     * @see {@link CreateCustomModelDeploymentCommand}
     */
    createCustomModelDeployment(args: CreateCustomModelDeploymentCommandInput, options?: __HttpHandlerOptions): Promise<CreateCustomModelDeploymentCommandOutput>;
    createCustomModelDeployment(args: CreateCustomModelDeploymentCommandInput, cb: (err: any, data?: CreateCustomModelDeploymentCommandOutput) => void): void;
    createCustomModelDeployment(args: CreateCustomModelDeploymentCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateCustomModelDeploymentCommandOutput) => void): void;
    /**
     * @see {@link CreateEvaluationJobCommand}
     */
    createEvaluationJob(args: CreateEvaluationJobCommandInput, options?: __HttpHandlerOptions): Promise<CreateEvaluationJobCommandOutput>;
    createEvaluationJob(args: CreateEvaluationJobCommandInput, cb: (err: any, data?: CreateEvaluationJobCommandOutput) => void): void;
    createEvaluationJob(args: CreateEvaluationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateEvaluationJobCommandOutput) => void): void;
    /**
     * @see {@link CreateFoundationModelAgreementCommand}
     */
    createFoundationModelAgreement(args: CreateFoundationModelAgreementCommandInput, options?: __HttpHandlerOptions): Promise<CreateFoundationModelAgreementCommandOutput>;
    createFoundationModelAgreement(args: CreateFoundationModelAgreementCommandInput, cb: (err: any, data?: CreateFoundationModelAgreementCommandOutput) => void): void;
    createFoundationModelAgreement(args: CreateFoundationModelAgreementCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateFoundationModelAgreementCommandOutput) => void): void;
    /**
     * @see {@link CreateGuardrailCommand}
     */
    createGuardrail(args: CreateGuardrailCommandInput, options?: __HttpHandlerOptions): Promise<CreateGuardrailCommandOutput>;
    createGuardrail(args: CreateGuardrailCommandInput, cb: (err: any, data?: CreateGuardrailCommandOutput) => void): void;
    createGuardrail(args: CreateGuardrailCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateGuardrailCommandOutput) => void): void;
    /**
     * @see {@link CreateGuardrailVersionCommand}
     */
    createGuardrailVersion(args: CreateGuardrailVersionCommandInput, options?: __HttpHandlerOptions): Promise<CreateGuardrailVersionCommandOutput>;
    createGuardrailVersion(args: CreateGuardrailVersionCommandInput, cb: (err: any, data?: CreateGuardrailVersionCommandOutput) => void): void;
    createGuardrailVersion(args: CreateGuardrailVersionCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateGuardrailVersionCommandOutput) => void): void;
    /**
     * @see {@link CreateInferenceProfileCommand}
     */
    createInferenceProfile(args: CreateInferenceProfileCommandInput, options?: __HttpHandlerOptions): Promise<CreateInferenceProfileCommandOutput>;
    createInferenceProfile(args: CreateInferenceProfileCommandInput, cb: (err: any, data?: CreateInferenceProfileCommandOutput) => void): void;
    createInferenceProfile(args: CreateInferenceProfileCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateInferenceProfileCommandOutput) => void): void;
    /**
     * @see {@link CreateMarketplaceModelEndpointCommand}
     */
    createMarketplaceModelEndpoint(args: CreateMarketplaceModelEndpointCommandInput, options?: __HttpHandlerOptions): Promise<CreateMarketplaceModelEndpointCommandOutput>;
    createMarketplaceModelEndpoint(args: CreateMarketplaceModelEndpointCommandInput, cb: (err: any, data?: CreateMarketplaceModelEndpointCommandOutput) => void): void;
    createMarketplaceModelEndpoint(args: CreateMarketplaceModelEndpointCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateMarketplaceModelEndpointCommandOutput) => void): void;
    /**
     * @see {@link CreateModelCopyJobCommand}
     */
    createModelCopyJob(args: CreateModelCopyJobCommandInput, options?: __HttpHandlerOptions): Promise<CreateModelCopyJobCommandOutput>;
    createModelCopyJob(args: CreateModelCopyJobCommandInput, cb: (err: any, data?: CreateModelCopyJobCommandOutput) => void): void;
    createModelCopyJob(args: CreateModelCopyJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateModelCopyJobCommandOutput) => void): void;
    /**
     * @see {@link CreateModelCustomizationJobCommand}
     */
    createModelCustomizationJob(args: CreateModelCustomizationJobCommandInput, options?: __HttpHandlerOptions): Promise<CreateModelCustomizationJobCommandOutput>;
    createModelCustomizationJob(args: CreateModelCustomizationJobCommandInput, cb: (err: any, data?: CreateModelCustomizationJobCommandOutput) => void): void;
    createModelCustomizationJob(args: CreateModelCustomizationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateModelCustomizationJobCommandOutput) => void): void;
    /**
     * @see {@link CreateModelImportJobCommand}
     */
    createModelImportJob(args: CreateModelImportJobCommandInput, options?: __HttpHandlerOptions): Promise<CreateModelImportJobCommandOutput>;
    createModelImportJob(args: CreateModelImportJobCommandInput, cb: (err: any, data?: CreateModelImportJobCommandOutput) => void): void;
    createModelImportJob(args: CreateModelImportJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateModelImportJobCommandOutput) => void): void;
    /**
     * @see {@link CreateModelInvocationJobCommand}
     */
    createModelInvocationJob(args: CreateModelInvocationJobCommandInput, options?: __HttpHandlerOptions): Promise<CreateModelInvocationJobCommandOutput>;
    createModelInvocationJob(args: CreateModelInvocationJobCommandInput, cb: (err: any, data?: CreateModelInvocationJobCommandOutput) => void): void;
    createModelInvocationJob(args: CreateModelInvocationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateModelInvocationJobCommandOutput) => void): void;
    /**
     * @see {@link CreatePromptRouterCommand}
     */
    createPromptRouter(args: CreatePromptRouterCommandInput, options?: __HttpHandlerOptions): Promise<CreatePromptRouterCommandOutput>;
    createPromptRouter(args: CreatePromptRouterCommandInput, cb: (err: any, data?: CreatePromptRouterCommandOutput) => void): void;
    createPromptRouter(args: CreatePromptRouterCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreatePromptRouterCommandOutput) => void): void;
    /**
     * @see {@link CreateProvisionedModelThroughputCommand}
     */
    createProvisionedModelThroughput(args: CreateProvisionedModelThroughputCommandInput, options?: __HttpHandlerOptions): Promise<CreateProvisionedModelThroughputCommandOutput>;
    createProvisionedModelThroughput(args: CreateProvisionedModelThroughputCommandInput, cb: (err: any, data?: CreateProvisionedModelThroughputCommandOutput) => void): void;
    createProvisionedModelThroughput(args: CreateProvisionedModelThroughputCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: CreateProvisionedModelThroughputCommandOutput) => void): void;
    /**
     * @see {@link DeleteAutomatedReasoningPolicyCommand}
     */
    deleteAutomatedReasoningPolicy(args: DeleteAutomatedReasoningPolicyCommandInput, options?: __HttpHandlerOptions): Promise<DeleteAutomatedReasoningPolicyCommandOutput>;
    deleteAutomatedReasoningPolicy(args: DeleteAutomatedReasoningPolicyCommandInput, cb: (err: any, data?: DeleteAutomatedReasoningPolicyCommandOutput) => void): void;
    deleteAutomatedReasoningPolicy(args: DeleteAutomatedReasoningPolicyCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteAutomatedReasoningPolicyCommandOutput) => void): void;
    /**
     * @see {@link DeleteAutomatedReasoningPolicyBuildWorkflowCommand}
     */
    deleteAutomatedReasoningPolicyBuildWorkflow(args: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput, options?: __HttpHandlerOptions): Promise<DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput>;
    deleteAutomatedReasoningPolicyBuildWorkflow(args: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput, cb: (err: any, data?: DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput) => void): void;
    deleteAutomatedReasoningPolicyBuildWorkflow(args: DeleteAutomatedReasoningPolicyBuildWorkflowCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteAutomatedReasoningPolicyBuildWorkflowCommandOutput) => void): void;
    /**
     * @see {@link DeleteAutomatedReasoningPolicyTestCaseCommand}
     */
    deleteAutomatedReasoningPolicyTestCase(args: DeleteAutomatedReasoningPolicyTestCaseCommandInput, options?: __HttpHandlerOptions): Promise<DeleteAutomatedReasoningPolicyTestCaseCommandOutput>;
    deleteAutomatedReasoningPolicyTestCase(args: DeleteAutomatedReasoningPolicyTestCaseCommandInput, cb: (err: any, data?: DeleteAutomatedReasoningPolicyTestCaseCommandOutput) => void): void;
    deleteAutomatedReasoningPolicyTestCase(args: DeleteAutomatedReasoningPolicyTestCaseCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteAutomatedReasoningPolicyTestCaseCommandOutput) => void): void;
    /**
     * @see {@link DeleteCustomModelCommand}
     */
    deleteCustomModel(args: DeleteCustomModelCommandInput, options?: __HttpHandlerOptions): Promise<DeleteCustomModelCommandOutput>;
    deleteCustomModel(args: DeleteCustomModelCommandInput, cb: (err: any, data?: DeleteCustomModelCommandOutput) => void): void;
    deleteCustomModel(args: DeleteCustomModelCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteCustomModelCommandOutput) => void): void;
    /**
     * @see {@link DeleteCustomModelDeploymentCommand}
     */
    deleteCustomModelDeployment(args: DeleteCustomModelDeploymentCommandInput, options?: __HttpHandlerOptions): Promise<DeleteCustomModelDeploymentCommandOutput>;
    deleteCustomModelDeployment(args: DeleteCustomModelDeploymentCommandInput, cb: (err: any, data?: DeleteCustomModelDeploymentCommandOutput) => void): void;
    deleteCustomModelDeployment(args: DeleteCustomModelDeploymentCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteCustomModelDeploymentCommandOutput) => void): void;
    /**
     * @see {@link DeleteEnforcedGuardrailConfigurationCommand}
     */
    deleteEnforcedGuardrailConfiguration(args: DeleteEnforcedGuardrailConfigurationCommandInput, options?: __HttpHandlerOptions): Promise<DeleteEnforcedGuardrailConfigurationCommandOutput>;
    deleteEnforcedGuardrailConfiguration(args: DeleteEnforcedGuardrailConfigurationCommandInput, cb: (err: any, data?: DeleteEnforcedGuardrailConfigurationCommandOutput) => void): void;
    deleteEnforcedGuardrailConfiguration(args: DeleteEnforcedGuardrailConfigurationCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteEnforcedGuardrailConfigurationCommandOutput) => void): void;
    /**
     * @see {@link DeleteFoundationModelAgreementCommand}
     */
    deleteFoundationModelAgreement(args: DeleteFoundationModelAgreementCommandInput, options?: __HttpHandlerOptions): Promise<DeleteFoundationModelAgreementCommandOutput>;
    deleteFoundationModelAgreement(args: DeleteFoundationModelAgreementCommandInput, cb: (err: any, data?: DeleteFoundationModelAgreementCommandOutput) => void): void;
    deleteFoundationModelAgreement(args: DeleteFoundationModelAgreementCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteFoundationModelAgreementCommandOutput) => void): void;
    /**
     * @see {@link DeleteGuardrailCommand}
     */
    deleteGuardrail(args: DeleteGuardrailCommandInput, options?: __HttpHandlerOptions): Promise<DeleteGuardrailCommandOutput>;
    deleteGuardrail(args: DeleteGuardrailCommandInput, cb: (err: any, data?: DeleteGuardrailCommandOutput) => void): void;
    deleteGuardrail(args: DeleteGuardrailCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteGuardrailCommandOutput) => void): void;
    /**
     * @see {@link DeleteImportedModelCommand}
     */
    deleteImportedModel(args: DeleteImportedModelCommandInput, options?: __HttpHandlerOptions): Promise<DeleteImportedModelCommandOutput>;
    deleteImportedModel(args: DeleteImportedModelCommandInput, cb: (err: any, data?: DeleteImportedModelCommandOutput) => void): void;
    deleteImportedModel(args: DeleteImportedModelCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteImportedModelCommandOutput) => void): void;
    /**
     * @see {@link DeleteInferenceProfileCommand}
     */
    deleteInferenceProfile(args: DeleteInferenceProfileCommandInput, options?: __HttpHandlerOptions): Promise<DeleteInferenceProfileCommandOutput>;
    deleteInferenceProfile(args: DeleteInferenceProfileCommandInput, cb: (err: any, data?: DeleteInferenceProfileCommandOutput) => void): void;
    deleteInferenceProfile(args: DeleteInferenceProfileCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteInferenceProfileCommandOutput) => void): void;
    /**
     * @see {@link DeleteMarketplaceModelEndpointCommand}
     */
    deleteMarketplaceModelEndpoint(args: DeleteMarketplaceModelEndpointCommandInput, options?: __HttpHandlerOptions): Promise<DeleteMarketplaceModelEndpointCommandOutput>;
    deleteMarketplaceModelEndpoint(args: DeleteMarketplaceModelEndpointCommandInput, cb: (err: any, data?: DeleteMarketplaceModelEndpointCommandOutput) => void): void;
    deleteMarketplaceModelEndpoint(args: DeleteMarketplaceModelEndpointCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteMarketplaceModelEndpointCommandOutput) => void): void;
    /**
     * @see {@link DeleteModelInvocationLoggingConfigurationCommand}
     */
    deleteModelInvocationLoggingConfiguration(): Promise<DeleteModelInvocationLoggingConfigurationCommandOutput>;
    deleteModelInvocationLoggingConfiguration(args: DeleteModelInvocationLoggingConfigurationCommandInput, options?: __HttpHandlerOptions): Promise<DeleteModelInvocationLoggingConfigurationCommandOutput>;
    deleteModelInvocationLoggingConfiguration(args: DeleteModelInvocationLoggingConfigurationCommandInput, cb: (err: any, data?: DeleteModelInvocationLoggingConfigurationCommandOutput) => void): void;
    deleteModelInvocationLoggingConfiguration(args: DeleteModelInvocationLoggingConfigurationCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteModelInvocationLoggingConfigurationCommandOutput) => void): void;
    /**
     * @see {@link DeletePromptRouterCommand}
     */
    deletePromptRouter(args: DeletePromptRouterCommandInput, options?: __HttpHandlerOptions): Promise<DeletePromptRouterCommandOutput>;
    deletePromptRouter(args: DeletePromptRouterCommandInput, cb: (err: any, data?: DeletePromptRouterCommandOutput) => void): void;
    deletePromptRouter(args: DeletePromptRouterCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeletePromptRouterCommandOutput) => void): void;
    /**
     * @see {@link DeleteProvisionedModelThroughputCommand}
     */
    deleteProvisionedModelThroughput(args: DeleteProvisionedModelThroughputCommandInput, options?: __HttpHandlerOptions): Promise<DeleteProvisionedModelThroughputCommandOutput>;
    deleteProvisionedModelThroughput(args: DeleteProvisionedModelThroughputCommandInput, cb: (err: any, data?: DeleteProvisionedModelThroughputCommandOutput) => void): void;
    deleteProvisionedModelThroughput(args: DeleteProvisionedModelThroughputCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteProvisionedModelThroughputCommandOutput) => void): void;
    /**
     * @see {@link DeleteResourcePolicyCommand}
     */
    deleteResourcePolicy(args: DeleteResourcePolicyCommandInput, options?: __HttpHandlerOptions): Promise<DeleteResourcePolicyCommandOutput>;
    deleteResourcePolicy(args: DeleteResourcePolicyCommandInput, cb: (err: any, data?: DeleteResourcePolicyCommandOutput) => void): void;
    deleteResourcePolicy(args: DeleteResourcePolicyCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeleteResourcePolicyCommandOutput) => void): void;
    /**
     * @see {@link DeregisterMarketplaceModelEndpointCommand}
     */
    deregisterMarketplaceModelEndpoint(args: DeregisterMarketplaceModelEndpointCommandInput, options?: __HttpHandlerOptions): Promise<DeregisterMarketplaceModelEndpointCommandOutput>;
    deregisterMarketplaceModelEndpoint(args: DeregisterMarketplaceModelEndpointCommandInput, cb: (err: any, data?: DeregisterMarketplaceModelEndpointCommandOutput) => void): void;
    deregisterMarketplaceModelEndpoint(args: DeregisterMarketplaceModelEndpointCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DeregisterMarketplaceModelEndpointCommandOutput) => void): void;
    /**
     * @see {@link ExportAutomatedReasoningPolicyVersionCommand}
     */
    exportAutomatedReasoningPolicyVersion(args: ExportAutomatedReasoningPolicyVersionCommandInput, options?: __HttpHandlerOptions): Promise<ExportAutomatedReasoningPolicyVersionCommandOutput>;
    exportAutomatedReasoningPolicyVersion(args: ExportAutomatedReasoningPolicyVersionCommandInput, cb: (err: any, data?: ExportAutomatedReasoningPolicyVersionCommandOutput) => void): void;
    exportAutomatedReasoningPolicyVersion(args: ExportAutomatedReasoningPolicyVersionCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ExportAutomatedReasoningPolicyVersionCommandOutput) => void): void;
    /**
     * @see {@link GetAutomatedReasoningPolicyCommand}
     */
    getAutomatedReasoningPolicy(args: GetAutomatedReasoningPolicyCommandInput, options?: __HttpHandlerOptions): Promise<GetAutomatedReasoningPolicyCommandOutput>;
    getAutomatedReasoningPolicy(args: GetAutomatedReasoningPolicyCommandInput, cb: (err: any, data?: GetAutomatedReasoningPolicyCommandOutput) => void): void;
    getAutomatedReasoningPolicy(args: GetAutomatedReasoningPolicyCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetAutomatedReasoningPolicyCommandOutput) => void): void;
    /**
     * @see {@link GetAutomatedReasoningPolicyAnnotationsCommand}
     */
    getAutomatedReasoningPolicyAnnotations(args: GetAutomatedReasoningPolicyAnnotationsCommandInput, options?: __HttpHandlerOptions): Promise<GetAutomatedReasoningPolicyAnnotationsCommandOutput>;
    getAutomatedReasoningPolicyAnnotations(args: GetAutomatedReasoningPolicyAnnotationsCommandInput, cb: (err: any, data?: GetAutomatedReasoningPolicyAnnotationsCommandOutput) => void): void;
    getAutomatedReasoningPolicyAnnotations(args: GetAutomatedReasoningPolicyAnnotationsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetAutomatedReasoningPolicyAnnotationsCommandOutput) => void): void;
    /**
     * @see {@link GetAutomatedReasoningPolicyBuildWorkflowCommand}
     */
    getAutomatedReasoningPolicyBuildWorkflow(args: GetAutomatedReasoningPolicyBuildWorkflowCommandInput, options?: __HttpHandlerOptions): Promise<GetAutomatedReasoningPolicyBuildWorkflowCommandOutput>;
    getAutomatedReasoningPolicyBuildWorkflow(args: GetAutomatedReasoningPolicyBuildWorkflowCommandInput, cb: (err: any, data?: GetAutomatedReasoningPolicyBuildWorkflowCommandOutput) => void): void;
    getAutomatedReasoningPolicyBuildWorkflow(args: GetAutomatedReasoningPolicyBuildWorkflowCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetAutomatedReasoningPolicyBuildWorkflowCommandOutput) => void): void;
    /**
     * @see {@link GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand}
     */
    getAutomatedReasoningPolicyBuildWorkflowResultAssets(args: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput, options?: __HttpHandlerOptions): Promise<GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput>;
    getAutomatedReasoningPolicyBuildWorkflowResultAssets(args: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput, cb: (err: any, data?: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput) => void): void;
    getAutomatedReasoningPolicyBuildWorkflowResultAssets(args: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommandOutput) => void): void;
    /**
     * @see {@link GetAutomatedReasoningPolicyNextScenarioCommand}
     */
    getAutomatedReasoningPolicyNextScenario(args: GetAutomatedReasoningPolicyNextScenarioCommandInput, options?: __HttpHandlerOptions): Promise<GetAutomatedReasoningPolicyNextScenarioCommandOutput>;
    getAutomatedReasoningPolicyNextScenario(args: GetAutomatedReasoningPolicyNextScenarioCommandInput, cb: (err: any, data?: GetAutomatedReasoningPolicyNextScenarioCommandOutput) => void): void;
    getAutomatedReasoningPolicyNextScenario(args: GetAutomatedReasoningPolicyNextScenarioCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetAutomatedReasoningPolicyNextScenarioCommandOutput) => void): void;
    /**
     * @see {@link GetAutomatedReasoningPolicyTestCaseCommand}
     */
    getAutomatedReasoningPolicyTestCase(args: GetAutomatedReasoningPolicyTestCaseCommandInput, options?: __HttpHandlerOptions): Promise<GetAutomatedReasoningPolicyTestCaseCommandOutput>;
    getAutomatedReasoningPolicyTestCase(args: GetAutomatedReasoningPolicyTestCaseCommandInput, cb: (err: any, data?: GetAutomatedReasoningPolicyTestCaseCommandOutput) => void): void;
    getAutomatedReasoningPolicyTestCase(args: GetAutomatedReasoningPolicyTestCaseCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetAutomatedReasoningPolicyTestCaseCommandOutput) => void): void;
    /**
     * @see {@link GetAutomatedReasoningPolicyTestResultCommand}
     */
    getAutomatedReasoningPolicyTestResult(args: GetAutomatedReasoningPolicyTestResultCommandInput, options?: __HttpHandlerOptions): Promise<GetAutomatedReasoningPolicyTestResultCommandOutput>;
    getAutomatedReasoningPolicyTestResult(args: GetAutomatedReasoningPolicyTestResultCommandInput, cb: (err: any, data?: GetAutomatedReasoningPolicyTestResultCommandOutput) => void): void;
    getAutomatedReasoningPolicyTestResult(args: GetAutomatedReasoningPolicyTestResultCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetAutomatedReasoningPolicyTestResultCommandOutput) => void): void;
    /**
     * @see {@link GetCustomModelCommand}
     */
    getCustomModel(args: GetCustomModelCommandInput, options?: __HttpHandlerOptions): Promise<GetCustomModelCommandOutput>;
    getCustomModel(args: GetCustomModelCommandInput, cb: (err: any, data?: GetCustomModelCommandOutput) => void): void;
    getCustomModel(args: GetCustomModelCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetCustomModelCommandOutput) => void): void;
    /**
     * @see {@link GetCustomModelDeploymentCommand}
     */
    getCustomModelDeployment(args: GetCustomModelDeploymentCommandInput, options?: __HttpHandlerOptions): Promise<GetCustomModelDeploymentCommandOutput>;
    getCustomModelDeployment(args: GetCustomModelDeploymentCommandInput, cb: (err: any, data?: GetCustomModelDeploymentCommandOutput) => void): void;
    getCustomModelDeployment(args: GetCustomModelDeploymentCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetCustomModelDeploymentCommandOutput) => void): void;
    /**
     * @see {@link GetEvaluationJobCommand}
     */
    getEvaluationJob(args: GetEvaluationJobCommandInput, options?: __HttpHandlerOptions): Promise<GetEvaluationJobCommandOutput>;
    getEvaluationJob(args: GetEvaluationJobCommandInput, cb: (err: any, data?: GetEvaluationJobCommandOutput) => void): void;
    getEvaluationJob(args: GetEvaluationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetEvaluationJobCommandOutput) => void): void;
    /**
     * @see {@link GetFoundationModelCommand}
     */
    getFoundationModel(args: GetFoundationModelCommandInput, options?: __HttpHandlerOptions): Promise<GetFoundationModelCommandOutput>;
    getFoundationModel(args: GetFoundationModelCommandInput, cb: (err: any, data?: GetFoundationModelCommandOutput) => void): void;
    getFoundationModel(args: GetFoundationModelCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetFoundationModelCommandOutput) => void): void;
    /**
     * @see {@link GetFoundationModelAvailabilityCommand}
     */
    getFoundationModelAvailability(args: GetFoundationModelAvailabilityCommandInput, options?: __HttpHandlerOptions): Promise<GetFoundationModelAvailabilityCommandOutput>;
    getFoundationModelAvailability(args: GetFoundationModelAvailabilityCommandInput, cb: (err: any, data?: GetFoundationModelAvailabilityCommandOutput) => void): void;
    getFoundationModelAvailability(args: GetFoundationModelAvailabilityCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetFoundationModelAvailabilityCommandOutput) => void): void;
    /**
     * @see {@link GetGuardrailCommand}
     */
    getGuardrail(args: GetGuardrailCommandInput, options?: __HttpHandlerOptions): Promise<GetGuardrailCommandOutput>;
    getGuardrail(args: GetGuardrailCommandInput, cb: (err: any, data?: GetGuardrailCommandOutput) => void): void;
    getGuardrail(args: GetGuardrailCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetGuardrailCommandOutput) => void): void;
    /**
     * @see {@link GetImportedModelCommand}
     */
    getImportedModel(args: GetImportedModelCommandInput, options?: __HttpHandlerOptions): Promise<GetImportedModelCommandOutput>;
    getImportedModel(args: GetImportedModelCommandInput, cb: (err: any, data?: GetImportedModelCommandOutput) => void): void;
    getImportedModel(args: GetImportedModelCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetImportedModelCommandOutput) => void): void;
    /**
     * @see {@link GetInferenceProfileCommand}
     */
    getInferenceProfile(args: GetInferenceProfileCommandInput, options?: __HttpHandlerOptions): Promise<GetInferenceProfileCommandOutput>;
    getInferenceProfile(args: GetInferenceProfileCommandInput, cb: (err: any, data?: GetInferenceProfileCommandOutput) => void): void;
    getInferenceProfile(args: GetInferenceProfileCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetInferenceProfileCommandOutput) => void): void;
    /**
     * @see {@link GetMarketplaceModelEndpointCommand}
     */
    getMarketplaceModelEndpoint(args: GetMarketplaceModelEndpointCommandInput, options?: __HttpHandlerOptions): Promise<GetMarketplaceModelEndpointCommandOutput>;
    getMarketplaceModelEndpoint(args: GetMarketplaceModelEndpointCommandInput, cb: (err: any, data?: GetMarketplaceModelEndpointCommandOutput) => void): void;
    getMarketplaceModelEndpoint(args: GetMarketplaceModelEndpointCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetMarketplaceModelEndpointCommandOutput) => void): void;
    /**
     * @see {@link GetModelCopyJobCommand}
     */
    getModelCopyJob(args: GetModelCopyJobCommandInput, options?: __HttpHandlerOptions): Promise<GetModelCopyJobCommandOutput>;
    getModelCopyJob(args: GetModelCopyJobCommandInput, cb: (err: any, data?: GetModelCopyJobCommandOutput) => void): void;
    getModelCopyJob(args: GetModelCopyJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetModelCopyJobCommandOutput) => void): void;
    /**
     * @see {@link GetModelCustomizationJobCommand}
     */
    getModelCustomizationJob(args: GetModelCustomizationJobCommandInput, options?: __HttpHandlerOptions): Promise<GetModelCustomizationJobCommandOutput>;
    getModelCustomizationJob(args: GetModelCustomizationJobCommandInput, cb: (err: any, data?: GetModelCustomizationJobCommandOutput) => void): void;
    getModelCustomizationJob(args: GetModelCustomizationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetModelCustomizationJobCommandOutput) => void): void;
    /**
     * @see {@link GetModelImportJobCommand}
     */
    getModelImportJob(args: GetModelImportJobCommandInput, options?: __HttpHandlerOptions): Promise<GetModelImportJobCommandOutput>;
    getModelImportJob(args: GetModelImportJobCommandInput, cb: (err: any, data?: GetModelImportJobCommandOutput) => void): void;
    getModelImportJob(args: GetModelImportJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetModelImportJobCommandOutput) => void): void;
    /**
     * @see {@link GetModelInvocationJobCommand}
     */
    getModelInvocationJob(args: GetModelInvocationJobCommandInput, options?: __HttpHandlerOptions): Promise<GetModelInvocationJobCommandOutput>;
    getModelInvocationJob(args: GetModelInvocationJobCommandInput, cb: (err: any, data?: GetModelInvocationJobCommandOutput) => void): void;
    getModelInvocationJob(args: GetModelInvocationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetModelInvocationJobCommandOutput) => void): void;
    /**
     * @see {@link GetModelInvocationLoggingConfigurationCommand}
     */
    getModelInvocationLoggingConfiguration(): Promise<GetModelInvocationLoggingConfigurationCommandOutput>;
    getModelInvocationLoggingConfiguration(args: GetModelInvocationLoggingConfigurationCommandInput, options?: __HttpHandlerOptions): Promise<GetModelInvocationLoggingConfigurationCommandOutput>;
    getModelInvocationLoggingConfiguration(args: GetModelInvocationLoggingConfigurationCommandInput, cb: (err: any, data?: GetModelInvocationLoggingConfigurationCommandOutput) => void): void;
    getModelInvocationLoggingConfiguration(args: GetModelInvocationLoggingConfigurationCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetModelInvocationLoggingConfigurationCommandOutput) => void): void;
    /**
     * @see {@link GetPromptRouterCommand}
     */
    getPromptRouter(args: GetPromptRouterCommandInput, options?: __HttpHandlerOptions): Promise<GetPromptRouterCommandOutput>;
    getPromptRouter(args: GetPromptRouterCommandInput, cb: (err: any, data?: GetPromptRouterCommandOutput) => void): void;
    getPromptRouter(args: GetPromptRouterCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetPromptRouterCommandOutput) => void): void;
    /**
     * @see {@link GetProvisionedModelThroughputCommand}
     */
    getProvisionedModelThroughput(args: GetProvisionedModelThroughputCommandInput, options?: __HttpHandlerOptions): Promise<GetProvisionedModelThroughputCommandOutput>;
    getProvisionedModelThroughput(args: GetProvisionedModelThroughputCommandInput, cb: (err: any, data?: GetProvisionedModelThroughputCommandOutput) => void): void;
    getProvisionedModelThroughput(args: GetProvisionedModelThroughputCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetProvisionedModelThroughputCommandOutput) => void): void;
    /**
     * @see {@link GetResourcePolicyCommand}
     */
    getResourcePolicy(args: GetResourcePolicyCommandInput, options?: __HttpHandlerOptions): Promise<GetResourcePolicyCommandOutput>;
    getResourcePolicy(args: GetResourcePolicyCommandInput, cb: (err: any, data?: GetResourcePolicyCommandOutput) => void): void;
    getResourcePolicy(args: GetResourcePolicyCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetResourcePolicyCommandOutput) => void): void;
    /**
     * @see {@link GetUseCaseForModelAccessCommand}
     */
    getUseCaseForModelAccess(): Promise<GetUseCaseForModelAccessCommandOutput>;
    getUseCaseForModelAccess(args: GetUseCaseForModelAccessCommandInput, options?: __HttpHandlerOptions): Promise<GetUseCaseForModelAccessCommandOutput>;
    getUseCaseForModelAccess(args: GetUseCaseForModelAccessCommandInput, cb: (err: any, data?: GetUseCaseForModelAccessCommandOutput) => void): void;
    getUseCaseForModelAccess(args: GetUseCaseForModelAccessCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetUseCaseForModelAccessCommandOutput) => void): void;
    /**
     * @see {@link ListAutomatedReasoningPoliciesCommand}
     */
    listAutomatedReasoningPolicies(): Promise<ListAutomatedReasoningPoliciesCommandOutput>;
    listAutomatedReasoningPolicies(args: ListAutomatedReasoningPoliciesCommandInput, options?: __HttpHandlerOptions): Promise<ListAutomatedReasoningPoliciesCommandOutput>;
    listAutomatedReasoningPolicies(args: ListAutomatedReasoningPoliciesCommandInput, cb: (err: any, data?: ListAutomatedReasoningPoliciesCommandOutput) => void): void;
    listAutomatedReasoningPolicies(args: ListAutomatedReasoningPoliciesCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListAutomatedReasoningPoliciesCommandOutput) => void): void;
    /**
     * @see {@link ListAutomatedReasoningPolicyBuildWorkflowsCommand}
     */
    listAutomatedReasoningPolicyBuildWorkflows(args: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput, options?: __HttpHandlerOptions): Promise<ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput>;
    listAutomatedReasoningPolicyBuildWorkflows(args: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput, cb: (err: any, data?: ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput) => void): void;
    listAutomatedReasoningPolicyBuildWorkflows(args: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput) => void): void;
    /**
     * @see {@link ListAutomatedReasoningPolicyTestCasesCommand}
     */
    listAutomatedReasoningPolicyTestCases(args: ListAutomatedReasoningPolicyTestCasesCommandInput, options?: __HttpHandlerOptions): Promise<ListAutomatedReasoningPolicyTestCasesCommandOutput>;
    listAutomatedReasoningPolicyTestCases(args: ListAutomatedReasoningPolicyTestCasesCommandInput, cb: (err: any, data?: ListAutomatedReasoningPolicyTestCasesCommandOutput) => void): void;
    listAutomatedReasoningPolicyTestCases(args: ListAutomatedReasoningPolicyTestCasesCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListAutomatedReasoningPolicyTestCasesCommandOutput) => void): void;
    /**
     * @see {@link ListAutomatedReasoningPolicyTestResultsCommand}
     */
    listAutomatedReasoningPolicyTestResults(args: ListAutomatedReasoningPolicyTestResultsCommandInput, options?: __HttpHandlerOptions): Promise<ListAutomatedReasoningPolicyTestResultsCommandOutput>;
    listAutomatedReasoningPolicyTestResults(args: ListAutomatedReasoningPolicyTestResultsCommandInput, cb: (err: any, data?: ListAutomatedReasoningPolicyTestResultsCommandOutput) => void): void;
    listAutomatedReasoningPolicyTestResults(args: ListAutomatedReasoningPolicyTestResultsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListAutomatedReasoningPolicyTestResultsCommandOutput) => void): void;
    /**
     * @see {@link ListCustomModelDeploymentsCommand}
     */
    listCustomModelDeployments(): Promise<ListCustomModelDeploymentsCommandOutput>;
    listCustomModelDeployments(args: ListCustomModelDeploymentsCommandInput, options?: __HttpHandlerOptions): Promise<ListCustomModelDeploymentsCommandOutput>;
    listCustomModelDeployments(args: ListCustomModelDeploymentsCommandInput, cb: (err: any, data?: ListCustomModelDeploymentsCommandOutput) => void): void;
    listCustomModelDeployments(args: ListCustomModelDeploymentsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListCustomModelDeploymentsCommandOutput) => void): void;
    /**
     * @see {@link ListCustomModelsCommand}
     */
    listCustomModels(): Promise<ListCustomModelsCommandOutput>;
    listCustomModels(args: ListCustomModelsCommandInput, options?: __HttpHandlerOptions): Promise<ListCustomModelsCommandOutput>;
    listCustomModels(args: ListCustomModelsCommandInput, cb: (err: any, data?: ListCustomModelsCommandOutput) => void): void;
    listCustomModels(args: ListCustomModelsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListCustomModelsCommandOutput) => void): void;
    /**
     * @see {@link ListEnforcedGuardrailsConfigurationCommand}
     */
    listEnforcedGuardrailsConfiguration(): Promise<ListEnforcedGuardrailsConfigurationCommandOutput>;
    listEnforcedGuardrailsConfiguration(args: ListEnforcedGuardrailsConfigurationCommandInput, options?: __HttpHandlerOptions): Promise<ListEnforcedGuardrailsConfigurationCommandOutput>;
    listEnforcedGuardrailsConfiguration(args: ListEnforcedGuardrailsConfigurationCommandInput, cb: (err: any, data?: ListEnforcedGuardrailsConfigurationCommandOutput) => void): void;
    listEnforcedGuardrailsConfiguration(args: ListEnforcedGuardrailsConfigurationCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListEnforcedGuardrailsConfigurationCommandOutput) => void): void;
    /**
     * @see {@link ListEvaluationJobsCommand}
     */
    listEvaluationJobs(): Promise<ListEvaluationJobsCommandOutput>;
    listEvaluationJobs(args: ListEvaluationJobsCommandInput, options?: __HttpHandlerOptions): Promise<ListEvaluationJobsCommandOutput>;
    listEvaluationJobs(args: ListEvaluationJobsCommandInput, cb: (err: any, data?: ListEvaluationJobsCommandOutput) => void): void;
    listEvaluationJobs(args: ListEvaluationJobsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListEvaluationJobsCommandOutput) => void): void;
    /**
     * @see {@link ListFoundationModelAgreementOffersCommand}
     */
    listFoundationModelAgreementOffers(args: ListFoundationModelAgreementOffersCommandInput, options?: __HttpHandlerOptions): Promise<ListFoundationModelAgreementOffersCommandOutput>;
    listFoundationModelAgreementOffers(args: ListFoundationModelAgreementOffersCommandInput, cb: (err: any, data?: ListFoundationModelAgreementOffersCommandOutput) => void): void;
    listFoundationModelAgreementOffers(args: ListFoundationModelAgreementOffersCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListFoundationModelAgreementOffersCommandOutput) => void): void;
    /**
     * @see {@link ListFoundationModelsCommand}
     */
    listFoundationModels(): Promise<ListFoundationModelsCommandOutput>;
    listFoundationModels(args: ListFoundationModelsCommandInput, options?: __HttpHandlerOptions): Promise<ListFoundationModelsCommandOutput>;
    listFoundationModels(args: ListFoundationModelsCommandInput, cb: (err: any, data?: ListFoundationModelsCommandOutput) => void): void;
    listFoundationModels(args: ListFoundationModelsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListFoundationModelsCommandOutput) => void): void;
    /**
     * @see {@link ListGuardrailsCommand}
     */
    listGuardrails(): Promise<ListGuardrailsCommandOutput>;
    listGuardrails(args: ListGuardrailsCommandInput, options?: __HttpHandlerOptions): Promise<ListGuardrailsCommandOutput>;
    listGuardrails(args: ListGuardrailsCommandInput, cb: (err: any, data?: ListGuardrailsCommandOutput) => void): void;
    listGuardrails(args: ListGuardrailsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListGuardrailsCommandOutput) => void): void;
    /**
     * @see {@link ListImportedModelsCommand}
     */
    listImportedModels(): Promise<ListImportedModelsCommandOutput>;
    listImportedModels(args: ListImportedModelsCommandInput, options?: __HttpHandlerOptions): Promise<ListImportedModelsCommandOutput>;
    listImportedModels(args: ListImportedModelsCommandInput, cb: (err: any, data?: ListImportedModelsCommandOutput) => void): void;
    listImportedModels(args: ListImportedModelsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListImportedModelsCommandOutput) => void): void;
    /**
     * @see {@link ListInferenceProfilesCommand}
     */
    listInferenceProfiles(): Promise<ListInferenceProfilesCommandOutput>;
    listInferenceProfiles(args: ListInferenceProfilesCommandInput, options?: __HttpHandlerOptions): Promise<ListInferenceProfilesCommandOutput>;
    listInferenceProfiles(args: ListInferenceProfilesCommandInput, cb: (err: any, data?: ListInferenceProfilesCommandOutput) => void): void;
    listInferenceProfiles(args: ListInferenceProfilesCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListInferenceProfilesCommandOutput) => void): void;
    /**
     * @see {@link ListMarketplaceModelEndpointsCommand}
     */
    listMarketplaceModelEndpoints(): Promise<ListMarketplaceModelEndpointsCommandOutput>;
    listMarketplaceModelEndpoints(args: ListMarketplaceModelEndpointsCommandInput, options?: __HttpHandlerOptions): Promise<ListMarketplaceModelEndpointsCommandOutput>;
    listMarketplaceModelEndpoints(args: ListMarketplaceModelEndpointsCommandInput, cb: (err: any, data?: ListMarketplaceModelEndpointsCommandOutput) => void): void;
    listMarketplaceModelEndpoints(args: ListMarketplaceModelEndpointsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListMarketplaceModelEndpointsCommandOutput) => void): void;
    /**
     * @see {@link ListModelCopyJobsCommand}
     */
    listModelCopyJobs(): Promise<ListModelCopyJobsCommandOutput>;
    listModelCopyJobs(args: ListModelCopyJobsCommandInput, options?: __HttpHandlerOptions): Promise<ListModelCopyJobsCommandOutput>;
    listModelCopyJobs(args: ListModelCopyJobsCommandInput, cb: (err: any, data?: ListModelCopyJobsCommandOutput) => void): void;
    listModelCopyJobs(args: ListModelCopyJobsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListModelCopyJobsCommandOutput) => void): void;
    /**
     * @see {@link ListModelCustomizationJobsCommand}
     */
    listModelCustomizationJobs(): Promise<ListModelCustomizationJobsCommandOutput>;
    listModelCustomizationJobs(args: ListModelCustomizationJobsCommandInput, options?: __HttpHandlerOptions): Promise<ListModelCustomizationJobsCommandOutput>;
    listModelCustomizationJobs(args: ListModelCustomizationJobsCommandInput, cb: (err: any, data?: ListModelCustomizationJobsCommandOutput) => void): void;
    listModelCustomizationJobs(args: ListModelCustomizationJobsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListModelCustomizationJobsCommandOutput) => void): void;
    /**
     * @see {@link ListModelImportJobsCommand}
     */
    listModelImportJobs(): Promise<ListModelImportJobsCommandOutput>;
    listModelImportJobs(args: ListModelImportJobsCommandInput, options?: __HttpHandlerOptions): Promise<ListModelImportJobsCommandOutput>;
    listModelImportJobs(args: ListModelImportJobsCommandInput, cb: (err: any, data?: ListModelImportJobsCommandOutput) => void): void;
    listModelImportJobs(args: ListModelImportJobsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListModelImportJobsCommandOutput) => void): void;
    /**
     * @see {@link ListModelInvocationJobsCommand}
     */
    listModelInvocationJobs(): Promise<ListModelInvocationJobsCommandOutput>;
    listModelInvocationJobs(args: ListModelInvocationJobsCommandInput, options?: __HttpHandlerOptions): Promise<ListModelInvocationJobsCommandOutput>;
    listModelInvocationJobs(args: ListModelInvocationJobsCommandInput, cb: (err: any, data?: ListModelInvocationJobsCommandOutput) => void): void;
    listModelInvocationJobs(args: ListModelInvocationJobsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListModelInvocationJobsCommandOutput) => void): void;
    /**
     * @see {@link ListPromptRoutersCommand}
     */
    listPromptRouters(): Promise<ListPromptRoutersCommandOutput>;
    listPromptRouters(args: ListPromptRoutersCommandInput, options?: __HttpHandlerOptions): Promise<ListPromptRoutersCommandOutput>;
    listPromptRouters(args: ListPromptRoutersCommandInput, cb: (err: any, data?: ListPromptRoutersCommandOutput) => void): void;
    listPromptRouters(args: ListPromptRoutersCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListPromptRoutersCommandOutput) => void): void;
    /**
     * @see {@link ListProvisionedModelThroughputsCommand}
     */
    listProvisionedModelThroughputs(): Promise<ListProvisionedModelThroughputsCommandOutput>;
    listProvisionedModelThroughputs(args: ListProvisionedModelThroughputsCommandInput, options?: __HttpHandlerOptions): Promise<ListProvisionedModelThroughputsCommandOutput>;
    listProvisionedModelThroughputs(args: ListProvisionedModelThroughputsCommandInput, cb: (err: any, data?: ListProvisionedModelThroughputsCommandOutput) => void): void;
    listProvisionedModelThroughputs(args: ListProvisionedModelThroughputsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListProvisionedModelThroughputsCommandOutput) => void): void;
    /**
     * @see {@link ListTagsForResourceCommand}
     */
    listTagsForResource(args: ListTagsForResourceCommandInput, options?: __HttpHandlerOptions): Promise<ListTagsForResourceCommandOutput>;
    listTagsForResource(args: ListTagsForResourceCommandInput, cb: (err: any, data?: ListTagsForResourceCommandOutput) => void): void;
    listTagsForResource(args: ListTagsForResourceCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: ListTagsForResourceCommandOutput) => void): void;
    /**
     * @see {@link PutEnforcedGuardrailConfigurationCommand}
     */
    putEnforcedGuardrailConfiguration(args: PutEnforcedGuardrailConfigurationCommandInput, options?: __HttpHandlerOptions): Promise<PutEnforcedGuardrailConfigurationCommandOutput>;
    putEnforcedGuardrailConfiguration(args: PutEnforcedGuardrailConfigurationCommandInput, cb: (err: any, data?: PutEnforcedGuardrailConfigurationCommandOutput) => void): void;
    putEnforcedGuardrailConfiguration(args: PutEnforcedGuardrailConfigurationCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: PutEnforcedGuardrailConfigurationCommandOutput) => void): void;
    /**
     * @see {@link PutModelInvocationLoggingConfigurationCommand}
     */
    putModelInvocationLoggingConfiguration(args: PutModelInvocationLoggingConfigurationCommandInput, options?: __HttpHandlerOptions): Promise<PutModelInvocationLoggingConfigurationCommandOutput>;
    putModelInvocationLoggingConfiguration(args: PutModelInvocationLoggingConfigurationCommandInput, cb: (err: any, data?: PutModelInvocationLoggingConfigurationCommandOutput) => void): void;
    putModelInvocationLoggingConfiguration(args: PutModelInvocationLoggingConfigurationCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: PutModelInvocationLoggingConfigurationCommandOutput) => void): void;
    /**
     * @see {@link PutResourcePolicyCommand}
     */
    putResourcePolicy(args: PutResourcePolicyCommandInput, options?: __HttpHandlerOptions): Promise<PutResourcePolicyCommandOutput>;
    putResourcePolicy(args: PutResourcePolicyCommandInput, cb: (err: any, data?: PutResourcePolicyCommandOutput) => void): void;
    putResourcePolicy(args: PutResourcePolicyCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: PutResourcePolicyCommandOutput) => void): void;
    /**
     * @see {@link PutUseCaseForModelAccessCommand}
     */
    putUseCaseForModelAccess(args: PutUseCaseForModelAccessCommandInput, options?: __HttpHandlerOptions): Promise<PutUseCaseForModelAccessCommandOutput>;
    putUseCaseForModelAccess(args: PutUseCaseForModelAccessCommandInput, cb: (err: any, data?: PutUseCaseForModelAccessCommandOutput) => void): void;
    putUseCaseForModelAccess(args: PutUseCaseForModelAccessCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: PutUseCaseForModelAccessCommandOutput) => void): void;
    /**
     * @see {@link RegisterMarketplaceModelEndpointCommand}
     */
    registerMarketplaceModelEndpoint(args: RegisterMarketplaceModelEndpointCommandInput, options?: __HttpHandlerOptions): Promise<RegisterMarketplaceModelEndpointCommandOutput>;
    registerMarketplaceModelEndpoint(args: RegisterMarketplaceModelEndpointCommandInput, cb: (err: any, data?: RegisterMarketplaceModelEndpointCommandOutput) => void): void;
    registerMarketplaceModelEndpoint(args: RegisterMarketplaceModelEndpointCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: RegisterMarketplaceModelEndpointCommandOutput) => void): void;
    /**
     * @see {@link StartAutomatedReasoningPolicyBuildWorkflowCommand}
     */
    startAutomatedReasoningPolicyBuildWorkflow(args: StartAutomatedReasoningPolicyBuildWorkflowCommandInput, options?: __HttpHandlerOptions): Promise<StartAutomatedReasoningPolicyBuildWorkflowCommandOutput>;
    startAutomatedReasoningPolicyBuildWorkflow(args: StartAutomatedReasoningPolicyBuildWorkflowCommandInput, cb: (err: any, data?: StartAutomatedReasoningPolicyBuildWorkflowCommandOutput) => void): void;
    startAutomatedReasoningPolicyBuildWorkflow(args: StartAutomatedReasoningPolicyBuildWorkflowCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: StartAutomatedReasoningPolicyBuildWorkflowCommandOutput) => void): void;
    /**
     * @see {@link StartAutomatedReasoningPolicyTestWorkflowCommand}
     */
    startAutomatedReasoningPolicyTestWorkflow(args: StartAutomatedReasoningPolicyTestWorkflowCommandInput, options?: __HttpHandlerOptions): Promise<StartAutomatedReasoningPolicyTestWorkflowCommandOutput>;
    startAutomatedReasoningPolicyTestWorkflow(args: StartAutomatedReasoningPolicyTestWorkflowCommandInput, cb: (err: any, data?: StartAutomatedReasoningPolicyTestWorkflowCommandOutput) => void): void;
    startAutomatedReasoningPolicyTestWorkflow(args: StartAutomatedReasoningPolicyTestWorkflowCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: StartAutomatedReasoningPolicyTestWorkflowCommandOutput) => void): void;
    /**
     * @see {@link StopEvaluationJobCommand}
     */
    stopEvaluationJob(args: StopEvaluationJobCommandInput, options?: __HttpHandlerOptions): Promise<StopEvaluationJobCommandOutput>;
    stopEvaluationJob(args: StopEvaluationJobCommandInput, cb: (err: any, data?: StopEvaluationJobCommandOutput) => void): void;
    stopEvaluationJob(args: StopEvaluationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: StopEvaluationJobCommandOutput) => void): void;
    /**
     * @see {@link StopModelCustomizationJobCommand}
     */
    stopModelCustomizationJob(args: StopModelCustomizationJobCommandInput, options?: __HttpHandlerOptions): Promise<StopModelCustomizationJobCommandOutput>;
    stopModelCustomizationJob(args: StopModelCustomizationJobCommandInput, cb: (err: any, data?: StopModelCustomizationJobCommandOutput) => void): void;
    stopModelCustomizationJob(args: StopModelCustomizationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: StopModelCustomizationJobCommandOutput) => void): void;
    /**
     * @see {@link StopModelInvocationJobCommand}
     */
    stopModelInvocationJob(args: StopModelInvocationJobCommandInput, options?: __HttpHandlerOptions): Promise<StopModelInvocationJobCommandOutput>;
    stopModelInvocationJob(args: StopModelInvocationJobCommandInput, cb: (err: any, data?: StopModelInvocationJobCommandOutput) => void): void;
    stopModelInvocationJob(args: StopModelInvocationJobCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: StopModelInvocationJobCommandOutput) => void): void;
    /**
     * @see {@link TagResourceCommand}
     */
    tagResource(args: TagResourceCommandInput, options?: __HttpHandlerOptions): Promise<TagResourceCommandOutput>;
    tagResource(args: TagResourceCommandInput, cb: (err: any, data?: TagResourceCommandOutput) => void): void;
    tagResource(args: TagResourceCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: TagResourceCommandOutput) => void): void;
    /**
     * @see {@link UntagResourceCommand}
     */
    untagResource(args: UntagResourceCommandInput, options?: __HttpHandlerOptions): Promise<UntagResourceCommandOutput>;
    untagResource(args: UntagResourceCommandInput, cb: (err: any, data?: UntagResourceCommandOutput) => void): void;
    untagResource(args: UntagResourceCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: UntagResourceCommandOutput) => void): void;
    /**
     * @see {@link UpdateAutomatedReasoningPolicyCommand}
     */
    updateAutomatedReasoningPolicy(args: UpdateAutomatedReasoningPolicyCommandInput, options?: __HttpHandlerOptions): Promise<UpdateAutomatedReasoningPolicyCommandOutput>;
    updateAutomatedReasoningPolicy(args: UpdateAutomatedReasoningPolicyCommandInput, cb: (err: any, data?: UpdateAutomatedReasoningPolicyCommandOutput) => void): void;
    updateAutomatedReasoningPolicy(args: UpdateAutomatedReasoningPolicyCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: UpdateAutomatedReasoningPolicyCommandOutput) => void): void;
    /**
     * @see {@link UpdateAutomatedReasoningPolicyAnnotationsCommand}
     */
    updateAutomatedReasoningPolicyAnnotations(args: UpdateAutomatedReasoningPolicyAnnotationsCommandInput, options?: __HttpHandlerOptions): Promise<UpdateAutomatedReasoningPolicyAnnotationsCommandOutput>;
    updateAutomatedReasoningPolicyAnnotations(args: UpdateAutomatedReasoningPolicyAnnotationsCommandInput, cb: (err: any, data?: UpdateAutomatedReasoningPolicyAnnotationsCommandOutput) => void): void;
    updateAutomatedReasoningPolicyAnnotations(args: UpdateAutomatedReasoningPolicyAnnotationsCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: UpdateAutomatedReasoningPolicyAnnotationsCommandOutput) => void): void;
    /**
     * @see {@link UpdateAutomatedReasoningPolicyTestCaseCommand}
     */
    updateAutomatedReasoningPolicyTestCase(args: UpdateAutomatedReasoningPolicyTestCaseCommandInput, options?: __HttpHandlerOptions): Promise<UpdateAutomatedReasoningPolicyTestCaseCommandOutput>;
    updateAutomatedReasoningPolicyTestCase(args: UpdateAutomatedReasoningPolicyTestCaseCommandInput, cb: (err: any, data?: UpdateAutomatedReasoningPolicyTestCaseCommandOutput) => void): void;
    updateAutomatedReasoningPolicyTestCase(args: UpdateAutomatedReasoningPolicyTestCaseCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: UpdateAutomatedReasoningPolicyTestCaseCommandOutput) => void): void;
    /**
     * @see {@link UpdateCustomModelDeploymentCommand}
     */
    updateCustomModelDeployment(args: UpdateCustomModelDeploymentCommandInput, options?: __HttpHandlerOptions): Promise<UpdateCustomModelDeploymentCommandOutput>;
    updateCustomModelDeployment(args: UpdateCustomModelDeploymentCommandInput, cb: (err: any, data?: UpdateCustomModelDeploymentCommandOutput) => void): void;
    updateCustomModelDeployment(args: UpdateCustomModelDeploymentCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: UpdateCustomModelDeploymentCommandOutput) => void): void;
    /**
     * @see {@link UpdateGuardrailCommand}
     */
    updateGuardrail(args: UpdateGuardrailCommandInput, options?: __HttpHandlerOptions): Promise<UpdateGuardrailCommandOutput>;
    updateGuardrail(args: UpdateGuardrailCommandInput, cb: (err: any, data?: UpdateGuardrailCommandOutput) => void): void;
    updateGuardrail(args: UpdateGuardrailCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: UpdateGuardrailCommandOutput) => void): void;
    /**
     * @see {@link UpdateMarketplaceModelEndpointCommand}
     */
    updateMarketplaceModelEndpoint(args: UpdateMarketplaceModelEndpointCommandInput, options?: __HttpHandlerOptions): Promise<UpdateMarketplaceModelEndpointCommandOutput>;
    updateMarketplaceModelEndpoint(args: UpdateMarketplaceModelEndpointCommandInput, cb: (err: any, data?: UpdateMarketplaceModelEndpointCommandOutput) => void): void;
    updateMarketplaceModelEndpoint(args: UpdateMarketplaceModelEndpointCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: UpdateMarketplaceModelEndpointCommandOutput) => void): void;
    /**
     * @see {@link UpdateProvisionedModelThroughputCommand}
     */
    updateProvisionedModelThroughput(args: UpdateProvisionedModelThroughputCommandInput, options?: __HttpHandlerOptions): Promise<UpdateProvisionedModelThroughputCommandOutput>;
    updateProvisionedModelThroughput(args: UpdateProvisionedModelThroughputCommandInput, cb: (err: any, data?: UpdateProvisionedModelThroughputCommandOutput) => void): void;
    updateProvisionedModelThroughput(args: UpdateProvisionedModelThroughputCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: UpdateProvisionedModelThroughputCommandOutput) => void): void;
    /**
     * @see {@link ListAutomatedReasoningPoliciesCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListAutomatedReasoningPoliciesCommandOutput}.
     */
    paginateListAutomatedReasoningPolicies(args?: ListAutomatedReasoningPoliciesCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListAutomatedReasoningPoliciesCommandOutput>;
    /**
     * @see {@link ListAutomatedReasoningPolicyBuildWorkflowsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput}.
     */
    paginateListAutomatedReasoningPolicyBuildWorkflows(args: ListAutomatedReasoningPolicyBuildWorkflowsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListAutomatedReasoningPolicyBuildWorkflowsCommandOutput>;
    /**
     * @see {@link ListAutomatedReasoningPolicyTestCasesCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListAutomatedReasoningPolicyTestCasesCommandOutput}.
     */
    paginateListAutomatedReasoningPolicyTestCases(args: ListAutomatedReasoningPolicyTestCasesCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListAutomatedReasoningPolicyTestCasesCommandOutput>;
    /**
     * @see {@link ListAutomatedReasoningPolicyTestResultsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListAutomatedReasoningPolicyTestResultsCommandOutput}.
     */
    paginateListAutomatedReasoningPolicyTestResults(args: ListAutomatedReasoningPolicyTestResultsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListAutomatedReasoningPolicyTestResultsCommandOutput>;
    /**
     * @see {@link ListCustomModelDeploymentsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListCustomModelDeploymentsCommandOutput}.
     */
    paginateListCustomModelDeployments(args?: ListCustomModelDeploymentsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListCustomModelDeploymentsCommandOutput>;
    /**
     * @see {@link ListCustomModelsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListCustomModelsCommandOutput}.
     */
    paginateListCustomModels(args?: ListCustomModelsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListCustomModelsCommandOutput>;
    /**
     * @see {@link ListEnforcedGuardrailsConfigurationCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListEnforcedGuardrailsConfigurationCommandOutput}.
     */
    paginateListEnforcedGuardrailsConfiguration(args?: ListEnforcedGuardrailsConfigurationCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListEnforcedGuardrailsConfigurationCommandOutput>;
    /**
     * @see {@link ListEvaluationJobsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListEvaluationJobsCommandOutput}.
     */
    paginateListEvaluationJobs(args?: ListEvaluationJobsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListEvaluationJobsCommandOutput>;
    /**
     * @see {@link ListGuardrailsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListGuardrailsCommandOutput}.
     */
    paginateListGuardrails(args?: ListGuardrailsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListGuardrailsCommandOutput>;
    /**
     * @see {@link ListImportedModelsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListImportedModelsCommandOutput}.
     */
    paginateListImportedModels(args?: ListImportedModelsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListImportedModelsCommandOutput>;
    /**
     * @see {@link ListInferenceProfilesCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListInferenceProfilesCommandOutput}.
     */
    paginateListInferenceProfiles(args?: ListInferenceProfilesCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListInferenceProfilesCommandOutput>;
    /**
     * @see {@link ListMarketplaceModelEndpointsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListMarketplaceModelEndpointsCommandOutput}.
     */
    paginateListMarketplaceModelEndpoints(args?: ListMarketplaceModelEndpointsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListMarketplaceModelEndpointsCommandOutput>;
    /**
     * @see {@link ListModelCopyJobsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListModelCopyJobsCommandOutput}.
     */
    paginateListModelCopyJobs(args?: ListModelCopyJobsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListModelCopyJobsCommandOutput>;
    /**
     * @see {@link ListModelCustomizationJobsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListModelCustomizationJobsCommandOutput}.
     */
    paginateListModelCustomizationJobs(args?: ListModelCustomizationJobsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListModelCustomizationJobsCommandOutput>;
    /**
     * @see {@link ListModelImportJobsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListModelImportJobsCommandOutput}.
     */
    paginateListModelImportJobs(args?: ListModelImportJobsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListModelImportJobsCommandOutput>;
    /**
     * @see {@link ListModelInvocationJobsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListModelInvocationJobsCommandOutput}.
     */
    paginateListModelInvocationJobs(args?: ListModelInvocationJobsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListModelInvocationJobsCommandOutput>;
    /**
     * @see {@link ListPromptRoutersCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListPromptRoutersCommandOutput}.
     */
    paginateListPromptRouters(args?: ListPromptRoutersCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListPromptRoutersCommandOutput>;
    /**
     * @see {@link ListProvisionedModelThroughputsCommand}
     * @param args - command input.
     * @param paginationConfig - optional pagination config.
     * @returns AsyncIterable of {@link ListProvisionedModelThroughputsCommandOutput}.
     */
    paginateListProvisionedModelThroughputs(args?: ListProvisionedModelThroughputsCommandInput, paginationConfig?: Omit<PaginationConfiguration, "client">): Paginator<ListProvisionedModelThroughputsCommandOutput>;
}
/**
 * <p>Describes the API operations for creating, managing, fine-turning, and evaluating Amazon Bedrock models.</p>
 * @public
 */
export declare class Bedrock extends BedrockClient implements Bedrock {
}
