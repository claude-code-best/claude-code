import { createAggregatedClient } from "@smithy/smithy-client";
import { BedrockClient } from "./BedrockClient";
import { BatchDeleteEvaluationJobCommand, } from "./commands/BatchDeleteEvaluationJobCommand";
import { CancelAutomatedReasoningPolicyBuildWorkflowCommand, } from "./commands/CancelAutomatedReasoningPolicyBuildWorkflowCommand";
import { CreateAutomatedReasoningPolicyCommand, } from "./commands/CreateAutomatedReasoningPolicyCommand";
import { CreateAutomatedReasoningPolicyTestCaseCommand, } from "./commands/CreateAutomatedReasoningPolicyTestCaseCommand";
import { CreateAutomatedReasoningPolicyVersionCommand, } from "./commands/CreateAutomatedReasoningPolicyVersionCommand";
import { CreateCustomModelCommand, } from "./commands/CreateCustomModelCommand";
import { CreateCustomModelDeploymentCommand, } from "./commands/CreateCustomModelDeploymentCommand";
import { CreateEvaluationJobCommand, } from "./commands/CreateEvaluationJobCommand";
import { CreateFoundationModelAgreementCommand, } from "./commands/CreateFoundationModelAgreementCommand";
import { CreateGuardrailCommand, } from "./commands/CreateGuardrailCommand";
import { CreateGuardrailVersionCommand, } from "./commands/CreateGuardrailVersionCommand";
import { CreateInferenceProfileCommand, } from "./commands/CreateInferenceProfileCommand";
import { CreateMarketplaceModelEndpointCommand, } from "./commands/CreateMarketplaceModelEndpointCommand";
import { CreateModelCopyJobCommand, } from "./commands/CreateModelCopyJobCommand";
import { CreateModelCustomizationJobCommand, } from "./commands/CreateModelCustomizationJobCommand";
import { CreateModelImportJobCommand, } from "./commands/CreateModelImportJobCommand";
import { CreateModelInvocationJobCommand, } from "./commands/CreateModelInvocationJobCommand";
import { CreatePromptRouterCommand, } from "./commands/CreatePromptRouterCommand";
import { CreateProvisionedModelThroughputCommand, } from "./commands/CreateProvisionedModelThroughputCommand";
import { DeleteAutomatedReasoningPolicyBuildWorkflowCommand, } from "./commands/DeleteAutomatedReasoningPolicyBuildWorkflowCommand";
import { DeleteAutomatedReasoningPolicyCommand, } from "./commands/DeleteAutomatedReasoningPolicyCommand";
import { DeleteAutomatedReasoningPolicyTestCaseCommand, } from "./commands/DeleteAutomatedReasoningPolicyTestCaseCommand";
import { DeleteCustomModelCommand, } from "./commands/DeleteCustomModelCommand";
import { DeleteCustomModelDeploymentCommand, } from "./commands/DeleteCustomModelDeploymentCommand";
import { DeleteEnforcedGuardrailConfigurationCommand, } from "./commands/DeleteEnforcedGuardrailConfigurationCommand";
import { DeleteFoundationModelAgreementCommand, } from "./commands/DeleteFoundationModelAgreementCommand";
import { DeleteGuardrailCommand, } from "./commands/DeleteGuardrailCommand";
import { DeleteImportedModelCommand, } from "./commands/DeleteImportedModelCommand";
import { DeleteInferenceProfileCommand, } from "./commands/DeleteInferenceProfileCommand";
import { DeleteMarketplaceModelEndpointCommand, } from "./commands/DeleteMarketplaceModelEndpointCommand";
import { DeleteModelInvocationLoggingConfigurationCommand, } from "./commands/DeleteModelInvocationLoggingConfigurationCommand";
import { DeletePromptRouterCommand, } from "./commands/DeletePromptRouterCommand";
import { DeleteProvisionedModelThroughputCommand, } from "./commands/DeleteProvisionedModelThroughputCommand";
import { DeleteResourcePolicyCommand, } from "./commands/DeleteResourcePolicyCommand";
import { DeregisterMarketplaceModelEndpointCommand, } from "./commands/DeregisterMarketplaceModelEndpointCommand";
import { ExportAutomatedReasoningPolicyVersionCommand, } from "./commands/ExportAutomatedReasoningPolicyVersionCommand";
import { GetAutomatedReasoningPolicyAnnotationsCommand, } from "./commands/GetAutomatedReasoningPolicyAnnotationsCommand";
import { GetAutomatedReasoningPolicyBuildWorkflowCommand, } from "./commands/GetAutomatedReasoningPolicyBuildWorkflowCommand";
import { GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand, } from "./commands/GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand";
import { GetAutomatedReasoningPolicyCommand, } from "./commands/GetAutomatedReasoningPolicyCommand";
import { GetAutomatedReasoningPolicyNextScenarioCommand, } from "./commands/GetAutomatedReasoningPolicyNextScenarioCommand";
import { GetAutomatedReasoningPolicyTestCaseCommand, } from "./commands/GetAutomatedReasoningPolicyTestCaseCommand";
import { GetAutomatedReasoningPolicyTestResultCommand, } from "./commands/GetAutomatedReasoningPolicyTestResultCommand";
import { GetCustomModelCommand, } from "./commands/GetCustomModelCommand";
import { GetCustomModelDeploymentCommand, } from "./commands/GetCustomModelDeploymentCommand";
import { GetEvaluationJobCommand, } from "./commands/GetEvaluationJobCommand";
import { GetFoundationModelAvailabilityCommand, } from "./commands/GetFoundationModelAvailabilityCommand";
import { GetFoundationModelCommand, } from "./commands/GetFoundationModelCommand";
import { GetGuardrailCommand, } from "./commands/GetGuardrailCommand";
import { GetImportedModelCommand, } from "./commands/GetImportedModelCommand";
import { GetInferenceProfileCommand, } from "./commands/GetInferenceProfileCommand";
import { GetMarketplaceModelEndpointCommand, } from "./commands/GetMarketplaceModelEndpointCommand";
import { GetModelCopyJobCommand, } from "./commands/GetModelCopyJobCommand";
import { GetModelCustomizationJobCommand, } from "./commands/GetModelCustomizationJobCommand";
import { GetModelImportJobCommand, } from "./commands/GetModelImportJobCommand";
import { GetModelInvocationJobCommand, } from "./commands/GetModelInvocationJobCommand";
import { GetModelInvocationLoggingConfigurationCommand, } from "./commands/GetModelInvocationLoggingConfigurationCommand";
import { GetPromptRouterCommand, } from "./commands/GetPromptRouterCommand";
import { GetProvisionedModelThroughputCommand, } from "./commands/GetProvisionedModelThroughputCommand";
import { GetResourcePolicyCommand, } from "./commands/GetResourcePolicyCommand";
import { GetUseCaseForModelAccessCommand, } from "./commands/GetUseCaseForModelAccessCommand";
import { ListAutomatedReasoningPoliciesCommand, } from "./commands/ListAutomatedReasoningPoliciesCommand";
import { ListAutomatedReasoningPolicyBuildWorkflowsCommand, } from "./commands/ListAutomatedReasoningPolicyBuildWorkflowsCommand";
import { ListAutomatedReasoningPolicyTestCasesCommand, } from "./commands/ListAutomatedReasoningPolicyTestCasesCommand";
import { ListAutomatedReasoningPolicyTestResultsCommand, } from "./commands/ListAutomatedReasoningPolicyTestResultsCommand";
import { ListCustomModelDeploymentsCommand, } from "./commands/ListCustomModelDeploymentsCommand";
import { ListCustomModelsCommand, } from "./commands/ListCustomModelsCommand";
import { ListEnforcedGuardrailsConfigurationCommand, } from "./commands/ListEnforcedGuardrailsConfigurationCommand";
import { ListEvaluationJobsCommand, } from "./commands/ListEvaluationJobsCommand";
import { ListFoundationModelAgreementOffersCommand, } from "./commands/ListFoundationModelAgreementOffersCommand";
import { ListFoundationModelsCommand, } from "./commands/ListFoundationModelsCommand";
import { ListGuardrailsCommand, } from "./commands/ListGuardrailsCommand";
import { ListImportedModelsCommand, } from "./commands/ListImportedModelsCommand";
import { ListInferenceProfilesCommand, } from "./commands/ListInferenceProfilesCommand";
import { ListMarketplaceModelEndpointsCommand, } from "./commands/ListMarketplaceModelEndpointsCommand";
import { ListModelCopyJobsCommand, } from "./commands/ListModelCopyJobsCommand";
import { ListModelCustomizationJobsCommand, } from "./commands/ListModelCustomizationJobsCommand";
import { ListModelImportJobsCommand, } from "./commands/ListModelImportJobsCommand";
import { ListModelInvocationJobsCommand, } from "./commands/ListModelInvocationJobsCommand";
import { ListPromptRoutersCommand, } from "./commands/ListPromptRoutersCommand";
import { ListProvisionedModelThroughputsCommand, } from "./commands/ListProvisionedModelThroughputsCommand";
import { ListTagsForResourceCommand, } from "./commands/ListTagsForResourceCommand";
import { PutEnforcedGuardrailConfigurationCommand, } from "./commands/PutEnforcedGuardrailConfigurationCommand";
import { PutModelInvocationLoggingConfigurationCommand, } from "./commands/PutModelInvocationLoggingConfigurationCommand";
import { PutResourcePolicyCommand, } from "./commands/PutResourcePolicyCommand";
import { PutUseCaseForModelAccessCommand, } from "./commands/PutUseCaseForModelAccessCommand";
import { RegisterMarketplaceModelEndpointCommand, } from "./commands/RegisterMarketplaceModelEndpointCommand";
import { StartAutomatedReasoningPolicyBuildWorkflowCommand, } from "./commands/StartAutomatedReasoningPolicyBuildWorkflowCommand";
import { StartAutomatedReasoningPolicyTestWorkflowCommand, } from "./commands/StartAutomatedReasoningPolicyTestWorkflowCommand";
import { StopEvaluationJobCommand, } from "./commands/StopEvaluationJobCommand";
import { StopModelCustomizationJobCommand, } from "./commands/StopModelCustomizationJobCommand";
import { StopModelInvocationJobCommand, } from "./commands/StopModelInvocationJobCommand";
import { TagResourceCommand, } from "./commands/TagResourceCommand";
import { UntagResourceCommand, } from "./commands/UntagResourceCommand";
import { UpdateAutomatedReasoningPolicyAnnotationsCommand, } from "./commands/UpdateAutomatedReasoningPolicyAnnotationsCommand";
import { UpdateAutomatedReasoningPolicyCommand, } from "./commands/UpdateAutomatedReasoningPolicyCommand";
import { UpdateAutomatedReasoningPolicyTestCaseCommand, } from "./commands/UpdateAutomatedReasoningPolicyTestCaseCommand";
import { UpdateCustomModelDeploymentCommand, } from "./commands/UpdateCustomModelDeploymentCommand";
import { UpdateGuardrailCommand, } from "./commands/UpdateGuardrailCommand";
import { UpdateMarketplaceModelEndpointCommand, } from "./commands/UpdateMarketplaceModelEndpointCommand";
import { UpdateProvisionedModelThroughputCommand, } from "./commands/UpdateProvisionedModelThroughputCommand";
import { paginateListAutomatedReasoningPolicies } from "./pagination/ListAutomatedReasoningPoliciesPaginator";
import { paginateListAutomatedReasoningPolicyBuildWorkflows, } from "./pagination/ListAutomatedReasoningPolicyBuildWorkflowsPaginator";
import { paginateListAutomatedReasoningPolicyTestCases, } from "./pagination/ListAutomatedReasoningPolicyTestCasesPaginator";
import { paginateListAutomatedReasoningPolicyTestResults, } from "./pagination/ListAutomatedReasoningPolicyTestResultsPaginator";
import { paginateListCustomModelDeployments } from "./pagination/ListCustomModelDeploymentsPaginator";
import { paginateListCustomModels } from "./pagination/ListCustomModelsPaginator";
import { paginateListEnforcedGuardrailsConfiguration } from "./pagination/ListEnforcedGuardrailsConfigurationPaginator";
import { paginateListEvaluationJobs } from "./pagination/ListEvaluationJobsPaginator";
import { paginateListGuardrails } from "./pagination/ListGuardrailsPaginator";
import { paginateListImportedModels } from "./pagination/ListImportedModelsPaginator";
import { paginateListInferenceProfiles } from "./pagination/ListInferenceProfilesPaginator";
import { paginateListMarketplaceModelEndpoints } from "./pagination/ListMarketplaceModelEndpointsPaginator";
import { paginateListModelCopyJobs } from "./pagination/ListModelCopyJobsPaginator";
import { paginateListModelCustomizationJobs } from "./pagination/ListModelCustomizationJobsPaginator";
import { paginateListModelImportJobs } from "./pagination/ListModelImportJobsPaginator";
import { paginateListModelInvocationJobs } from "./pagination/ListModelInvocationJobsPaginator";
import { paginateListPromptRouters } from "./pagination/ListPromptRoutersPaginator";
import { paginateListProvisionedModelThroughputs } from "./pagination/ListProvisionedModelThroughputsPaginator";
const commands = {
    BatchDeleteEvaluationJobCommand,
    CancelAutomatedReasoningPolicyBuildWorkflowCommand,
    CreateAutomatedReasoningPolicyCommand,
    CreateAutomatedReasoningPolicyTestCaseCommand,
    CreateAutomatedReasoningPolicyVersionCommand,
    CreateCustomModelCommand,
    CreateCustomModelDeploymentCommand,
    CreateEvaluationJobCommand,
    CreateFoundationModelAgreementCommand,
    CreateGuardrailCommand,
    CreateGuardrailVersionCommand,
    CreateInferenceProfileCommand,
    CreateMarketplaceModelEndpointCommand,
    CreateModelCopyJobCommand,
    CreateModelCustomizationJobCommand,
    CreateModelImportJobCommand,
    CreateModelInvocationJobCommand,
    CreatePromptRouterCommand,
    CreateProvisionedModelThroughputCommand,
    DeleteAutomatedReasoningPolicyCommand,
    DeleteAutomatedReasoningPolicyBuildWorkflowCommand,
    DeleteAutomatedReasoningPolicyTestCaseCommand,
    DeleteCustomModelCommand,
    DeleteCustomModelDeploymentCommand,
    DeleteEnforcedGuardrailConfigurationCommand,
    DeleteFoundationModelAgreementCommand,
    DeleteGuardrailCommand,
    DeleteImportedModelCommand,
    DeleteInferenceProfileCommand,
    DeleteMarketplaceModelEndpointCommand,
    DeleteModelInvocationLoggingConfigurationCommand,
    DeletePromptRouterCommand,
    DeleteProvisionedModelThroughputCommand,
    DeleteResourcePolicyCommand,
    DeregisterMarketplaceModelEndpointCommand,
    ExportAutomatedReasoningPolicyVersionCommand,
    GetAutomatedReasoningPolicyCommand,
    GetAutomatedReasoningPolicyAnnotationsCommand,
    GetAutomatedReasoningPolicyBuildWorkflowCommand,
    GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand,
    GetAutomatedReasoningPolicyNextScenarioCommand,
    GetAutomatedReasoningPolicyTestCaseCommand,
    GetAutomatedReasoningPolicyTestResultCommand,
    GetCustomModelCommand,
    GetCustomModelDeploymentCommand,
    GetEvaluationJobCommand,
    GetFoundationModelCommand,
    GetFoundationModelAvailabilityCommand,
    GetGuardrailCommand,
    GetImportedModelCommand,
    GetInferenceProfileCommand,
    GetMarketplaceModelEndpointCommand,
    GetModelCopyJobCommand,
    GetModelCustomizationJobCommand,
    GetModelImportJobCommand,
    GetModelInvocationJobCommand,
    GetModelInvocationLoggingConfigurationCommand,
    GetPromptRouterCommand,
    GetProvisionedModelThroughputCommand,
    GetResourcePolicyCommand,
    GetUseCaseForModelAccessCommand,
    ListAutomatedReasoningPoliciesCommand,
    ListAutomatedReasoningPolicyBuildWorkflowsCommand,
    ListAutomatedReasoningPolicyTestCasesCommand,
    ListAutomatedReasoningPolicyTestResultsCommand,
    ListCustomModelDeploymentsCommand,
    ListCustomModelsCommand,
    ListEnforcedGuardrailsConfigurationCommand,
    ListEvaluationJobsCommand,
    ListFoundationModelAgreementOffersCommand,
    ListFoundationModelsCommand,
    ListGuardrailsCommand,
    ListImportedModelsCommand,
    ListInferenceProfilesCommand,
    ListMarketplaceModelEndpointsCommand,
    ListModelCopyJobsCommand,
    ListModelCustomizationJobsCommand,
    ListModelImportJobsCommand,
    ListModelInvocationJobsCommand,
    ListPromptRoutersCommand,
    ListProvisionedModelThroughputsCommand,
    ListTagsForResourceCommand,
    PutEnforcedGuardrailConfigurationCommand,
    PutModelInvocationLoggingConfigurationCommand,
    PutResourcePolicyCommand,
    PutUseCaseForModelAccessCommand,
    RegisterMarketplaceModelEndpointCommand,
    StartAutomatedReasoningPolicyBuildWorkflowCommand,
    StartAutomatedReasoningPolicyTestWorkflowCommand,
    StopEvaluationJobCommand,
    StopModelCustomizationJobCommand,
    StopModelInvocationJobCommand,
    TagResourceCommand,
    UntagResourceCommand,
    UpdateAutomatedReasoningPolicyCommand,
    UpdateAutomatedReasoningPolicyAnnotationsCommand,
    UpdateAutomatedReasoningPolicyTestCaseCommand,
    UpdateCustomModelDeploymentCommand,
    UpdateGuardrailCommand,
    UpdateMarketplaceModelEndpointCommand,
    UpdateProvisionedModelThroughputCommand,
};
const paginators = {
    paginateListAutomatedReasoningPolicies,
    paginateListAutomatedReasoningPolicyBuildWorkflows,
    paginateListAutomatedReasoningPolicyTestCases,
    paginateListAutomatedReasoningPolicyTestResults,
    paginateListCustomModelDeployments,
    paginateListCustomModels,
    paginateListEnforcedGuardrailsConfiguration,
    paginateListEvaluationJobs,
    paginateListGuardrails,
    paginateListImportedModels,
    paginateListInferenceProfiles,
    paginateListMarketplaceModelEndpoints,
    paginateListModelCopyJobs,
    paginateListModelCustomizationJobs,
    paginateListModelImportJobs,
    paginateListModelInvocationJobs,
    paginateListPromptRouters,
    paginateListProvisionedModelThroughputs,
};
export class Bedrock extends BedrockClient {
}
createAggregatedClient(commands, Bedrock, { paginators });
