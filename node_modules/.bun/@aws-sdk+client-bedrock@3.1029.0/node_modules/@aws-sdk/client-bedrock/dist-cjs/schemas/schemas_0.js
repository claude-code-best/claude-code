"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutomatedReasoningPolicyBuildWorkflowRepairContent$ = exports.AutomatedReasoningPolicyBuildWorkflowDocument$ = exports.AutomatedReasoningPolicyBuildStepMessage$ = exports.AutomatedReasoningPolicyBuildStep$ = exports.AutomatedReasoningPolicyBuildResultAssetManifestEntry$ = exports.AutomatedReasoningPolicyBuildResultAssetManifest$ = exports.AutomatedReasoningPolicyBuildLogEntry$ = exports.AutomatedReasoningPolicyBuildLog$ = exports.AutomatedReasoningPolicyAtomicStatement$ = exports.AutomatedReasoningPolicyAnnotatedLine$ = exports.AutomatedReasoningPolicyAnnotatedChunk$ = exports.AutomatedReasoningPolicyAddVariableMutation$ = exports.AutomatedReasoningPolicyAddVariableAnnotation$ = exports.AutomatedReasoningPolicyAddTypeValue$ = exports.AutomatedReasoningPolicyAddTypeMutation$ = exports.AutomatedReasoningPolicyAddTypeAnnotation$ = exports.AutomatedReasoningPolicyAddRuleMutation$ = exports.AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation$ = exports.AutomatedReasoningPolicyAddRuleAnnotation$ = exports.AutomatedReasoningLogicStatement$ = exports.AutomatedReasoningCheckValidFinding$ = exports.AutomatedReasoningCheckTranslationOption$ = exports.AutomatedReasoningCheckTranslationAmbiguousFinding$ = exports.AutomatedReasoningCheckTranslation$ = exports.AutomatedReasoningCheckTooComplexFinding$ = exports.AutomatedReasoningCheckScenario$ = exports.AutomatedReasoningCheckSatisfiableFinding$ = exports.AutomatedReasoningCheckRule$ = exports.AutomatedReasoningCheckNoTranslationsFinding$ = exports.AutomatedReasoningCheckLogicWarning$ = exports.AutomatedReasoningCheckInvalidFinding$ = exports.AutomatedReasoningCheckInputTextReference$ = exports.AutomatedReasoningCheckImpossibleFinding$ = exports.AutomatedEvaluationCustomMetricConfig$ = exports.AutomatedEvaluationConfig$ = exports.AgreementAvailability$ = exports.AccountEnforcedGuardrailOutputConfiguration$ = exports.AccountEnforcedGuardrailInferenceInputConfiguration$ = exports.errorTypeRegistries = exports.ValidationException$ = exports.TooManyTagsException$ = exports.ThrottlingException$ = exports.ServiceUnavailableException$ = exports.ServiceQuotaExceededException$ = exports.ResourceNotFoundException$ = exports.ResourceInUseException$ = exports.InternalServerException$ = exports.ConflictException$ = exports.AccessDeniedException$ = exports.BedrockServiceException$ = void 0;
exports.CancelAutomatedReasoningPolicyBuildWorkflowResponse$ = exports.CancelAutomatedReasoningPolicyBuildWorkflowRequest$ = exports.ByteContentDoc$ = exports.BedrockEvaluatorModel$ = exports.BatchDeleteEvaluationJobResponse$ = exports.BatchDeleteEvaluationJobRequest$ = exports.BatchDeleteEvaluationJobItem$ = exports.BatchDeleteEvaluationJobError$ = exports.AutomatedReasoningPolicyVariableReport$ = exports.AutomatedReasoningPolicyUpdateVariableMutation$ = exports.AutomatedReasoningPolicyUpdateVariableAnnotation$ = exports.AutomatedReasoningPolicyUpdateTypeValue$ = exports.AutomatedReasoningPolicyUpdateTypeMutation$ = exports.AutomatedReasoningPolicyUpdateTypeAnnotation$ = exports.AutomatedReasoningPolicyUpdateRuleMutation$ = exports.AutomatedReasoningPolicyUpdateRuleAnnotation$ = exports.AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation$ = exports.AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation$ = exports.AutomatedReasoningPolicyTestResult$ = exports.AutomatedReasoningPolicyTestCase$ = exports.AutomatedReasoningPolicySummary$ = exports.AutomatedReasoningPolicyStatementReference$ = exports.AutomatedReasoningPolicyStatementLocation$ = exports.AutomatedReasoningPolicySourceDocument$ = exports.AutomatedReasoningPolicyScenarios$ = exports.AutomatedReasoningPolicyScenario$ = exports.AutomatedReasoningPolicyRuleReport$ = exports.AutomatedReasoningPolicyReportSourceDocument$ = exports.AutomatedReasoningPolicyPlanning$ = exports.AutomatedReasoningPolicyIngestContentAnnotation$ = exports.AutomatedReasoningPolicyGeneratedTestCases$ = exports.AutomatedReasoningPolicyGeneratedTestCase$ = exports.AutomatedReasoningPolicyFidelityReport$ = exports.AutomatedReasoningPolicyDisjointRuleSet$ = exports.AutomatedReasoningPolicyDeleteVariableMutation$ = exports.AutomatedReasoningPolicyDeleteVariableAnnotation$ = exports.AutomatedReasoningPolicyDeleteTypeValue$ = exports.AutomatedReasoningPolicyDeleteTypeMutation$ = exports.AutomatedReasoningPolicyDeleteTypeAnnotation$ = exports.AutomatedReasoningPolicyDeleteRuleMutation$ = exports.AutomatedReasoningPolicyDeleteRuleAnnotation$ = exports.AutomatedReasoningPolicyDefinitionVariable$ = exports.AutomatedReasoningPolicyDefinitionTypeValuePair$ = exports.AutomatedReasoningPolicyDefinitionTypeValue$ = exports.AutomatedReasoningPolicyDefinitionType$ = exports.AutomatedReasoningPolicyDefinitionRule$ = exports.AutomatedReasoningPolicyDefinitionQualityReport$ = exports.AutomatedReasoningPolicyDefinition$ = exports.AutomatedReasoningPolicyBuildWorkflowSummary$ = exports.AutomatedReasoningPolicyBuildWorkflowSource$ = void 0;
exports.DeleteCustomModelDeploymentRequest$ = exports.DeleteAutomatedReasoningPolicyTestCaseResponse$ = exports.DeleteAutomatedReasoningPolicyTestCaseRequest$ = exports.DeleteAutomatedReasoningPolicyResponse$ = exports.DeleteAutomatedReasoningPolicyRequest$ = exports.DeleteAutomatedReasoningPolicyBuildWorkflowResponse$ = exports.DeleteAutomatedReasoningPolicyBuildWorkflowRequest$ = exports.DataProcessingDetails$ = exports.CustomModelUnits$ = exports.CustomModelSummary$ = exports.CustomModelDeploymentUpdateDetails$ = exports.CustomModelDeploymentSummary$ = exports.CustomMetricEvaluatorModelConfig$ = exports.CustomMetricDefinition$ = exports.CustomMetricBedrockEvaluatorModel$ = exports.CreateProvisionedModelThroughputResponse$ = exports.CreateProvisionedModelThroughputRequest$ = exports.CreatePromptRouterResponse$ = exports.CreatePromptRouterRequest$ = exports.CreateModelInvocationJobResponse$ = exports.CreateModelInvocationJobRequest$ = exports.CreateModelImportJobResponse$ = exports.CreateModelImportJobRequest$ = exports.CreateModelCustomizationJobResponse$ = exports.CreateModelCustomizationJobRequest$ = exports.CreateModelCopyJobResponse$ = exports.CreateModelCopyJobRequest$ = exports.CreateMarketplaceModelEndpointResponse$ = exports.CreateMarketplaceModelEndpointRequest$ = exports.CreateInferenceProfileResponse$ = exports.CreateInferenceProfileRequest$ = exports.CreateGuardrailVersionResponse$ = exports.CreateGuardrailVersionRequest$ = exports.CreateGuardrailResponse$ = exports.CreateGuardrailRequest$ = exports.CreateFoundationModelAgreementResponse$ = exports.CreateFoundationModelAgreementRequest$ = exports.CreateEvaluationJobResponse$ = exports.CreateEvaluationJobRequest$ = exports.CreateCustomModelResponse$ = exports.CreateCustomModelRequest$ = exports.CreateCustomModelDeploymentResponse$ = exports.CreateCustomModelDeploymentRequest$ = exports.CreateAutomatedReasoningPolicyVersionResponse$ = exports.CreateAutomatedReasoningPolicyVersionRequest$ = exports.CreateAutomatedReasoningPolicyTestCaseResponse$ = exports.CreateAutomatedReasoningPolicyTestCaseRequest$ = exports.CreateAutomatedReasoningPolicyResponse$ = exports.CreateAutomatedReasoningPolicyRequest$ = exports.CloudWatchConfig$ = void 0;
exports.GetAutomatedReasoningPolicyAnnotationsRequest$ = exports.GenerationConfiguration$ = exports.FoundationModelSummary$ = exports.FoundationModelLifecycle$ = exports.FoundationModelDetails$ = exports.FilterAttribute$ = exports.FieldForReranking$ = exports.ExternalSourcesRetrieveAndGenerateConfiguration$ = exports.ExternalSourcesGenerationConfiguration$ = exports.ExternalSource$ = exports.ExportAutomatedReasoningPolicyVersionResponse$ = exports.ExportAutomatedReasoningPolicyVersionRequest$ = exports.EvaluationSummary$ = exports.EvaluationRagConfigSummary$ = exports.EvaluationPrecomputedRetrieveSourceConfig$ = exports.EvaluationPrecomputedRetrieveAndGenerateSourceConfig$ = exports.EvaluationPrecomputedInferenceSource$ = exports.EvaluationOutputDataConfig$ = exports.EvaluationModelConfigSummary$ = exports.EvaluationInferenceConfigSummary$ = exports.EvaluationDatasetMetricConfig$ = exports.EvaluationDataset$ = exports.EvaluationBedrockModel$ = exports.DistillationConfig$ = exports.DimensionalPriceRate$ = exports.DeregisterMarketplaceModelEndpointResponse$ = exports.DeregisterMarketplaceModelEndpointRequest$ = exports.DeleteResourcePolicyResponse$ = exports.DeleteResourcePolicyRequest$ = exports.DeleteProvisionedModelThroughputResponse$ = exports.DeleteProvisionedModelThroughputRequest$ = exports.DeletePromptRouterResponse$ = exports.DeletePromptRouterRequest$ = exports.DeleteModelInvocationLoggingConfigurationResponse$ = exports.DeleteModelInvocationLoggingConfigurationRequest$ = exports.DeleteMarketplaceModelEndpointResponse$ = exports.DeleteMarketplaceModelEndpointRequest$ = exports.DeleteInferenceProfileResponse$ = exports.DeleteInferenceProfileRequest$ = exports.DeleteImportedModelResponse$ = exports.DeleteImportedModelRequest$ = exports.DeleteGuardrailResponse$ = exports.DeleteGuardrailRequest$ = exports.DeleteFoundationModelAgreementResponse$ = exports.DeleteFoundationModelAgreementRequest$ = exports.DeleteEnforcedGuardrailConfigurationResponse$ = exports.DeleteEnforcedGuardrailConfigurationRequest$ = exports.DeleteCustomModelResponse$ = exports.DeleteCustomModelRequest$ = exports.DeleteCustomModelDeploymentResponse$ = void 0;
exports.GuardrailAutomatedReasoningPolicy$ = exports.GetUseCaseForModelAccessResponse$ = exports.GetUseCaseForModelAccessRequest$ = exports.GetResourcePolicyResponse$ = exports.GetResourcePolicyRequest$ = exports.GetProvisionedModelThroughputResponse$ = exports.GetProvisionedModelThroughputRequest$ = exports.GetPromptRouterResponse$ = exports.GetPromptRouterRequest$ = exports.GetModelInvocationLoggingConfigurationResponse$ = exports.GetModelInvocationLoggingConfigurationRequest$ = exports.GetModelInvocationJobResponse$ = exports.GetModelInvocationJobRequest$ = exports.GetModelImportJobResponse$ = exports.GetModelImportJobRequest$ = exports.GetModelCustomizationJobResponse$ = exports.GetModelCustomizationJobRequest$ = exports.GetModelCopyJobResponse$ = exports.GetModelCopyJobRequest$ = exports.GetMarketplaceModelEndpointResponse$ = exports.GetMarketplaceModelEndpointRequest$ = exports.GetInferenceProfileResponse$ = exports.GetInferenceProfileRequest$ = exports.GetImportedModelResponse$ = exports.GetImportedModelRequest$ = exports.GetGuardrailResponse$ = exports.GetGuardrailRequest$ = exports.GetFoundationModelResponse$ = exports.GetFoundationModelRequest$ = exports.GetFoundationModelAvailabilityResponse$ = exports.GetFoundationModelAvailabilityRequest$ = exports.GetEvaluationJobResponse$ = exports.GetEvaluationJobRequest$ = exports.GetCustomModelResponse$ = exports.GetCustomModelRequest$ = exports.GetCustomModelDeploymentResponse$ = exports.GetCustomModelDeploymentRequest$ = exports.GetAutomatedReasoningPolicyTestResultResponse$ = exports.GetAutomatedReasoningPolicyTestResultRequest$ = exports.GetAutomatedReasoningPolicyTestCaseResponse$ = exports.GetAutomatedReasoningPolicyTestCaseRequest$ = exports.GetAutomatedReasoningPolicyResponse$ = exports.GetAutomatedReasoningPolicyRequest$ = exports.GetAutomatedReasoningPolicyNextScenarioResponse$ = exports.GetAutomatedReasoningPolicyNextScenarioRequest$ = exports.GetAutomatedReasoningPolicyBuildWorkflowResultAssetsResponse$ = exports.GetAutomatedReasoningPolicyBuildWorkflowResultAssetsRequest$ = exports.GetAutomatedReasoningPolicyBuildWorkflowResponse$ = exports.GetAutomatedReasoningPolicyBuildWorkflowRequest$ = exports.GetAutomatedReasoningPolicyAnnotationsResponse$ = void 0;
exports.ListAutomatedReasoningPolicyBuildWorkflowsRequest$ = exports.ListAutomatedReasoningPoliciesResponse$ = exports.ListAutomatedReasoningPoliciesRequest$ = exports.LegalTerm$ = exports.LambdaGraderConfig$ = exports.KnowledgeBaseVectorSearchConfiguration$ = exports.KnowledgeBaseRetrieveAndGenerateConfiguration$ = exports.KnowledgeBaseRetrievalConfiguration$ = exports.KbInferenceConfig$ = exports.InvocationLogsConfig$ = exports.InferenceProfileSummary$ = exports.InferenceProfileModel$ = exports.ImportedModelSummary$ = exports.ImplicitFilterConfiguration$ = exports.HumanWorkflowConfig$ = exports.HumanEvaluationCustomMetric$ = exports.HumanEvaluationConfig$ = exports.GuardrailWordPolicyConfig$ = exports.GuardrailWordPolicy$ = exports.GuardrailWordConfig$ = exports.GuardrailWord$ = exports.GuardrailTopicsTierConfig$ = exports.GuardrailTopicsTier$ = exports.GuardrailTopicPolicyConfig$ = exports.GuardrailTopicPolicy$ = exports.GuardrailTopicConfig$ = exports.GuardrailTopic$ = exports.GuardrailSummary$ = exports.GuardrailSensitiveInformationPolicyConfig$ = exports.GuardrailSensitiveInformationPolicy$ = exports.GuardrailRegexConfig$ = exports.GuardrailRegex$ = exports.GuardrailPiiEntityConfig$ = exports.GuardrailPiiEntity$ = exports.GuardrailManagedWordsConfig$ = exports.GuardrailManagedWords$ = exports.GuardrailCrossRegionDetails$ = exports.GuardrailCrossRegionConfig$ = exports.GuardrailContextualGroundingPolicyConfig$ = exports.GuardrailContextualGroundingPolicy$ = exports.GuardrailContextualGroundingFilterConfig$ = exports.GuardrailContextualGroundingFilter$ = exports.GuardrailContentPolicyConfig$ = exports.GuardrailContentPolicy$ = exports.GuardrailContentFiltersTierConfig$ = exports.GuardrailContentFiltersTier$ = exports.GuardrailContentFilterConfig$ = exports.GuardrailContentFilter$ = exports.GuardrailConfiguration$ = exports.GuardrailAutomatedReasoningPolicyConfig$ = void 0;
exports.ModelInvocationJobS3OutputDataConfig$ = exports.ModelInvocationJobS3InputDataConfig$ = exports.ModelImportJobSummary$ = exports.ModelEnforcement$ = exports.ModelCustomizationJobSummary$ = exports.ModelCopyJobSummary$ = exports.MetadataConfigurationForReranking$ = exports.MetadataAttributeSchema$ = exports.MarketplaceModelEndpointSummary$ = exports.MarketplaceModelEndpoint$ = exports.LoggingConfig$ = exports.ListTagsForResourceResponse$ = exports.ListTagsForResourceRequest$ = exports.ListProvisionedModelThroughputsResponse$ = exports.ListProvisionedModelThroughputsRequest$ = exports.ListPromptRoutersResponse$ = exports.ListPromptRoutersRequest$ = exports.ListModelInvocationJobsResponse$ = exports.ListModelInvocationJobsRequest$ = exports.ListModelImportJobsResponse$ = exports.ListModelImportJobsRequest$ = exports.ListModelCustomizationJobsResponse$ = exports.ListModelCustomizationJobsRequest$ = exports.ListModelCopyJobsResponse$ = exports.ListModelCopyJobsRequest$ = exports.ListMarketplaceModelEndpointsResponse$ = exports.ListMarketplaceModelEndpointsRequest$ = exports.ListInferenceProfilesResponse$ = exports.ListInferenceProfilesRequest$ = exports.ListImportedModelsResponse$ = exports.ListImportedModelsRequest$ = exports.ListGuardrailsResponse$ = exports.ListGuardrailsRequest$ = exports.ListFoundationModelsResponse$ = exports.ListFoundationModelsRequest$ = exports.ListFoundationModelAgreementOffersResponse$ = exports.ListFoundationModelAgreementOffersRequest$ = exports.ListEvaluationJobsResponse$ = exports.ListEvaluationJobsRequest$ = exports.ListEnforcedGuardrailsConfigurationResponse$ = exports.ListEnforcedGuardrailsConfigurationRequest$ = exports.ListCustomModelsResponse$ = exports.ListCustomModelsRequest$ = exports.ListCustomModelDeploymentsResponse$ = exports.ListCustomModelDeploymentsRequest$ = exports.ListAutomatedReasoningPolicyTestResultsResponse$ = exports.ListAutomatedReasoningPolicyTestResultsRequest$ = exports.ListAutomatedReasoningPolicyTestCasesResponse$ = exports.ListAutomatedReasoningPolicyTestCasesRequest$ = exports.ListAutomatedReasoningPolicyBuildWorkflowsResponse$ = void 0;
exports.TermDetails$ = exports.TeacherModelConfig$ = exports.TagResourceResponse$ = exports.TagResourceRequest$ = exports.Tag$ = exports.SupportTerm$ = exports.StopModelInvocationJobResponse$ = exports.StopModelInvocationJobRequest$ = exports.StopModelCustomizationJobResponse$ = exports.StopModelCustomizationJobRequest$ = exports.StopEvaluationJobResponse$ = exports.StopEvaluationJobRequest$ = exports.StatusDetails$ = exports.StartAutomatedReasoningPolicyTestWorkflowResponse$ = exports.StartAutomatedReasoningPolicyTestWorkflowRequest$ = exports.StartAutomatedReasoningPolicyBuildWorkflowResponse$ = exports.StartAutomatedReasoningPolicyBuildWorkflowRequest$ = exports.SelectiveContentGuarding$ = exports.SageMakerEndpoint$ = exports.S3ObjectDoc$ = exports.S3DataSource$ = exports.S3Config$ = exports.RoutingCriteria$ = exports.RFTHyperParameters$ = exports.RFTConfig$ = exports.RetrieveConfig$ = exports.RetrieveAndGenerateConfiguration$ = exports.RequestMetadataBaseFilters$ = exports.RegisterMarketplaceModelEndpointResponse$ = exports.RegisterMarketplaceModelEndpointRequest$ = exports.RatingScaleItem$ = exports.QueryTransformationConfiguration$ = exports.PutUseCaseForModelAccessResponse$ = exports.PutUseCaseForModelAccessRequest$ = exports.PutResourcePolicyResponse$ = exports.PutResourcePolicyRequest$ = exports.PutModelInvocationLoggingConfigurationResponse$ = exports.PutModelInvocationLoggingConfigurationRequest$ = exports.PutEnforcedGuardrailConfigurationResponse$ = exports.PutEnforcedGuardrailConfigurationRequest$ = exports.ProvisionedModelSummary$ = exports.PromptTemplate$ = exports.PromptRouterTargetModel$ = exports.PromptRouterSummary$ = exports.PricingTerm$ = exports.PerformanceConfiguration$ = exports.OutputDataConfig$ = exports.OrchestrationConfiguration$ = exports.Offer$ = exports.ModelInvocationJobSummary$ = void 0;
exports.InferenceProfileModelSource$ = exports.GraderConfig$ = exports.EvaluatorModelConfig$ = exports.EvaluationPrecomputedRagSourceConfig$ = exports.EvaluationModelConfig$ = exports.EvaluationInferenceConfig$ = exports.EvaluationDatasetLocation$ = exports.EvaluationConfig$ = exports.EndpointConfig$ = exports.CustomizationConfig$ = exports.AutomatedReasoningPolicyWorkflowTypeContent$ = exports.AutomatedReasoningPolicyTypeValueAnnotation$ = exports.AutomatedReasoningPolicyMutation$ = exports.AutomatedReasoningPolicyGenerateFidelityReportContent$ = exports.AutomatedReasoningPolicyDefinitionElement$ = exports.AutomatedReasoningPolicyBuildStepContext$ = exports.AutomatedReasoningPolicyBuildResultAssets$ = exports.AutomatedReasoningPolicyAnnotation$ = exports.AutomatedReasoningPolicyAnnotatedContent$ = exports.AutomatedReasoningCheckFinding$ = exports.AutomatedEvaluationCustomMetricSource$ = exports.VpcConfig$ = exports.VectorSearchRerankingConfiguration$ = exports.VectorSearchBedrockRerankingModelConfiguration$ = exports.VectorSearchBedrockRerankingConfiguration$ = exports.ValidityTerm$ = exports.ValidatorMetric$ = exports.Validator$ = exports.ValidationDetails$ = exports.ValidationDataConfig$ = exports.UpdateProvisionedModelThroughputResponse$ = exports.UpdateProvisionedModelThroughputRequest$ = exports.UpdateMarketplaceModelEndpointResponse$ = exports.UpdateMarketplaceModelEndpointRequest$ = exports.UpdateGuardrailResponse$ = exports.UpdateGuardrailRequest$ = exports.UpdateCustomModelDeploymentResponse$ = exports.UpdateCustomModelDeploymentRequest$ = exports.UpdateAutomatedReasoningPolicyTestCaseResponse$ = exports.UpdateAutomatedReasoningPolicyTestCaseRequest$ = exports.UpdateAutomatedReasoningPolicyResponse$ = exports.UpdateAutomatedReasoningPolicyRequest$ = exports.UpdateAutomatedReasoningPolicyAnnotationsResponse$ = exports.UpdateAutomatedReasoningPolicyAnnotationsRequest$ = exports.UntagResourceResponse$ = exports.UntagResourceRequest$ = exports.TrainingMetrics$ = exports.TrainingDetails$ = exports.TrainingDataConfig$ = exports.TextInferenceConfig$ = void 0;
exports.GetAutomatedReasoningPolicyBuildWorkflowResultAssets$ = exports.GetAutomatedReasoningPolicyBuildWorkflow$ = exports.GetAutomatedReasoningPolicyAnnotations$ = exports.GetAutomatedReasoningPolicy$ = exports.ExportAutomatedReasoningPolicyVersion$ = exports.DeregisterMarketplaceModelEndpoint$ = exports.DeleteResourcePolicy$ = exports.DeleteProvisionedModelThroughput$ = exports.DeletePromptRouter$ = exports.DeleteModelInvocationLoggingConfiguration$ = exports.DeleteMarketplaceModelEndpoint$ = exports.DeleteInferenceProfile$ = exports.DeleteImportedModel$ = exports.DeleteGuardrail$ = exports.DeleteFoundationModelAgreement$ = exports.DeleteEnforcedGuardrailConfiguration$ = exports.DeleteCustomModelDeployment$ = exports.DeleteCustomModel$ = exports.DeleteAutomatedReasoningPolicyTestCase$ = exports.DeleteAutomatedReasoningPolicyBuildWorkflow$ = exports.DeleteAutomatedReasoningPolicy$ = exports.CreateProvisionedModelThroughput$ = exports.CreatePromptRouter$ = exports.CreateModelInvocationJob$ = exports.CreateModelImportJob$ = exports.CreateModelCustomizationJob$ = exports.CreateModelCopyJob$ = exports.CreateMarketplaceModelEndpoint$ = exports.CreateInferenceProfile$ = exports.CreateGuardrailVersion$ = exports.CreateGuardrail$ = exports.CreateFoundationModelAgreement$ = exports.CreateEvaluationJob$ = exports.CreateCustomModelDeployment$ = exports.CreateCustomModel$ = exports.CreateAutomatedReasoningPolicyVersion$ = exports.CreateAutomatedReasoningPolicyTestCase$ = exports.CreateAutomatedReasoningPolicy$ = exports.CancelAutomatedReasoningPolicyBuildWorkflow$ = exports.BatchDeleteEvaluationJob$ = exports.RetrievalFilter$ = exports.RerankingMetadataSelectiveModeConfiguration$ = exports.RequestMetadataFilters$ = exports.RatingScaleItemValue$ = exports.RAGConfig$ = exports.ModelInvocationJobOutputDataConfig$ = exports.ModelInvocationJobInputDataConfig$ = exports.ModelDataSource$ = exports.KnowledgeBaseConfig$ = exports.InvocationLogSource$ = void 0;
exports.StopEvaluationJob$ = exports.StartAutomatedReasoningPolicyTestWorkflow$ = exports.StartAutomatedReasoningPolicyBuildWorkflow$ = exports.RegisterMarketplaceModelEndpoint$ = exports.PutUseCaseForModelAccess$ = exports.PutResourcePolicy$ = exports.PutModelInvocationLoggingConfiguration$ = exports.PutEnforcedGuardrailConfiguration$ = exports.ListTagsForResource$ = exports.ListProvisionedModelThroughputs$ = exports.ListPromptRouters$ = exports.ListModelInvocationJobs$ = exports.ListModelImportJobs$ = exports.ListModelCustomizationJobs$ = exports.ListModelCopyJobs$ = exports.ListMarketplaceModelEndpoints$ = exports.ListInferenceProfiles$ = exports.ListImportedModels$ = exports.ListGuardrails$ = exports.ListFoundationModels$ = exports.ListFoundationModelAgreementOffers$ = exports.ListEvaluationJobs$ = exports.ListEnforcedGuardrailsConfiguration$ = exports.ListCustomModels$ = exports.ListCustomModelDeployments$ = exports.ListAutomatedReasoningPolicyTestResults$ = exports.ListAutomatedReasoningPolicyTestCases$ = exports.ListAutomatedReasoningPolicyBuildWorkflows$ = exports.ListAutomatedReasoningPolicies$ = exports.GetUseCaseForModelAccess$ = exports.GetResourcePolicy$ = exports.GetProvisionedModelThroughput$ = exports.GetPromptRouter$ = exports.GetModelInvocationLoggingConfiguration$ = exports.GetModelInvocationJob$ = exports.GetModelImportJob$ = exports.GetModelCustomizationJob$ = exports.GetModelCopyJob$ = exports.GetMarketplaceModelEndpoint$ = exports.GetInferenceProfile$ = exports.GetImportedModel$ = exports.GetGuardrail$ = exports.GetFoundationModelAvailability$ = exports.GetFoundationModel$ = exports.GetEvaluationJob$ = exports.GetCustomModelDeployment$ = exports.GetCustomModel$ = exports.GetAutomatedReasoningPolicyTestResult$ = exports.GetAutomatedReasoningPolicyTestCase$ = exports.GetAutomatedReasoningPolicyNextScenario$ = void 0;
exports.UpdateProvisionedModelThroughput$ = exports.UpdateMarketplaceModelEndpoint$ = exports.UpdateGuardrail$ = exports.UpdateCustomModelDeployment$ = exports.UpdateAutomatedReasoningPolicyTestCase$ = exports.UpdateAutomatedReasoningPolicyAnnotations$ = exports.UpdateAutomatedReasoningPolicy$ = exports.UntagResource$ = exports.TagResource$ = exports.StopModelInvocationJob$ = exports.StopModelCustomizationJob$ = void 0;
const _AA = "AgreementAvailability";
const _ADE = "AccessDeniedException";
const _AEC = "AutomatedEvaluationConfig";
const _AECM = "AutomatedEvaluationCustomMetrics";
const _AECMC = "AutomatedEvaluationCustomMetricConfig";
const _AECMS = "AutomatedEvaluationCustomMetricSource";
const _AEGIIC = "AccountEnforcedGuardrailInferenceInputConfiguration";
const _AEGOC = "AccountEnforcedGuardrailOutputConfiguration";
const _AEGOCc = "AccountEnforcedGuardrailsOutputConfiguration";
const _ARCDSL = "AutomatedReasoningCheckDifferenceScenarioList";
const _ARCF = "AutomatedReasoningCheckFinding";
const _ARCFL = "AutomatedReasoningCheckFindingList";
const _ARCIF = "AutomatedReasoningCheckImpossibleFinding";
const _ARCIFu = "AutomatedReasoningCheckInvalidFinding";
const _ARCITR = "AutomatedReasoningCheckInputTextReference";
const _ARCITRL = "AutomatedReasoningCheckInputTextReferenceList";
const _ARCLW = "AutomatedReasoningCheckLogicWarning";
const _ARCNTF = "AutomatedReasoningCheckNoTranslationsFinding";
const _ARCR = "AutomatedReasoningCheckRule";
const _ARCRL = "AutomatedReasoningCheckRuleList";
const _ARCS = "AutomatedReasoningCheckScenario";
const _ARCSF = "AutomatedReasoningCheckSatisfiableFinding";
const _ARCT = "AutomatedReasoningCheckTranslation";
const _ARCTAF = "AutomatedReasoningCheckTranslationAmbiguousFinding";
const _ARCTCF = "AutomatedReasoningCheckTooComplexFinding";
const _ARCTL = "AutomatedReasoningCheckTranslationList";
const _ARCTO = "AutomatedReasoningCheckTranslationOption";
const _ARCTOL = "AutomatedReasoningCheckTranslationOptionList";
const _ARCVF = "AutomatedReasoningCheckValidFinding";
const _ARLS = "AutomatedReasoningLogicStatement";
const _ARLSC = "AutomatedReasoningLogicStatementContent";
const _ARLSL = "AutomatedReasoningLogicStatementList";
const _ARNLSC = "AutomatedReasoningNaturalLanguageStatementContent";
const _ARPA = "AutomatedReasoningPolicyAnnotation";
const _ARPAC = "AutomatedReasoningPolicyAnnotatedChunk";
const _ARPACL = "AutomatedReasoningPolicyAnnotatedChunkList";
const _ARPACLu = "AutomatedReasoningPolicyAnnotatedContentList";
const _ARPACu = "AutomatedReasoningPolicyAnnotatedContent";
const _ARPAFNL = "AutomatedReasoningPolicyAnnotationFeedbackNaturalLanguage";
const _ARPAIC = "AutomatedReasoningPolicyAnnotationIngestContent";
const _ARPAL = "AutomatedReasoningPolicyAnnotatedLine";
const _ARPALu = "AutomatedReasoningPolicyAnnotationList";
const _ARPARA = "AutomatedReasoningPolicyAddRuleAnnotation";
const _ARPARFNLA = "AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation";
const _ARPARM = "AutomatedReasoningPolicyAddRuleMutation";
const _ARPARNL = "AutomatedReasoningPolicyAnnotationRuleNaturalLanguage";
const _ARPAS = "AutomatedReasoningPolicyAtomicStatement";
const _ARPASL = "AutomatedReasoningPolicyAtomicStatementList";
const _ARPATA = "AutomatedReasoningPolicyAddTypeAnnotation";
const _ARPATM = "AutomatedReasoningPolicyAddTypeMutation";
const _ARPATV = "AutomatedReasoningPolicyAddTypeValue";
const _ARPAVA = "AutomatedReasoningPolicyAddVariableAnnotation";
const _ARPAVM = "AutomatedReasoningPolicyAddVariableMutation";
const _ARPBDB = "AutomatedReasoningPolicyBuildDocumentBlob";
const _ARPBDD = "AutomatedReasoningPolicyBuildDocumentDescription";
const _ARPBDN = "AutomatedReasoningPolicyBuildDocumentName";
const _ARPBL = "AutomatedReasoningPolicyBuildLog";
const _ARPBLE = "AutomatedReasoningPolicyBuildLogEntry";
const _ARPBLEL = "AutomatedReasoningPolicyBuildLogEntryList";
const _ARPBRA = "AutomatedReasoningPolicyBuildResultAssets";
const _ARPBRAM = "AutomatedReasoningPolicyBuildResultAssetManifest";
const _ARPBRAME = "AutomatedReasoningPolicyBuildResultAssetManifestEntry";
const _ARPBRAML = "AutomatedReasoningPolicyBuildResultAssetManifestList";
const _ARPBRAN = "AutomatedReasoningPolicyBuildResultAssetName";
const _ARPBS = "AutomatedReasoningPolicyBuildStep";
const _ARPBSC = "AutomatedReasoningPolicyBuildStepContext";
const _ARPBSL = "AutomatedReasoningPolicyBuildStepList";
const _ARPBSM = "AutomatedReasoningPolicyBuildStepMessage";
const _ARPBSML = "AutomatedReasoningPolicyBuildStepMessageList";
const _ARPBWD = "AutomatedReasoningPolicyBuildWorkflowDocument";
const _ARPBWDL = "AutomatedReasoningPolicyBuildWorkflowDocumentList";
const _ARPBWRC = "AutomatedReasoningPolicyBuildWorkflowRepairContent";
const _ARPBWS = "AutomatedReasoningPolicyBuildWorkflowSource";
const _ARPBWSu = "AutomatedReasoningPolicyBuildWorkflowSummary";
const _ARPBWSut = "AutomatedReasoningPolicyBuildWorkflowSummaries";
const _ARPD = "AutomatedReasoningPolicyDescription";
const _ARPDE = "AutomatedReasoningPolicyDefinitionElement";
const _ARPDQR = "AutomatedReasoningPolicyDefinitionQualityReport";
const _ARPDR = "AutomatedReasoningPolicyDefinitionRule";
const _ARPDRA = "AutomatedReasoningPolicyDeleteRuleAnnotation";
const _ARPDRAE = "AutomatedReasoningPolicyDefinitionRuleAlternateExpression";
const _ARPDRE = "AutomatedReasoningPolicyDefinitionRuleExpression";
const _ARPDRL = "AutomatedReasoningPolicyDefinitionRuleList";
const _ARPDRM = "AutomatedReasoningPolicyDeleteRuleMutation";
const _ARPDRS = "AutomatedReasoningPolicyDisjointRuleSet";
const _ARPDRSL = "AutomatedReasoningPolicyDisjointRuleSetList";
const _ARPDT = "AutomatedReasoningPolicyDefinitionType";
const _ARPDTA = "AutomatedReasoningPolicyDeleteTypeAnnotation";
const _ARPDTD = "AutomatedReasoningPolicyDefinitionTypeDescription";
const _ARPDTL = "AutomatedReasoningPolicyDefinitionTypeList";
const _ARPDTM = "AutomatedReasoningPolicyDeleteTypeMutation";
const _ARPDTN = "AutomatedReasoningPolicyDefinitionTypeName";
const _ARPDTNL = "AutomatedReasoningPolicyDefinitionTypeNameList";
const _ARPDTV = "AutomatedReasoningPolicyDefinitionTypeValue";
const _ARPDTVD = "AutomatedReasoningPolicyDefinitionTypeValueDescription";
const _ARPDTVL = "AutomatedReasoningPolicyDefinitionTypeValueList";
const _ARPDTVP = "AutomatedReasoningPolicyDefinitionTypeValuePair";
const _ARPDTVPL = "AutomatedReasoningPolicyDefinitionTypeValuePairList";
const _ARPDTVu = "AutomatedReasoningPolicyDeleteTypeValue";
const _ARPDV = "AutomatedReasoningPolicyDefinitionVariable";
const _ARPDVA = "AutomatedReasoningPolicyDeleteVariableAnnotation";
const _ARPDVD = "AutomatedReasoningPolicyDefinitionVariableDescription";
const _ARPDVL = "AutomatedReasoningPolicyDefinitionVariableList";
const _ARPDVM = "AutomatedReasoningPolicyDeleteVariableMutation";
const _ARPDVN = "AutomatedReasoningPolicyDefinitionVariableName";
const _ARPDVNL = "AutomatedReasoningPolicyDefinitionVariableNameList";
const _ARPDu = "AutomatedReasoningPolicyDefinition";
const _ARPFR = "AutomatedReasoningPolicyFidelityReport";
const _ARPGFRC = "AutomatedReasoningPolicyGenerateFidelityReportContent";
const _ARPGFRDL = "AutomatedReasoningPolicyGenerateFidelityReportDocumentList";
const _ARPGTC = "AutomatedReasoningPolicyGeneratedTestCase";
const _ARPGTCL = "AutomatedReasoningPolicyGeneratedTestCaseList";
const _ARPGTCu = "AutomatedReasoningPolicyGeneratedTestCases";
const _ARPICA = "AutomatedReasoningPolicyIngestContentAnnotation";
const _ARPJL = "AutomatedReasoningPolicyJustificationList";
const _ARPJT = "AutomatedReasoningPolicyJustificationText";
const _ARPLT = "AutomatedReasoningPolicyLineText";
const _ARPM = "AutomatedReasoningPolicyMutation";
const _ARPN = "AutomatedReasoningPolicyName";
const _ARPP = "AutomatedReasoningPolicyPlanning";
const _ARPRR = "AutomatedReasoningPolicyRuleReport";
const _ARPRRM = "AutomatedReasoningPolicyRuleReportMap";
const _ARPRSD = "AutomatedReasoningPolicyReportSourceDocument";
const _ARPRSDL = "AutomatedReasoningPolicyReportSourceDocumentList";
const _ARPS = "AutomatedReasoningPolicyScenario";
const _ARPSAE = "AutomatedReasoningPolicyScenarioAlternateExpression";
const _ARPSD = "AutomatedReasoningPolicySourceDocument";
const _ARPSE = "AutomatedReasoningPolicyScenarioExpression";
const _ARPSL = "AutomatedReasoningPolicyStatementLocation";
const _ARPSLu = "AutomatedReasoningPolicyScenarioList";
const _ARPSR = "AutomatedReasoningPolicyStatementReference";
const _ARPSRL = "AutomatedReasoningPolicyStatementReferenceList";
const _ARPST = "AutomatedReasoningPolicyStatementText";
const _ARPSu = "AutomatedReasoningPolicyScenarios";
const _ARPSut = "AutomatedReasoningPolicySummary";
const _ARPSuto = "AutomatedReasoningPolicySummaries";
const _ARPTC = "AutomatedReasoningPolicyTestCase";
const _ARPTCL = "AutomatedReasoningPolicyTestCaseList";
const _ARPTGC = "AutomatedReasoningPolicyTestGuardContent";
const _ARPTL = "AutomatedReasoningPolicyTestList";
const _ARPTQC = "AutomatedReasoningPolicyTestQueryContent";
const _ARPTR = "AutomatedReasoningPolicyTestResult";
const _ARPTVA = "AutomatedReasoningPolicyTypeValueAnnotation";
const _ARPTVAL = "AutomatedReasoningPolicyTypeValueAnnotationList";
const _ARPUFRFA = "AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation";
const _ARPUFSFA = "AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation";
const _ARPURA = "AutomatedReasoningPolicyUpdateRuleAnnotation";
const _ARPURM = "AutomatedReasoningPolicyUpdateRuleMutation";
const _ARPUTA = "AutomatedReasoningPolicyUpdateTypeAnnotation";
const _ARPUTM = "AutomatedReasoningPolicyUpdateTypeMutation";
const _ARPUTV = "AutomatedReasoningPolicyUpdateTypeValue";
const _ARPUVA = "AutomatedReasoningPolicyUpdateVariableAnnotation";
const _ARPUVM = "AutomatedReasoningPolicyUpdateVariableMutation";
const _ARPVR = "AutomatedReasoningPolicyVariableReport";
const _ARPVRM = "AutomatedReasoningPolicyVariableReportMap";
const _ARPWTC = "AutomatedReasoningPolicyWorkflowTypeContent";
const _BCB = "ByteContentBlob";
const _BCD = "ByteContentDoc";
const _BDEJ = "BatchDeleteEvaluationJob";
const _BDEJE = "BatchDeleteEvaluationJobError";
const _BDEJEa = "BatchDeleteEvaluationJobErrors";
const _BDEJI = "BatchDeleteEvaluationJobItem";
const _BDEJIa = "BatchDeleteEvaluationJobItems";
const _BDEJR = "BatchDeleteEvaluationJobRequest";
const _BDEJRa = "BatchDeleteEvaluationJobResponse";
const _BEM = "BedrockEvaluatorModel";
const _BEMe = "BedrockEvaluatorModels";
const _CARP = "CreateAutomatedReasoningPolicy";
const _CARPBW = "CancelAutomatedReasoningPolicyBuildWorkflow";
const _CARPBWR = "CancelAutomatedReasoningPolicyBuildWorkflowRequest";
const _CARPBWRa = "CancelAutomatedReasoningPolicyBuildWorkflowResponse";
const _CARPR = "CreateAutomatedReasoningPolicyRequest";
const _CARPRr = "CreateAutomatedReasoningPolicyResponse";
const _CARPTC = "CreateAutomatedReasoningPolicyTestCase";
const _CARPTCR = "CreateAutomatedReasoningPolicyTestCaseRequest";
const _CARPTCRr = "CreateAutomatedReasoningPolicyTestCaseResponse";
const _CARPV = "CreateAutomatedReasoningPolicyVersion";
const _CARPVR = "CreateAutomatedReasoningPolicyVersionRequest";
const _CARPVRr = "CreateAutomatedReasoningPolicyVersionResponse";
const _CC = "CustomizationConfig";
const _CCM = "CreateCustomModel";
const _CCMD = "CreateCustomModelDeployment";
const _CCMDR = "CreateCustomModelDeploymentRequest";
const _CCMDRr = "CreateCustomModelDeploymentResponse";
const _CCMR = "CreateCustomModelRequest";
const _CCMRr = "CreateCustomModelResponse";
const _CE = "ConflictException";
const _CEJ = "CreateEvaluationJob";
const _CEJR = "CreateEvaluationJobRequest";
const _CEJRr = "CreateEvaluationJobResponse";
const _CFMA = "CreateFoundationModelAgreement";
const _CFMAR = "CreateFoundationModelAgreementRequest";
const _CFMARr = "CreateFoundationModelAgreementResponse";
const _CG = "CreateGuardrail";
const _CGR = "CreateGuardrailRequest";
const _CGRr = "CreateGuardrailResponse";
const _CGV = "CreateGuardrailVersion";
const _CGVR = "CreateGuardrailVersionRequest";
const _CGVRr = "CreateGuardrailVersionResponse";
const _CIP = "CreateInferenceProfile";
const _CIPR = "CreateInferenceProfileRequest";
const _CIPRr = "CreateInferenceProfileResponse";
const _CMBEM = "CustomMetricBedrockEvaluatorModel";
const _CMBEMu = "CustomMetricBedrockEvaluatorModels";
const _CMCJ = "CreateModelCopyJob";
const _CMCJR = "CreateModelCopyJobRequest";
const _CMCJRr = "CreateModelCopyJobResponse";
const _CMCJRre = "CreateModelCustomizationJobRequest";
const _CMCJRrea = "CreateModelCustomizationJobResponse";
const _CMCJr = "CreateModelCustomizationJob";
const _CMD = "CustomMetricDefinition";
const _CMDS = "CustomModelDeploymentSummary";
const _CMDSL = "CustomModelDeploymentSummaryList";
const _CMDUD = "CustomModelDeploymentUpdateDetails";
const _CMEMC = "CustomMetricEvaluatorModelConfig";
const _CMIJ = "CreateModelImportJob";
const _CMIJR = "CreateModelImportJobRequest";
const _CMIJRr = "CreateModelImportJobResponse";
const _CMIJRre = "CreateModelInvocationJobRequest";
const _CMIJRrea = "CreateModelInvocationJobResponse";
const _CMIJr = "CreateModelInvocationJob";
const _CMME = "CreateMarketplaceModelEndpoint";
const _CMMER = "CreateMarketplaceModelEndpointRequest";
const _CMMERr = "CreateMarketplaceModelEndpointResponse";
const _CMS = "CustomModelSummary";
const _CMSL = "CustomModelSummaryList";
const _CMU = "CustomModelUnits";
const _CPMT = "CreateProvisionedModelThroughput";
const _CPMTR = "CreateProvisionedModelThroughputRequest";
const _CPMTRr = "CreateProvisionedModelThroughputResponse";
const _CPR = "CreatePromptRouter";
const _CPRR = "CreatePromptRouterRequest";
const _CPRRr = "CreatePromptRouterResponse";
const _CWC = "CloudWatchConfig";
const _DARP = "DeleteAutomatedReasoningPolicy";
const _DARPBW = "DeleteAutomatedReasoningPolicyBuildWorkflow";
const _DARPBWR = "DeleteAutomatedReasoningPolicyBuildWorkflowRequest";
const _DARPBWRe = "DeleteAutomatedReasoningPolicyBuildWorkflowResponse";
const _DARPR = "DeleteAutomatedReasoningPolicyRequest";
const _DARPRe = "DeleteAutomatedReasoningPolicyResponse";
const _DARPTC = "DeleteAutomatedReasoningPolicyTestCase";
const _DARPTCR = "DeleteAutomatedReasoningPolicyTestCaseRequest";
const _DARPTCRe = "DeleteAutomatedReasoningPolicyTestCaseResponse";
const _DC = "DistillationConfig";
const _DCM = "DeleteCustomModel";
const _DCMD = "DeleteCustomModelDeployment";
const _DCMDR = "DeleteCustomModelDeploymentRequest";
const _DCMDRe = "DeleteCustomModelDeploymentResponse";
const _DCMR = "DeleteCustomModelRequest";
const _DCMRe = "DeleteCustomModelResponse";
const _DEGC = "DeleteEnforcedGuardrailConfiguration";
const _DEGCR = "DeleteEnforcedGuardrailConfigurationRequest";
const _DEGCRe = "DeleteEnforcedGuardrailConfigurationResponse";
const _DFMA = "DeleteFoundationModelAgreement";
const _DFMAR = "DeleteFoundationModelAgreementRequest";
const _DFMARe = "DeleteFoundationModelAgreementResponse";
const _DG = "DeleteGuardrail";
const _DGR = "DeleteGuardrailRequest";
const _DGRe = "DeleteGuardrailResponse";
const _DIM = "DeleteImportedModel";
const _DIMR = "DeleteImportedModelRequest";
const _DIMRe = "DeleteImportedModelResponse";
const _DIP = "DeleteInferenceProfile";
const _DIPR = "DeleteInferenceProfileRequest";
const _DIPRe = "DeleteInferenceProfileResponse";
const _DMILC = "DeleteModelInvocationLoggingConfiguration";
const _DMILCR = "DeleteModelInvocationLoggingConfigurationRequest";
const _DMILCRe = "DeleteModelInvocationLoggingConfigurationResponse";
const _DMME = "DeleteMarketplaceModelEndpoint";
const _DMMER = "DeleteMarketplaceModelEndpointRequest";
const _DMMERe = "DeleteMarketplaceModelEndpointResponse";
const _DMMERer = "DeregisterMarketplaceModelEndpointRequest";
const _DMMERere = "DeregisterMarketplaceModelEndpointResponse";
const _DMMEe = "DeregisterMarketplaceModelEndpoint";
const _DPD = "DataProcessingDetails";
const _DPMT = "DeleteProvisionedModelThroughput";
const _DPMTR = "DeleteProvisionedModelThroughputRequest";
const _DPMTRe = "DeleteProvisionedModelThroughputResponse";
const _DPR = "DimensionalPriceRate";
const _DPRR = "DeletePromptRouterRequest";
const _DPRRe = "DeletePromptRouterResponse";
const _DPRe = "DeletePromptRouter";
const _DRP = "DeleteResourcePolicy";
const _DRPR = "DeleteResourcePolicyRequest";
const _DRPRe = "DeleteResourcePolicyResponse";
const _EARPV = "ExportAutomatedReasoningPolicyVersion";
const _EARPVR = "ExportAutomatedReasoningPolicyVersionRequest";
const _EARPVRx = "ExportAutomatedReasoningPolicyVersionResponse";
const _EBM = "EvaluationBedrockModel";
const _EC = "EndpointConfig";
const _ECv = "EvaluationConfig";
const _ED = "EvaluationDataset";
const _EDL = "EvaluationDatasetLocation";
const _EDMC = "EvaluationDatasetMetricConfig";
const _EDMCv = "EvaluationDatasetMetricConfigs";
const _EDN = "EvaluationDatasetName";
const _EIC = "EvaluationInferenceConfig";
const _EICS = "EvaluationInferenceConfigSummary";
const _EJD = "EvaluationJobDescription";
const _EJI = "EvaluationJobIdentifier";
const _EJIv = "EvaluationJobIdentifiers";
const _EMC = "EvaluationModelConfigs";
const _EMCS = "EvaluationModelConfigSummary";
const _EMCv = "EvaluationModelConfig";
const _EMCva = "EvaluatorModelConfig";
const _EMD = "EvaluationMetricDescription";
const _EMIP = "EvaluationModelInferenceParams";
const _EMN = "EvaluationMetricName";
const _EMNv = "EvaluationMetricNames";
const _EODC = "EvaluationOutputDataConfig";
const _EPIS = "EvaluationPrecomputedInferenceSource";
const _EPRAGSC = "EvaluationPrecomputedRetrieveAndGenerateSourceConfig";
const _EPRSC = "EvaluationPrecomputedRetrieveSourceConfig";
const _EPRSCv = "EvaluationPrecomputedRagSourceConfig";
const _ERCS = "EvaluationRagConfigSummary";
const _ES = "EvaluationSummary";
const _ESGC = "ExternalSourcesGenerationConfiguration";
const _ESRAGC = "ExternalSourcesRetrieveAndGenerateConfiguration";
const _ESv = "EvaluationSummaries";
const _ESx = "ExternalSource";
const _ESxt = "ExternalSources";
const _FA = "FilterAttribute";
const _FFR = "FieldForReranking";
const _FFRi = "FieldsForReranking";
const _FMD = "FoundationModelDetails";
const _FML = "FoundationModelLifecycle";
const _FMS = "FoundationModelSummary";
const _FMSL = "FoundationModelSummaryList";
const _GARP = "GuardrailAutomatedReasoningPolicy";
const _GARPA = "GetAutomatedReasoningPolicyAnnotations";
const _GARPAR = "GetAutomatedReasoningPolicyAnnotationsRequest";
const _GARPARe = "GetAutomatedReasoningPolicyAnnotationsResponse";
const _GARPBW = "GetAutomatedReasoningPolicyBuildWorkflow";
const _GARPBWR = "GetAutomatedReasoningPolicyBuildWorkflowRequest";
const _GARPBWRA = "GetAutomatedReasoningPolicyBuildWorkflowResultAssets";
const _GARPBWRAR = "GetAutomatedReasoningPolicyBuildWorkflowResultAssetsRequest";
const _GARPBWRARe = "GetAutomatedReasoningPolicyBuildWorkflowResultAssetsResponse";
const _GARPBWRe = "GetAutomatedReasoningPolicyBuildWorkflowResponse";
const _GARPC = "GuardrailAutomatedReasoningPolicyConfig";
const _GARPNS = "GetAutomatedReasoningPolicyNextScenario";
const _GARPNSR = "GetAutomatedReasoningPolicyNextScenarioRequest";
const _GARPNSRe = "GetAutomatedReasoningPolicyNextScenarioResponse";
const _GARPR = "GetAutomatedReasoningPolicyRequest";
const _GARPRe = "GetAutomatedReasoningPolicyResponse";
const _GARPTC = "GetAutomatedReasoningPolicyTestCase";
const _GARPTCR = "GetAutomatedReasoningPolicyTestCaseRequest";
const _GARPTCRe = "GetAutomatedReasoningPolicyTestCaseResponse";
const _GARPTR = "GetAutomatedReasoningPolicyTestResult";
const _GARPTRR = "GetAutomatedReasoningPolicyTestResultRequest";
const _GARPTRRe = "GetAutomatedReasoningPolicyTestResultResponse";
const _GARPe = "GetAutomatedReasoningPolicy";
const _GBM = "GuardrailBlockedMessaging";
const _GC = "GenerationConfiguration";
const _GCF = "GuardrailContentFilter";
const _GCFA = "GuardrailContentFilterAction";
const _GCFC = "GuardrailContentFilterConfig";
const _GCFCu = "GuardrailContentFiltersConfig";
const _GCFT = "GuardrailContentFiltersTier";
const _GCFTC = "GuardrailContentFiltersTierConfig";
const _GCFTN = "GuardrailContentFiltersTierName";
const _GCFu = "GuardrailContentFilters";
const _GCGA = "GuardrailContextualGroundingAction";
const _GCGF = "GuardrailContextualGroundingFilter";
const _GCGFC = "GuardrailContextualGroundingFilterConfig";
const _GCGFCu = "GuardrailContextualGroundingFiltersConfig";
const _GCGFu = "GuardrailContextualGroundingFilters";
const _GCGP = "GuardrailContextualGroundingPolicy";
const _GCGPC = "GuardrailContextualGroundingPolicyConfig";
const _GCM = "GetCustomModel";
const _GCMD = "GetCustomModelDeployment";
const _GCMDR = "GetCustomModelDeploymentRequest";
const _GCMDRe = "GetCustomModelDeploymentResponse";
const _GCMR = "GetCustomModelRequest";
const _GCMRe = "GetCustomModelResponse";
const _GCP = "GuardrailContentPolicy";
const _GCPC = "GuardrailContentPolicyConfig";
const _GCRC = "GuardrailCrossRegionConfig";
const _GCRD = "GuardrailCrossRegionDetails";
const _GCr = "GraderConfig";
const _GCu = "GuardrailConfiguration";
const _GD = "GuardrailDescription";
const _GEJ = "GetEvaluationJob";
const _GEJR = "GetEvaluationJobRequest";
const _GEJRe = "GetEvaluationJobResponse";
const _GFM = "GetFoundationModel";
const _GFMA = "GetFoundationModelAvailability";
const _GFMAR = "GetFoundationModelAvailabilityRequest";
const _GFMARe = "GetFoundationModelAvailabilityResponse";
const _GFMR = "GetFoundationModelRequest";
const _GFMRe = "GetFoundationModelResponse";
const _GFR = "GuardrailFailureRecommendation";
const _GFRu = "GuardrailFailureRecommendations";
const _GG = "GetGuardrail";
const _GGR = "GetGuardrailRequest";
const _GGRe = "GetGuardrailResponse";
const _GIM = "GetImportedModel";
const _GIMR = "GetImportedModelRequest";
const _GIMRe = "GetImportedModelResponse";
const _GIP = "GetInferenceProfile";
const _GIPR = "GetInferenceProfileRequest";
const _GIPRe = "GetInferenceProfileResponse";
const _GM = "GuardrailModality";
const _GMCJ = "GetModelCopyJob";
const _GMCJR = "GetModelCopyJobRequest";
const _GMCJRe = "GetModelCopyJobResponse";
const _GMCJRet = "GetModelCustomizationJobRequest";
const _GMCJReto = "GetModelCustomizationJobResponse";
const _GMCJe = "GetModelCustomizationJob";
const _GMIJ = "GetModelImportJob";
const _GMIJR = "GetModelImportJobRequest";
const _GMIJRe = "GetModelImportJobResponse";
const _GMIJRet = "GetModelInvocationJobRequest";
const _GMIJReto = "GetModelInvocationJobResponse";
const _GMIJe = "GetModelInvocationJob";
const _GMILC = "GetModelInvocationLoggingConfiguration";
const _GMILCR = "GetModelInvocationLoggingConfigurationRequest";
const _GMILCRe = "GetModelInvocationLoggingConfigurationResponse";
const _GMME = "GetMarketplaceModelEndpoint";
const _GMMER = "GetMarketplaceModelEndpointRequest";
const _GMMERe = "GetMarketplaceModelEndpointResponse";
const _GMW = "GuardrailManagedWords";
const _GMWC = "GuardrailManagedWordsConfig";
const _GMWL = "GuardrailManagedWordLists";
const _GMWLC = "GuardrailManagedWordListsConfig";
const _GMu = "GuardrailModalities";
const _GN = "GuardrailName";
const _GPE = "GuardrailPiiEntity";
const _GPEC = "GuardrailPiiEntityConfig";
const _GPECu = "GuardrailPiiEntitiesConfig";
const _GPEu = "GuardrailPiiEntities";
const _GPMT = "GetProvisionedModelThroughput";
const _GPMTR = "GetProvisionedModelThroughputRequest";
const _GPMTRe = "GetProvisionedModelThroughputResponse";
const _GPR = "GetPromptRouter";
const _GPRR = "GetPromptRouterRequest";
const _GPRRe = "GetPromptRouterResponse";
const _GR = "GuardrailRegex";
const _GRC = "GuardrailRegexConfig";
const _GRCu = "GuardrailRegexesConfig";
const _GRP = "GetResourcePolicy";
const _GRPR = "GetResourcePolicyRequest";
const _GRPRe = "GetResourcePolicyResponse";
const _GRu = "GuardrailRegexes";
const _GS = "GuardrailSummary";
const _GSIP = "GuardrailSensitiveInformationPolicy";
const _GSIPC = "GuardrailSensitiveInformationPolicyConfig";
const _GSR = "GuardrailStatusReason";
const _GSRu = "GuardrailStatusReasons";
const _GSu = "GuardrailSummaries";
const _GT = "GuardrailTopic";
const _GTA = "GuardrailTopicAction";
const _GTC = "GuardrailTopicConfig";
const _GTCu = "GuardrailTopicsConfig";
const _GTD = "GuardrailTopicDefinition";
const _GTE = "GuardrailTopicExample";
const _GTEu = "GuardrailTopicExamples";
const _GTN = "GuardrailTopicName";
const _GTP = "GuardrailTopicPolicy";
const _GTPC = "GuardrailTopicPolicyConfig";
const _GTT = "GuardrailTopicsTier";
const _GTTC = "GuardrailTopicsTierConfig";
const _GTTN = "GuardrailTopicsTierName";
const _GTu = "GuardrailTopics";
const _GUCFMA = "GetUseCaseForModelAccess";
const _GUCFMAR = "GetUseCaseForModelAccessRequest";
const _GUCFMARe = "GetUseCaseForModelAccessResponse";
const _GW = "GuardrailWord";
const _GWA = "GuardrailWordAction";
const _GWC = "GuardrailWordConfig";
const _GWCu = "GuardrailWordsConfig";
const _GWP = "GuardrailWordPolicy";
const _GWPC = "GuardrailWordPolicyConfig";
const _GWu = "GuardrailWords";
const _HEC = "HumanEvaluationConfig";
const _HECM = "HumanEvaluationCustomMetric";
const _HECMu = "HumanEvaluationCustomMetrics";
const _HTI = "HumanTaskInstructions";
const _HWC = "HumanWorkflowConfig";
const _I = "Identifier";
const _IFC = "ImplicitFilterConfiguration";
const _ILC = "InvocationLogsConfig";
const _ILS = "InvocationLogSource";
const _IMS = "ImportedModelSummary";
const _IMSL = "ImportedModelSummaryList";
const _IPD = "InferenceProfileDescription";
const _IPM = "InferenceProfileModel";
const _IPMS = "InferenceProfileModelSource";
const _IPMn = "InferenceProfileModels";
const _IPS = "InferenceProfileSummary";
const _IPSn = "InferenceProfileSummaries";
const _ISE = "InternalServerException";
const _KBC = "KnowledgeBaseConfig";
const _KBRAGC = "KnowledgeBaseRetrieveAndGenerateConfiguration";
const _KBRC = "KnowledgeBaseRetrievalConfiguration";
const _KBVSC = "KnowledgeBaseVectorSearchConfiguration";
const _KIC = "KbInferenceConfig";
const _LARP = "ListAutomatedReasoningPolicies";
const _LARPBW = "ListAutomatedReasoningPolicyBuildWorkflows";
const _LARPBWR = "ListAutomatedReasoningPolicyBuildWorkflowsRequest";
const _LARPBWRi = "ListAutomatedReasoningPolicyBuildWorkflowsResponse";
const _LARPR = "ListAutomatedReasoningPoliciesRequest";
const _LARPRi = "ListAutomatedReasoningPoliciesResponse";
const _LARPTC = "ListAutomatedReasoningPolicyTestCases";
const _LARPTCR = "ListAutomatedReasoningPolicyTestCasesRequest";
const _LARPTCRi = "ListAutomatedReasoningPolicyTestCasesResponse";
const _LARPTR = "ListAutomatedReasoningPolicyTestResults";
const _LARPTRR = "ListAutomatedReasoningPolicyTestResultsRequest";
const _LARPTRRi = "ListAutomatedReasoningPolicyTestResultsResponse";
const _LC = "LoggingConfig";
const _LCM = "ListCustomModels";
const _LCMD = "ListCustomModelDeployments";
const _LCMDR = "ListCustomModelDeploymentsRequest";
const _LCMDRi = "ListCustomModelDeploymentsResponse";
const _LCMR = "ListCustomModelsRequest";
const _LCMRi = "ListCustomModelsResponse";
const _LEGC = "ListEnforcedGuardrailsConfiguration";
const _LEGCR = "ListEnforcedGuardrailsConfigurationRequest";
const _LEGCRi = "ListEnforcedGuardrailsConfigurationResponse";
const _LEJ = "ListEvaluationJobs";
const _LEJR = "ListEvaluationJobsRequest";
const _LEJRi = "ListEvaluationJobsResponse";
const _LFM = "ListFoundationModels";
const _LFMAO = "ListFoundationModelAgreementOffers";
const _LFMAOR = "ListFoundationModelAgreementOffersRequest";
const _LFMAORi = "ListFoundationModelAgreementOffersResponse";
const _LFMR = "ListFoundationModelsRequest";
const _LFMRi = "ListFoundationModelsResponse";
const _LG = "ListGuardrails";
const _LGC = "LambdaGraderConfig";
const _LGR = "ListGuardrailsRequest";
const _LGRi = "ListGuardrailsResponse";
const _LIM = "ListImportedModels";
const _LIMR = "ListImportedModelsRequest";
const _LIMRi = "ListImportedModelsResponse";
const _LIP = "ListInferenceProfiles";
const _LIPR = "ListInferenceProfilesRequest";
const _LIPRi = "ListInferenceProfilesResponse";
const _LMCJ = "ListModelCopyJobs";
const _LMCJR = "ListModelCopyJobsRequest";
const _LMCJRi = "ListModelCopyJobsResponse";
const _LMCJRis = "ListModelCustomizationJobsRequest";
const _LMCJRist = "ListModelCustomizationJobsResponse";
const _LMCJi = "ListModelCustomizationJobs";
const _LMIJ = "ListModelImportJobs";
const _LMIJR = "ListModelImportJobsRequest";
const _LMIJRi = "ListModelImportJobsResponse";
const _LMIJRis = "ListModelInvocationJobsRequest";
const _LMIJRist = "ListModelInvocationJobsResponse";
const _LMIJi = "ListModelInvocationJobs";
const _LMME = "ListMarketplaceModelEndpoints";
const _LMMER = "ListMarketplaceModelEndpointsRequest";
const _LMMERi = "ListMarketplaceModelEndpointsResponse";
const _LPMT = "ListProvisionedModelThroughputs";
const _LPMTR = "ListProvisionedModelThroughputsRequest";
const _LPMTRi = "ListProvisionedModelThroughputsResponse";
const _LPR = "ListPromptRouters";
const _LPRR = "ListPromptRoutersRequest";
const _LPRRi = "ListPromptRoutersResponse";
const _LT = "LegalTerm";
const _LTFR = "ListTagsForResource";
const _LTFRR = "ListTagsForResourceRequest";
const _LTFRRi = "ListTagsForResourceResponse";
const _M = "Message";
const _MAS = "MetadataAttributeSchema";
const _MASL = "MetadataAttributeSchemaList";
const _MCFR = "MetadataConfigurationForReranking";
const _MCJS = "ModelCopyJobSummary";
const _MCJSo = "ModelCustomizationJobSummary";
const _MCJSod = "ModelCopyJobSummaries";
const _MCJSode = "ModelCustomizationJobSummaries";
const _MDS = "ModelDataSource";
const _ME = "ModelEnforcement";
const _MIJIDC = "ModelInvocationJobInputDataConfig";
const _MIJODC = "ModelInvocationJobOutputDataConfig";
const _MIJS = "ModelImportJobSummary";
const _MIJSIDC = "ModelInvocationJobS3InputDataConfig";
const _MIJSODC = "ModelInvocationJobS3OutputDataConfig";
const _MIJSo = "ModelInvocationJobSummary";
const _MIJSod = "ModelImportJobSummaries";
const _MIJSode = "ModelInvocationJobSummaries";
const _MME = "MarketplaceModelEndpoint";
const _MMES = "MarketplaceModelEndpointSummary";
const _MMESa = "MarketplaceModelEndpointSummaries";
const _MN = "MetricName";
const _O = "Offer";
const _OC = "OrchestrationConfiguration";
const _ODC = "OutputDataConfig";
const _Of = "Offers";
const _PC = "PerformanceConfiguration";
const _PEGC = "PutEnforcedGuardrailConfiguration";
const _PEGCR = "PutEnforcedGuardrailConfigurationRequest";
const _PEGCRu = "PutEnforcedGuardrailConfigurationResponse";
const _PMILC = "PutModelInvocationLoggingConfiguration";
const _PMILCR = "PutModelInvocationLoggingConfigurationRequest";
const _PMILCRu = "PutModelInvocationLoggingConfigurationResponse";
const _PMS = "ProvisionedModelSummary";
const _PMSr = "ProvisionedModelSummaries";
const _PRD = "PromptRouterDescription";
const _PRP = "PutResourcePolicy";
const _PRPR = "PutResourcePolicyRequest";
const _PRPRu = "PutResourcePolicyResponse";
const _PRS = "PromptRouterSummary";
const _PRSr = "PromptRouterSummaries";
const _PRTM = "PromptRouterTargetModel";
const _PRTMr = "PromptRouterTargetModels";
const _PT = "PricingTerm";
const _PTr = "PromptTemplate";
const _PUCFMA = "PutUseCaseForModelAccess";
const _PUCFMAR = "PutUseCaseForModelAccessRequest";
const _PUCFMARu = "PutUseCaseForModelAccessResponse";
const _QTC = "QueryTransformationConfiguration";
const _RAGC = "RetrieveAndGenerateConfiguration";
const _RAGCo = "RAGConfig";
const _RC = "RetrieveConfig";
const _RCa = "RagConfigs";
const _RCat = "RateCard";
const _RCo = "RoutingCriteria";
const _RF = "RetrievalFilter";
const _RFL = "RetrievalFilterList";
const _RFTC = "RFTConfig";
const _RFTHP = "RFTHyperParameters";
const _RIUE = "ResourceInUseException";
const _RMBF = "RequestMetadataBaseFilters";
const _RMF = "RequestMetadataFilters";
const _RMFL = "RequestMetadataFiltersList";
const _RMM = "RequestMetadataMap";
const _RMME = "RegisterMarketplaceModelEndpoint";
const _RMMER = "RegisterMarketplaceModelEndpointRequest";
const _RMMERe = "RegisterMarketplaceModelEndpointResponse";
const _RMSMC = "RerankingMetadataSelectiveModeConfiguration";
const _RNFE = "ResourceNotFoundException";
const _RS = "RatingScale";
const _RSI = "RatingScaleItem";
const _RSIV = "RatingScaleItemValue";
const _SARPBW = "StartAutomatedReasoningPolicyBuildWorkflow";
const _SARPBWR = "StartAutomatedReasoningPolicyBuildWorkflowRequest";
const _SARPBWRt = "StartAutomatedReasoningPolicyBuildWorkflowResponse";
const _SARPTW = "StartAutomatedReasoningPolicyTestWorkflow";
const _SARPTWR = "StartAutomatedReasoningPolicyTestWorkflowRequest";
const _SARPTWRt = "StartAutomatedReasoningPolicyTestWorkflowResponse";
const _SC = "S3Config";
const _SCG = "SelectiveContentGuarding";
const _SD = "StatusDetails";
const _SDS = "S3DataSource";
const _SEJ = "StopEvaluationJob";
const _SEJR = "StopEvaluationJobRequest";
const _SEJRt = "StopEvaluationJobResponse";
const _SMCJ = "StopModelCustomizationJob";
const _SMCJR = "StopModelCustomizationJobRequest";
const _SMCJRt = "StopModelCustomizationJobResponse";
const _SME = "SageMakerEndpoint";
const _SMIJ = "StopModelInvocationJob";
const _SMIJR = "StopModelInvocationJobRequest";
const _SMIJRt = "StopModelInvocationJobResponse";
const _SOD = "S3ObjectDoc";
const _SQEE = "ServiceQuotaExceededException";
const _ST = "SupportTerm";
const _SUE = "ServiceUnavailableException";
const _T = "Tag";
const _TD = "TermDetails";
const _TDC = "TrainingDataConfig";
const _TDr = "TrainingDetails";
const _TE = "ThrottlingException";
const _TIC = "TextInferenceConfig";
const _TL = "TagList";
const _TM = "TrainingMetrics";
const _TMC = "TeacherModelConfig";
const _TMTE = "TooManyTagsException";
const _TPT = "TextPromptTemplate";
const _TR = "TagResource";
const _TRR = "TagResourceRequest";
const _TRRa = "TagResourceResponse";
const _UARP = "UpdateAutomatedReasoningPolicy";
const _UARPA = "UpdateAutomatedReasoningPolicyAnnotations";
const _UARPAR = "UpdateAutomatedReasoningPolicyAnnotationsRequest";
const _UARPARp = "UpdateAutomatedReasoningPolicyAnnotationsResponse";
const _UARPR = "UpdateAutomatedReasoningPolicyRequest";
const _UARPRp = "UpdateAutomatedReasoningPolicyResponse";
const _UARPTC = "UpdateAutomatedReasoningPolicyTestCase";
const _UARPTCR = "UpdateAutomatedReasoningPolicyTestCaseRequest";
const _UARPTCRp = "UpdateAutomatedReasoningPolicyTestCaseResponse";
const _UCMD = "UpdateCustomModelDeployment";
const _UCMDR = "UpdateCustomModelDeploymentRequest";
const _UCMDRp = "UpdateCustomModelDeploymentResponse";
const _UG = "UpdateGuardrail";
const _UGR = "UpdateGuardrailRequest";
const _UGRp = "UpdateGuardrailResponse";
const _UMME = "UpdateMarketplaceModelEndpoint";
const _UMMER = "UpdateMarketplaceModelEndpointRequest";
const _UMMERp = "UpdateMarketplaceModelEndpointResponse";
const _UPMT = "UpdateProvisionedModelThroughput";
const _UPMTR = "UpdateProvisionedModelThroughputRequest";
const _UPMTRp = "UpdateProvisionedModelThroughputResponse";
const _UR = "UntagResource";
const _URR = "UntagResourceRequest";
const _URRn = "UntagResourceResponse";
const _V = "Validator";
const _VC = "VpcConfig";
const _VD = "ValidationDetails";
const _VDC = "ValidationDataConfig";
const _VE = "ValidationException";
const _VM = "ValidatorMetric";
const _VMa = "ValidationMetrics";
const _VSBRC = "VectorSearchBedrockRerankingConfiguration";
const _VSBRMC = "VectorSearchBedrockRerankingModelConfiguration";
const _VSRC = "VectorSearchRerankingConfiguration";
const _VT = "ValidityTerm";
const _Va = "Validators";
const _a = "annotation";
const _aA = "agreementAvailability";
const _aAn = "andAll";
const _aD = "agreementDuration";
const _aDDE = "audioDataDeliveryEnabled";
const _aE = "alternateExpression";
const _aEc = "acceptEula";
const _aI = "assetId";
const _aJ = "accuracyJustification";
const _aM = "assetManifest";
const _aMRF = "additionalModelRequestFields";
const _aN = "assetName";
const _aR = "addRule";
const _aRFNL = "addRuleFromNaturalLanguage";
const _aRP = "automatedReasoningPolicy";
const _aRPBWS = "automatedReasoningPolicyBuildWorkflowSummaries";
const _aRPC = "automatedReasoningPolicyConfig";
const _aRPS = "automatedReasoningPolicySummaries";
const _aS = "accuracyScore";
const _aSH = "annotationSetHash";
const _aSt = "atomicStatements";
const _aSu = "authorizationStatus";
const _aT = "assetType";
const _aTE = "applicationTypeEquals";
const _aTFR = "aggregatedTestFindingsResult";
const _aTV = "addTypeValue";
const _aTd = "addType";
const _aTp = "applicationType";
const _aV = "addVariable";
const _ac = "action";
const _an = "annotations";
const _ar = "arn";
const _au = "automated";
const _bC = "byteContent";
const _bCT = "byCustomizationType";
const _bEM = "bedrockEvaluatorModels";
const _bIM = "blockedInputMessaging";
const _bIT = "byInferenceType";
const _bKBI = "bedrockKnowledgeBaseIdentifiers";
const _bL = "buildLog";
const _bM = "bedrockModel";
const _bMA = "baseModelArn";
const _bMAE = "baseModelArnEquals";
const _bMI = "baseModelIdentifier";
const _bMIe = "bedrockModelIdentifiers";
const _bMN = "baseModelName";
const _bN = "bucketName";
const _bOM = "blockedOutputsMessaging";
const _bOMy = "byOutputModality";
const _bP = "byProvider";
const _bRC = "bedrockRerankingConfiguration";
const _bS = "buildSteps";
const _bSa = "batchSize";
const _bWA = "buildWorkflowAssets";
const _bWI = "buildWorkflowId";
const _bWT = "buildWorkflowType";
const _c = "client";
const _cA = "createdAt";
const _cAr = "createdAfter";
const _cB = "createdBy";
const _cBr = "createdBefore";
const _cC = "customizationConfig";
const _cD = "commitmentDuration";
const _cEKI = "customerEncryptionKeyId";
const _cET = "commitmentExpirationTime";
const _cF = "copyFrom";
const _cFS = "claimsFalseScenario";
const _cGP = "contextualGroundingPolicy";
const _cGPC = "contextualGroundingPolicyConfig";
const _cI = "configId";
const _cM = "customMetrics";
const _cMA = "customModelArn";
const _cMC = "customMetricConfig";
const _cMD = "customMetricDefinition";
const _cMDA = "customModelDeploymentArn";
const _cMDI = "customModelDeploymentIdentifier";
const _cMDN = "customModelDeploymentName";
const _cMEMI = "customMetricsEvaluatorModelIdentifiers";
const _cMKKI = "customModelKmsKeyId";
const _cMN = "customModelName";
const _cMT = "customModelTags";
const _cMU = "customModelUnits";
const _cMUPMC = "customModelUnitsPerModelCopy";
const _cMUV = "customModelUnitsVersion";
const _cP = "contentPolicy";
const _cPC = "contentPolicyConfig";
const _cR = "contradictingRules";
const _cRC = "crossRegionConfig";
const _cRD = "crossRegionDetails";
const _cRT = "clientRequestToken";
const _cRo = "conflictingRules";
const _cS = "coverageScore";
const _cSu = "customizationsSupported";
const _cT = "confidenceThreshold";
const _cTA = "creationTimeAfter";
const _cTB = "creationTimeBefore";
const _cTS = "claimsTrueScenario";
const _cTo = "contentType";
const _cTr = "creationTime";
const _cTu = "customizationType";
const _cWC = "cloudWatchConfig";
const _cl = "claims";
const _co = "confidence";
const _cod = "code";
const _con = "content";
const _cont = "context";
const _d = "description";
const _dC = "documentContent";
const _dCT = "documentContentType";
const _dCi = "distillationConfig";
const _dD = "documentDescription";
const _dH = "documentHash";
const _dHe = "definitionHash";
const _dI = "documentId";
const _dL = "datasetLocation";
const _dMA = "desiredModelArn";
const _dMC = "datasetMetricConfigs";
const _dMI = "desiredModelId";
const _dMU = "desiredModelUnits";
const _dN = "documentName";
const _dPD = "dataProcessingDetails";
const _dPMN = "desiredProvisionedModelName";
const _dR = "deleteRule";
const _dRS = "disjointRuleSets";
const _dS = "differenceScenarios";
const _dSo = "documentSources";
const _dT = "deleteType";
const _dTV = "deleteTypeValue";
const _dV = "deleteVariable";
const _da = "data";
const _dat = "dataset";
const _de = "definition";
const _di = "dimension";
const _do = "document";
const _doc = "documents";
const _e = "error";
const _eA = "endpointArn";
const _eAFR = "expectedAggregatedFindingsResult";
const _eAn = "entitlementAvailability";
const _eC = "evaluationConfig";
const _eCn = "endpointConfig";
const _eCp = "epochCount";
const _eDDE = "embeddingDataDeliveryEnabled";
const _eI = "endpointIdentifier";
const _eIv = "evalInterval";
const _eJ = "evaluationJobs";
const _eM = "errorMessage";
const _eMC = "evaluatorModelConfig";
const _eMI = "evaluatorModelIdentifiers";
const _eMx = "excludedModels";
const _eN = "endpointName";
const _eOLT = "endOfLifeTime";
const _eR = "expectedResult";
const _eRC = "errorRecordCount";
const _eRx = "executionRole";
const _eS = "endpointStatus";
const _eSC = "externalSourcesConfiguration";
const _eSM = "endpointStatusMessage";
const _eT = "endTime";
const _eTT = "evaluationTaskTypes";
const _en = "entries";
const _ena = "enabled";
const _eq = "equals";
const _er = "errors";
const _ex = "expression";
const _exa = "examples";
const _f = "feedback";
const _fC = "filtersConfig";
const _fD = "formData";
const _fDA = "flowDefinitionArn";
const _fM = "fallbackModel";
const _fMA = "foundationModelArn";
const _fMAE = "foundationModelArnEquals";
const _fMa = "failureMessage";
const _fMai = "failureMessages";
const _fN = "fieldName";
const _fR = "failureRecommendations";
const _fRi = "fidelityReport";
const _fTE = "fieldsToExclude";
const _fTI = "fieldsToInclude";
const _fV = "floatValue";
const _fi = "filters";
const _fil = "filter";
const _fo = "force";
const _g = "guardrails";
const _gA = "guardrailArn";
const _gC = "guardContent";
const _gCe = "generationConfiguration";
const _gCr = "graderConfig";
const _gCu = "guardrailConfiguration";
const _gCua = "guardrailsConfig";
const _gFRC = "generateFidelityReportContent";
const _gI = "guardrailIdentifier";
const _gIC = "guardrailInferenceConfig";
const _gIu = "guardrailId";
const _gJ = "groundingJustifications";
const _gPA = "guardrailProfileArn";
const _gPI = "guardrailProfileIdentifier";
const _gPIu = "guardrailProfileId";
const _gS = "groundingStatements";
const _gT = "greaterThan";
const _gTC = "generatedTestCases";
const _gTOE = "greaterThanOrEquals";
const _gV = "guardrailVersion";
const _h = "human";
const _hE = "httpError";
const _hH = "httpHeader";
const _hP = "hyperParameters";
const _hQ = "httpQuery";
const _hWC = "humanWorkflowConfig";
const _ht = "http";
const _i = "id";
const _iA = "inputAction";
const _iC = "inferenceConfig";
const _iCS = "inferenceConfigSummary";
const _iCn = "ingestContent";
const _iDC = "inputDataConfig";
const _iDDE = "imageDataDeliveryEnabled";
const _iE = "inputEnabled";
const _iFC = "implicitFilterConfiguration";
const _iIC = "initialInstanceCount";
const _iJS = "invocationJobSummaries";
const _iLC = "invocationLogsConfig";
const _iLS = "invocationLogSource";
const _iM = "inputModalities";
const _iMA = "importedModelArn";
const _iMKKA = "importedModelKmsKeyArn";
const _iMKKI = "importedModelKmsKeyId";
const _iMN = "importedModelName";
const _iMT = "importedModelTags";
const _iMTn = "inferenceMaxTokens";
const _iMn = "includedModels";
const _iO = "isOwned";
const _iP = "inferenceParams";
const _iPA = "inferenceProfileArn";
const _iPI = "inferenceProfileIdentifier";
const _iPIn = "inferenceProfileId";
const _iPN = "inferenceProfileName";
const _iPS = "inferenceProfileSummaries";
const _iS = "instructSupported";
const _iSI = "inferenceSourceIdentifier";
const _iSn = "inputStrength";
const _iT = "inputTags";
const _iTS = "inferenceTypesSupported";
const _iTd = "idempotencyToken";
const _iTn = "instanceType";
const _id = "identifier";
const _im = "impossible";
const _in = "instructions";
const _in_ = "in";
const _inv = "invalid";
const _jA = "jobArn";
const _jD = "jobDescription";
const _jET = "jobExpirationTime";
const _jI = "jobIdentifier";
const _jIo = "jobIdentifiers";
const _jN = "jobName";
const _jS = "jobStatus";
const _jSo = "jobSummaries";
const _jT = "jobTags";
const _jTo = "jobType";
const _k = "key";
const _kBC = "knowledgeBaseConfiguration";
const _kBCn = "knowledgeBaseConfig";
const _kBI = "knowledgeBaseId";
const _kBRC = "knowledgeBaseRetrievalConfiguration";
const _kEK = "kmsEncryptionKey";
const _kIC = "kbInferenceConfig";
const _kKA = "kmsKeyArn";
const _kKI = "kmsKeyId";
const _kP = "keyPrefix";
const _l = "logic";
const _lA = "lambdaArn";
const _lC = "loggingConfig";
const _lCi = "listContains";
const _lDDSC = "largeDataDeliveryS3Config";
const _lG = "lambdaGrader";
const _lGN = "logGroupName";
const _lMT = "lastModifiedTime";
const _lN = "lineNumber";
const _lR = "learningRate";
const _lT = "lineText";
const _lTOE = "lessThanOrEquals";
const _lTe = "legacyTime";
const _lTeg = "legalTerm";
const _lTes = "lessThan";
const _lUA = "lastUpdatedAt";
const _lUASH = "lastUpdatedAnnotationSetHash";
const _lUDH = "lastUpdatedDefinitionHash";
const _lW = "logicWarning";
const _la = "latency";
const _li = "lines";
const _lin = "line";
const _lo = "location";
const _m = "message";
const _mA = "modelArn";
const _mAE = "modelArnEquals";
const _mAe = "metadataAttributes";
const _mAo = "modelArchitecture";
const _mC = "modelConfiguration";
const _mCJS = "modelCopyJobSummaries";
const _mCJSo = "modelCustomizationJobSummaries";
const _mCS = "modelConfigSummary";
const _mCe = "metadataConfiguration";
const _mD = "modelDetails";
const _mDN = "modelDeploymentName";
const _mDS = "modelDataSource";
const _mDSo = "modelDeploymentSummaries";
const _mE = "modelEnforcement";
const _mI = "modelIdentifier";
const _mIJS = "modelImportJobSummaries";
const _mIT = "modelInvocationType";
const _mIo = "modelId";
const _mIod = "modelIdentifiers";
const _mKKA = "modelKmsKeyArn";
const _mKKI = "modelKmsKeyId";
const _mL = "modelLifecycle";
const _mME = "marketplaceModelEndpoint";
const _mMEa = "marketplaceModelEndpoints";
const _mN = "modelName";
const _mNe = "metricNames";
const _mPL = "maxPromptLength";
const _mR = "maxResults";
const _mRLFI = "maxResponseLengthForInference";
const _mS = "modelSource";
const _mSC = "modelSourceConfig";
const _mSE = "modelSourceEquals";
const _mSI = "modelSourceIdentifier";
const _mSo = "modelStatus";
const _mSod = "modelSummaries";
const _mT = "messageType";
const _mTa = "maxTokens";
const _mTo = "modelTags";
const _mU = "modelUnits";
const _mWL = "managedWordLists";
const _mWLC = "managedWordListsConfig";
const _me = "messages";
const _mo = "models";
const _mu = "mutation";
const _n = "name";
const _nC = "nameContains";
const _nE = "notEquals";
const _nI = "notIn";
const _nL = "naturalLanguage";
const _nN = "newName";
const _nOR = "numberOfResults";
const _nORR = "numberOfRerankedResults";
const _nT = "nextToken";
const _nTo = "noTranslations";
const _nV = "newValue";
const _o = "owner";
const _oA = "outputAction";
const _oAI = "ownerAccountId";
const _oAr = "orAll";
const _oC = "orchestrationConfiguration";
const _oDC = "outputDataConfig";
const _oE = "outputEnabled";
const _oI = "offerId";
const _oM = "outputModalities";
const _oMA = "outputModelArn";
const _oMKKA = "outputModelKmsKeyArn";
const _oMN = "outputModelName";
const _oMNC = "outputModelNameContains";
const _oS = "outputStrength";
const _oST = "overrideSearchType";
const _oT = "offerToken";
const _oTf = "offerType";
const _of = "offers";
const _op = "options";
const _p = "premises";
const _pA = "policyArn";
const _pC = "performanceConfig";
const _pD = "policyDefinition";
const _pDR = "policyDefinitionRule";
const _pDT = "policyDefinitionType";
const _pDV = "policyDefinitionVariable";
const _pE = "priorElement";
const _pEAT = "publicExtendedAccessTime";
const _pEC = "piiEntitiesConfig";
const _pEi = "piiEntities";
const _pI = "policyId";
const _pIS = "precomputedInferenceSource";
const _pISI = "precomputedInferenceSourceIdentifiers";
const _pMA = "provisionedModelArn";
const _pMI = "provisionedModelId";
const _pMN = "provisionedModelName";
const _pMS = "provisionedModelSummaries";
const _pN = "pageNumber";
const _pNr = "providerName";
const _pRA = "promptRouterArn";
const _pRAo = "policyRepairAssets";
const _pRC = "processedRecordCount";
const _pRN = "promptRouterName";
const _pRS = "promptRouterSummaries";
const _pRSC = "precomputedRagSourceConfig";
const _pRSI = "precomputedRagSourceIdentifiers";
const _pS = "policyScenarios";
const _pT = "promptTemplate";
const _pV = "policyVariable";
const _pVA = "policyVersionArn";
const _pa = "pattern";
const _pl = "planning";
const _po = "policies";
const _pr = "price";
const _qC = "queryContent";
const _qR = "qualityReport";
const _qTC = "queryTransformationConfiguration";
const _r = "rule";
const _rA = "roleArn";
const _rAGC = "retrieveAndGenerateConfig";
const _rAGSC = "retrieveAndGenerateSourceConfig";
const _rARN = "resourceARN";
const _rAe = "resourceArn";
const _rAeg = "regionAvailability";
const _rC = "ruleCount";
const _rCS = "ragConfigSummary";
const _rCa = "rateCard";
const _rCag = "ragConfigs";
const _rCe = "regexesConfig";
const _rCer = "rerankingConfiguration";
const _rCet = "retrievalConfiguration";
const _rCetr = "retrieveConfig";
const _rCf = "rftConfig";
const _rCo = "routingCriteria";
const _rE = "reasoningEffort";
const _rI = "ruleId";
const _rIa = "ragIdentifiers";
const _rIu = "ruleIds";
const _rM = "ratingMethod";
const _rMF = "requestMetadataFilters";
const _rN = "resourceName";
const _rP = "resourcePolicy";
const _rPD = "refundPolicyDescription";
const _rQD = "responseQualityDifference";
const _rR = "ruleReports";
const _rS = "ratingScale";
const _rSC = "retrieveSourceConfig";
const _rSI = "ragSourceIdentifier";
const _rSS = "responseStreamingSupported";
const _re = "regexes";
const _ru = "rules";
const _s = "smithy.ts.sdk.synthetic.com.amazonaws.bedrock";
const _sAE = "sourceAccountEquals";
const _sAI = "sourceAccountId";
const _sB = "sortBy";
const _sBO = "s3BucketOwner";
const _sC = "s3Config";
const _sCG = "selectiveContentGuarding";
const _sCo = "sourceContent";
const _sCt = "stringContains";
const _sD = "statusDetails";
const _sDS = "s3DataSource";
const _sE = "scenarioExpression";
const _sEKI = "s3EncryptionKeyId";
const _sEt = "statusEquals";
const _sGI = "securityGroupIds";
const _sI = "statementId";
const _sIDC = "s3InputDataConfig";
const _sIF = "s3InputFormat";
const _sIP = "sensitiveInformationPolicy";
const _sIPC = "sensitiveInformationPolicyConfig";
const _sIu = "subnetIds";
const _sL = "s3Location";
const _sM = "statusMessage";
const _sMA = "sourceModelArn";
const _sMAE = "sourceModelArnEquals";
const _sMC = "selectiveModeConfiguration";
const _sMN = "sourceModelName";
const _sMa = "sageMaker";
const _sMe = "selectionMode";
const _sO = "sortOrder";
const _sODC = "s3OutputDataConfig";
const _sOLT = "startOfLifeTime";
const _sR = "supportingRules";
const _sRC = "successRecordCount";
const _sRt = "statusReasons";
const _sS = "stopSequences";
const _sT = "sourceType";
const _sTA = "submitTimeAfter";
const _sTB = "submitTimeBefore";
const _sTu = "submitTime";
const _sTup = "supportTerm";
const _sU = "s3Uri";
const _sV = "stringValue";
const _sW = "startsWith";
const _sa = "satisfiable";
const _sc = "scenario";
const _se = "server";
const _so = "sources";
const _st = "status";
const _sta = "statements";
const _sy = "system";
const _t = "translation";
const _tA = "translationAmbiguous";
const _tC = "typeCount";
const _tCI = "testCaseId";
const _tCIe = "testCaseIds";
const _tCe = "testCase";
const _tCes = "testCases";
const _tCi = "tierConfig";
const _tCo = "topicsConfig";
const _tCoo = "tooComplex";
const _tD = "termDetails";
const _tDC = "trainingDataConfig";
const _tDDE = "textDataDeliveryEnabled";
const _tDIH = "timeoutDurationInHours";
const _tDr = "trainingDetails";
const _tE = "typeEquals";
const _tF = "testFindings";
const _tIC = "textInferenceConfig";
const _tK = "tagKeys";
const _tL = "trainingLoss";
const _tM = "trainingMetrics";
const _tMA = "targetModelArn";
const _tMC = "teacherModelConfig";
const _tMI = "teacherModelIdentifier";
const _tMKKA = "targetModelKmsKeyArn";
const _tMN = "targetModelName";
const _tMNC = "targetModelNameContains";
const _tMT = "targetModelTags";
const _tN = "typeName";
const _tNi = "tierName";
const _tP = "topicPolicy";
const _tPC = "topicPolicyConfig";
const _tPT = "textPromptTemplate";
const _tPo = "topP";
const _tR = "testResult";
const _tRC = "totalRecordCount";
const _tRR = "testRunResult";
const _tRS = "testRunStatus";
const _tRe = "testResults";
const _tSPP = "trainingSamplePerPrompt";
const _tT = "taskType";
const _ta = "tags";
const _te = "text";
const _tem = "temperature";
const _th = "threshold";
const _ti = "tier";
const _to = "topics";
const _tr = "translations";
const _ty = "type";
const _typ = "types";
const _u = "unit";
const _uA = "updatedAt";
const _uB = "updatedBy";
const _uBPT = "usageBasedPricingTerm";
const _uC = "untranslatedClaims";
const _uD = "updateDetails";
const _uFRF = "updateFromRulesFeedback";
const _uFSF = "updateFromScenarioFeedback";
const _uP = "untranslatedPremises";
const _uPR = "usePromptResponse";
const _uR = "updateRule";
const _uS = "updateStatus";
const _uT = "unusedTypes";
const _uTV = "unusedTypeValues";
const _uTVp = "updateTypeValue";
const _uTp = "updateType";
const _uV = "unusedVariables";
const _uVp = "updateVariable";
const _ur = "url";
const _uri = "uri";
const _v = "values";
const _vC = "variableCount";
const _vCp = "vpcConfig";
const _vD = "validationDetails";
const _vDC = "validationDataConfig";
const _vDDE = "videoDataDeliveryEnabled";
const _vL = "validationLoss";
const _vM = "validationMetrics";
const _vN = "valueName";
const _vR = "variableReports";
const _vSC = "vectorSearchConfiguration";
const _vT = "validityTerm";
const _va = "value";
const _val = "validators";
const _vali = "valid";
const _var = "variable";
const _vari = "variables";
const _ve = "version";
const _vp = "vpc";
const _w = "words";
const _wC = "workflowContent";
const _wCo = "wordsConfig";
const _wP = "wordPolicy";
const _wPC = "wordPolicyConfig";
const _xact = "x-amz-client-token";
const n0 = "com.amazonaws.bedrock";
const schema_1 = require("@smithy/core/schema");
const BedrockServiceException_1 = require("../models/BedrockServiceException");
const errors_1 = require("../models/errors");
const _s_registry = schema_1.TypeRegistry.for(_s);
exports.BedrockServiceException$ = [-3, _s, "BedrockServiceException", 0, [], []];
_s_registry.registerError(exports.BedrockServiceException$, BedrockServiceException_1.BedrockServiceException);
const n0_registry = schema_1.TypeRegistry.for(n0);
exports.AccessDeniedException$ = [-3, n0, _ADE,
    { [_e]: _c, [_hE]: 403 },
    [_m],
    [0]
];
n0_registry.registerError(exports.AccessDeniedException$, errors_1.AccessDeniedException);
exports.ConflictException$ = [-3, n0, _CE,
    { [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.ConflictException$, errors_1.ConflictException);
exports.InternalServerException$ = [-3, n0, _ISE,
    { [_e]: _se, [_hE]: 500 },
    [_m],
    [0]
];
n0_registry.registerError(exports.InternalServerException$, errors_1.InternalServerException);
exports.ResourceInUseException$ = [-3, n0, _RIUE,
    { [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.ResourceInUseException$, errors_1.ResourceInUseException);
exports.ResourceNotFoundException$ = [-3, n0, _RNFE,
    { [_e]: _c, [_hE]: 404 },
    [_m],
    [0]
];
n0_registry.registerError(exports.ResourceNotFoundException$, errors_1.ResourceNotFoundException);
exports.ServiceQuotaExceededException$ = [-3, n0, _SQEE,
    { [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.ServiceQuotaExceededException$, errors_1.ServiceQuotaExceededException);
exports.ServiceUnavailableException$ = [-3, n0, _SUE,
    { [_e]: _se, [_hE]: 503 },
    [_m],
    [0]
];
n0_registry.registerError(exports.ServiceUnavailableException$, errors_1.ServiceUnavailableException);
exports.ThrottlingException$ = [-3, n0, _TE,
    { [_e]: _c, [_hE]: 429 },
    [_m],
    [0]
];
n0_registry.registerError(exports.ThrottlingException$, errors_1.ThrottlingException);
exports.TooManyTagsException$ = [-3, n0, _TMTE,
    { [_e]: _c, [_hE]: 400 },
    [_m, _rN],
    [0, 0]
];
n0_registry.registerError(exports.TooManyTagsException$, errors_1.TooManyTagsException);
exports.ValidationException$ = [-3, n0, _VE,
    { [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.ValidationException$, errors_1.ValidationException);
exports.errorTypeRegistries = [
    _s_registry,
    n0_registry,
];
var AutomatedReasoningLogicStatementContent = [0, n0, _ARLSC, 8, 0];
var AutomatedReasoningNaturalLanguageStatementContent = [0, n0, _ARNLSC, 8, 0];
var AutomatedReasoningPolicyAnnotationFeedbackNaturalLanguage = [0, n0, _ARPAFNL, 8, 0];
var AutomatedReasoningPolicyAnnotationIngestContent = [0, n0, _ARPAIC, 8, 0];
var AutomatedReasoningPolicyAnnotationRuleNaturalLanguage = [0, n0, _ARPARNL, 8, 0];
var AutomatedReasoningPolicyBuildDocumentBlob = [0, n0, _ARPBDB, 8, 21];
var AutomatedReasoningPolicyBuildDocumentDescription = [0, n0, _ARPBDD, 8, 0];
var AutomatedReasoningPolicyBuildDocumentName = [0, n0, _ARPBDN, 8, 0];
var AutomatedReasoningPolicyBuildResultAssetName = [0, n0, _ARPBRAN, 8, 0];
var AutomatedReasoningPolicyDefinitionRuleAlternateExpression = [0, n0, _ARPDRAE, 8, 0];
var AutomatedReasoningPolicyDefinitionRuleExpression = [0, n0, _ARPDRE, 8, 0];
var AutomatedReasoningPolicyDefinitionTypeDescription = [0, n0, _ARPDTD, 8, 0];
var AutomatedReasoningPolicyDefinitionTypeName = [0, n0, _ARPDTN, 8, 0];
var AutomatedReasoningPolicyDefinitionTypeValueDescription = [0, n0, _ARPDTVD, 8, 0];
var AutomatedReasoningPolicyDefinitionVariableDescription = [0, n0, _ARPDVD, 8, 0];
var AutomatedReasoningPolicyDefinitionVariableName = [0, n0, _ARPDVN, 8, 0];
var AutomatedReasoningPolicyDescription = [0, n0, _ARPD, 8, 0];
var AutomatedReasoningPolicyJustificationText = [0, n0, _ARPJT, 8, 0];
var AutomatedReasoningPolicyLineText = [0, n0, _ARPLT, 8, 0];
var AutomatedReasoningPolicyName = [0, n0, _ARPN, 8, 0];
var AutomatedReasoningPolicyScenarioAlternateExpression = [0, n0, _ARPSAE, 8, 0];
var AutomatedReasoningPolicyScenarioExpression = [0, n0, _ARPSE, 8, 0];
var AutomatedReasoningPolicyStatementText = [0, n0, _ARPST, 8, 0];
var AutomatedReasoningPolicyTestGuardContent = [0, n0, _ARPTGC, 8, 0];
var AutomatedReasoningPolicyTestQueryContent = [0, n0, _ARPTQC, 8, 0];
var ByteContentBlob = [0, n0, _BCB, 8, 21];
var EvaluationDatasetName = [0, n0, _EDN, 8, 0];
var EvaluationJobDescription = [0, n0, _EJD, 8, 0];
var EvaluationJobIdentifier = [0, n0, _EJI, 8, 0];
var EvaluationMetricDescription = [0, n0, _EMD, 8, 0];
var EvaluationMetricName = [0, n0, _EMN, 8, 0];
var EvaluationModelInferenceParams = [0, n0, _EMIP, 8, 0];
var GuardrailBlockedMessaging = [0, n0, _GBM, 8, 0];
var GuardrailContentFilterAction = [0, n0, _GCFA, 8, 0];
var GuardrailContentFiltersTierName = [0, n0, _GCFTN, 8, 0];
var GuardrailContextualGroundingAction = [0, n0, _GCGA, 8, 0];
var GuardrailDescription = [0, n0, _GD, 8, 0];
var GuardrailFailureRecommendation = [0, n0, _GFR, 8, 0];
var GuardrailModality = [0, n0, _GM, 8, 0];
var GuardrailName = [0, n0, _GN, 8, 0];
var GuardrailStatusReason = [0, n0, _GSR, 8, 0];
var GuardrailTopicAction = [0, n0, _GTA, 8, 0];
var GuardrailTopicDefinition = [0, n0, _GTD, 8, 0];
var GuardrailTopicExample = [0, n0, _GTE, 8, 0];
var GuardrailTopicName = [0, n0, _GTN, 8, 0];
var GuardrailTopicsTierName = [0, n0, _GTTN, 8, 0];
var GuardrailWordAction = [0, n0, _GWA, 8, 0];
var HumanTaskInstructions = [0, n0, _HTI, 8, 0];
var Identifier = [0, n0, _I, 8, 0];
var InferenceProfileDescription = [0, n0, _IPD, 8, 0];
var Message = [0, n0, _M, 8, 0];
var MetricName = [0, n0, _MN, 8, 0];
var PromptRouterDescription = [0, n0, _PRD, 8, 0];
var TextPromptTemplate = [0, n0, _TPT, 8, 0];
exports.AccountEnforcedGuardrailInferenceInputConfiguration$ = [3, n0, _AEGIIC,
    0,
    [_gI, _gV, _sCG, _mE],
    [0, 0, () => exports.SelectiveContentGuarding$, () => exports.ModelEnforcement$], 2
];
exports.AccountEnforcedGuardrailOutputConfiguration$ = [3, n0, _AEGOC,
    0,
    [_cI, _gA, _gIu, _iT, _sCG, _gV, _cA, _cB, _uA, _uB, _o, _mE],
    [0, 0, 0, 0, () => exports.SelectiveContentGuarding$, 0, 5, 0, 5, 0, 0, () => exports.ModelEnforcement$]
];
exports.AgreementAvailability$ = [3, n0, _AA,
    0,
    [_st, _eM],
    [0, 0], 1
];
exports.AutomatedEvaluationConfig$ = [3, n0, _AEC,
    0,
    [_dMC, _eMC, _cMC],
    [[() => EvaluationDatasetMetricConfigs, 0], () => exports.EvaluatorModelConfig$, [() => exports.AutomatedEvaluationCustomMetricConfig$, 0]], 1
];
exports.AutomatedEvaluationCustomMetricConfig$ = [3, n0, _AECMC,
    0,
    [_cM, _eMC],
    [[() => AutomatedEvaluationCustomMetrics, 0], () => exports.CustomMetricEvaluatorModelConfig$], 2
];
exports.AutomatedReasoningCheckImpossibleFinding$ = [3, n0, _ARCIF,
    0,
    [_t, _cR, _lW],
    [[() => exports.AutomatedReasoningCheckTranslation$, 0], () => AutomatedReasoningCheckRuleList, [() => exports.AutomatedReasoningCheckLogicWarning$, 0]]
];
exports.AutomatedReasoningCheckInputTextReference$ = [3, n0, _ARCITR,
    0,
    [_te],
    [[() => AutomatedReasoningNaturalLanguageStatementContent, 0]]
];
exports.AutomatedReasoningCheckInvalidFinding$ = [3, n0, _ARCIFu,
    0,
    [_t, _cR, _lW],
    [[() => exports.AutomatedReasoningCheckTranslation$, 0], () => AutomatedReasoningCheckRuleList, [() => exports.AutomatedReasoningCheckLogicWarning$, 0]]
];
exports.AutomatedReasoningCheckLogicWarning$ = [3, n0, _ARCLW,
    0,
    [_ty, _p, _cl],
    [0, [() => AutomatedReasoningLogicStatementList, 0], [() => AutomatedReasoningLogicStatementList, 0]]
];
exports.AutomatedReasoningCheckNoTranslationsFinding$ = [3, n0, _ARCNTF,
    0,
    [],
    []
];
exports.AutomatedReasoningCheckRule$ = [3, n0, _ARCR,
    0,
    [_i, _pVA],
    [0, 0]
];
exports.AutomatedReasoningCheckSatisfiableFinding$ = [3, n0, _ARCSF,
    0,
    [_t, _cTS, _cFS, _lW],
    [[() => exports.AutomatedReasoningCheckTranslation$, 0], [() => exports.AutomatedReasoningCheckScenario$, 0], [() => exports.AutomatedReasoningCheckScenario$, 0], [() => exports.AutomatedReasoningCheckLogicWarning$, 0]]
];
exports.AutomatedReasoningCheckScenario$ = [3, n0, _ARCS,
    0,
    [_sta],
    [[() => AutomatedReasoningLogicStatementList, 0]]
];
exports.AutomatedReasoningCheckTooComplexFinding$ = [3, n0, _ARCTCF,
    0,
    [],
    []
];
exports.AutomatedReasoningCheckTranslation$ = [3, n0, _ARCT,
    0,
    [_cl, _co, _p, _uP, _uC],
    [[() => AutomatedReasoningLogicStatementList, 0], 1, [() => AutomatedReasoningLogicStatementList, 0], [() => AutomatedReasoningCheckInputTextReferenceList, 0], [() => AutomatedReasoningCheckInputTextReferenceList, 0]], 2
];
exports.AutomatedReasoningCheckTranslationAmbiguousFinding$ = [3, n0, _ARCTAF,
    0,
    [_op, _dS],
    [[() => AutomatedReasoningCheckTranslationOptionList, 0], [() => AutomatedReasoningCheckDifferenceScenarioList, 0]]
];
exports.AutomatedReasoningCheckTranslationOption$ = [3, n0, _ARCTO,
    0,
    [_tr],
    [[() => AutomatedReasoningCheckTranslationList, 0]]
];
exports.AutomatedReasoningCheckValidFinding$ = [3, n0, _ARCVF,
    0,
    [_t, _cTS, _sR, _lW],
    [[() => exports.AutomatedReasoningCheckTranslation$, 0], [() => exports.AutomatedReasoningCheckScenario$, 0], () => AutomatedReasoningCheckRuleList, [() => exports.AutomatedReasoningCheckLogicWarning$, 0]]
];
exports.AutomatedReasoningLogicStatement$ = [3, n0, _ARLS,
    0,
    [_l, _nL],
    [[() => AutomatedReasoningLogicStatementContent, 0], [() => AutomatedReasoningNaturalLanguageStatementContent, 0]], 1
];
exports.AutomatedReasoningPolicyAddRuleAnnotation$ = [3, n0, _ARPARA,
    0,
    [_ex],
    [[() => AutomatedReasoningPolicyDefinitionRuleExpression, 0]], 1
];
exports.AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation$ = [3, n0, _ARPARFNLA,
    0,
    [_nL],
    [[() => AutomatedReasoningPolicyAnnotationRuleNaturalLanguage, 0]], 1
];
exports.AutomatedReasoningPolicyAddRuleMutation$ = [3, n0, _ARPARM,
    0,
    [_r],
    [[() => exports.AutomatedReasoningPolicyDefinitionRule$, 0]], 1
];
exports.AutomatedReasoningPolicyAddTypeAnnotation$ = [3, n0, _ARPATA,
    0,
    [_n, _d, _v],
    [[() => AutomatedReasoningPolicyDefinitionTypeName, 0], [() => AutomatedReasoningPolicyDefinitionTypeDescription, 0], [() => AutomatedReasoningPolicyDefinitionTypeValueList, 0]], 3
];
exports.AutomatedReasoningPolicyAddTypeMutation$ = [3, n0, _ARPATM,
    0,
    [_ty],
    [[() => exports.AutomatedReasoningPolicyDefinitionType$, 0]], 1
];
exports.AutomatedReasoningPolicyAddTypeValue$ = [3, n0, _ARPATV,
    0,
    [_va, _d],
    [0, [() => AutomatedReasoningPolicyDefinitionTypeValueDescription, 0]], 1
];
exports.AutomatedReasoningPolicyAddVariableAnnotation$ = [3, n0, _ARPAVA,
    0,
    [_n, _ty, _d],
    [[() => AutomatedReasoningPolicyDefinitionVariableName, 0], [() => AutomatedReasoningPolicyDefinitionTypeName, 0], [() => AutomatedReasoningPolicyDefinitionVariableDescription, 0]], 3
];
exports.AutomatedReasoningPolicyAddVariableMutation$ = [3, n0, _ARPAVM,
    0,
    [_var],
    [[() => exports.AutomatedReasoningPolicyDefinitionVariable$, 0]], 1
];
exports.AutomatedReasoningPolicyAnnotatedChunk$ = [3, n0, _ARPAC,
    0,
    [_con, _pN],
    [[() => AutomatedReasoningPolicyAnnotatedContentList, 0], 1], 1
];
exports.AutomatedReasoningPolicyAnnotatedLine$ = [3, n0, _ARPAL,
    0,
    [_lN, _lT],
    [1, [() => AutomatedReasoningPolicyLineText, 0]]
];
exports.AutomatedReasoningPolicyAtomicStatement$ = [3, n0, _ARPAS,
    0,
    [_i, _te, _lo],
    [0, [() => AutomatedReasoningPolicyStatementText, 0], () => exports.AutomatedReasoningPolicyStatementLocation$], 3
];
exports.AutomatedReasoningPolicyBuildLog$ = [3, n0, _ARPBL,
    0,
    [_en],
    [[() => AutomatedReasoningPolicyBuildLogEntryList, 0]], 1
];
exports.AutomatedReasoningPolicyBuildLogEntry$ = [3, n0, _ARPBLE,
    0,
    [_a, _st, _bS],
    [[() => exports.AutomatedReasoningPolicyAnnotation$, 0], 0, [() => AutomatedReasoningPolicyBuildStepList, 0]], 3
];
exports.AutomatedReasoningPolicyBuildResultAssetManifest$ = [3, n0, _ARPBRAM,
    0,
    [_en],
    [[() => AutomatedReasoningPolicyBuildResultAssetManifestList, 0]], 1
];
exports.AutomatedReasoningPolicyBuildResultAssetManifestEntry$ = [3, n0, _ARPBRAME,
    0,
    [_aT, _aN, _aI],
    [0, [() => AutomatedReasoningPolicyBuildResultAssetName, 0], 0], 1
];
exports.AutomatedReasoningPolicyBuildStep$ = [3, n0, _ARPBS,
    0,
    [_cont, _me, _pE],
    [[() => exports.AutomatedReasoningPolicyBuildStepContext$, 0], () => AutomatedReasoningPolicyBuildStepMessageList, [() => exports.AutomatedReasoningPolicyDefinitionElement$, 0]], 2
];
exports.AutomatedReasoningPolicyBuildStepMessage$ = [3, n0, _ARPBSM,
    0,
    [_m, _mT],
    [0, 0], 2
];
exports.AutomatedReasoningPolicyBuildWorkflowDocument$ = [3, n0, _ARPBWD,
    0,
    [_do, _dCT, _dN, _dD],
    [[() => AutomatedReasoningPolicyBuildDocumentBlob, 0], 0, [() => AutomatedReasoningPolicyBuildDocumentName, 0], [() => AutomatedReasoningPolicyBuildDocumentDescription, 0]], 3
];
exports.AutomatedReasoningPolicyBuildWorkflowRepairContent$ = [3, n0, _ARPBWRC,
    0,
    [_an],
    [[() => AutomatedReasoningPolicyAnnotationList, 0]], 1
];
exports.AutomatedReasoningPolicyBuildWorkflowSource$ = [3, n0, _ARPBWS,
    0,
    [_pD, _wC],
    [[() => exports.AutomatedReasoningPolicyDefinition$, 0], [() => exports.AutomatedReasoningPolicyWorkflowTypeContent$, 0]]
];
exports.AutomatedReasoningPolicyBuildWorkflowSummary$ = [3, n0, _ARPBWSu,
    0,
    [_pA, _bWI, _st, _bWT, _cA, _uA],
    [0, 0, 0, 0, 5, 5], 6
];
exports.AutomatedReasoningPolicyDefinition$ = [3, n0, _ARPDu,
    0,
    [_ve, _typ, _ru, _vari],
    [0, [() => AutomatedReasoningPolicyDefinitionTypeList, 0], [() => AutomatedReasoningPolicyDefinitionRuleList, 0], [() => AutomatedReasoningPolicyDefinitionVariableList, 0]]
];
exports.AutomatedReasoningPolicyDefinitionQualityReport$ = [3, n0, _ARPDQR,
    0,
    [_tC, _vC, _rC, _uT, _uTV, _uV, _cRo, _dRS],
    [1, 1, 1, [() => AutomatedReasoningPolicyDefinitionTypeNameList, 0], [() => AutomatedReasoningPolicyDefinitionTypeValuePairList, 0], [() => AutomatedReasoningPolicyDefinitionVariableNameList, 0], 64 | 0, [() => AutomatedReasoningPolicyDisjointRuleSetList, 0]], 8
];
exports.AutomatedReasoningPolicyDefinitionRule$ = [3, n0, _ARPDR,
    0,
    [_i, _ex, _aE],
    [0, [() => AutomatedReasoningPolicyDefinitionRuleExpression, 0], [() => AutomatedReasoningPolicyDefinitionRuleAlternateExpression, 0]], 2
];
exports.AutomatedReasoningPolicyDefinitionType$ = [3, n0, _ARPDT,
    0,
    [_n, _v, _d],
    [[() => AutomatedReasoningPolicyDefinitionTypeName, 0], [() => AutomatedReasoningPolicyDefinitionTypeValueList, 0], [() => AutomatedReasoningPolicyDefinitionTypeDescription, 0]], 2
];
exports.AutomatedReasoningPolicyDefinitionTypeValue$ = [3, n0, _ARPDTV,
    0,
    [_va, _d],
    [0, [() => AutomatedReasoningPolicyDefinitionTypeValueDescription, 0]], 1
];
exports.AutomatedReasoningPolicyDefinitionTypeValuePair$ = [3, n0, _ARPDTVP,
    0,
    [_tN, _vN],
    [[() => AutomatedReasoningPolicyDefinitionTypeName, 0], 0], 2
];
exports.AutomatedReasoningPolicyDefinitionVariable$ = [3, n0, _ARPDV,
    0,
    [_n, _ty, _d],
    [[() => AutomatedReasoningPolicyDefinitionVariableName, 0], [() => AutomatedReasoningPolicyDefinitionTypeName, 0], [() => AutomatedReasoningPolicyDefinitionVariableDescription, 0]], 3
];
exports.AutomatedReasoningPolicyDeleteRuleAnnotation$ = [3, n0, _ARPDRA,
    0,
    [_rI],
    [0], 1
];
exports.AutomatedReasoningPolicyDeleteRuleMutation$ = [3, n0, _ARPDRM,
    0,
    [_i],
    [0], 1
];
exports.AutomatedReasoningPolicyDeleteTypeAnnotation$ = [3, n0, _ARPDTA,
    0,
    [_n],
    [[() => AutomatedReasoningPolicyDefinitionTypeName, 0]], 1
];
exports.AutomatedReasoningPolicyDeleteTypeMutation$ = [3, n0, _ARPDTM,
    0,
    [_n],
    [[() => AutomatedReasoningPolicyDefinitionTypeName, 0]], 1
];
exports.AutomatedReasoningPolicyDeleteTypeValue$ = [3, n0, _ARPDTVu,
    0,
    [_va],
    [0], 1
];
exports.AutomatedReasoningPolicyDeleteVariableAnnotation$ = [3, n0, _ARPDVA,
    0,
    [_n],
    [[() => AutomatedReasoningPolicyDefinitionVariableName, 0]], 1
];
exports.AutomatedReasoningPolicyDeleteVariableMutation$ = [3, n0, _ARPDVM,
    0,
    [_n],
    [[() => AutomatedReasoningPolicyDefinitionVariableName, 0]], 1
];
exports.AutomatedReasoningPolicyDisjointRuleSet$ = [3, n0, _ARPDRS,
    0,
    [_vari, _ru],
    [[() => AutomatedReasoningPolicyDefinitionVariableNameList, 0], 64 | 0], 2
];
exports.AutomatedReasoningPolicyFidelityReport$ = [3, n0, _ARPFR,
    0,
    [_cS, _aS, _rR, _vR, _dSo],
    [1, 1, [() => AutomatedReasoningPolicyRuleReportMap, 0], [() => AutomatedReasoningPolicyVariableReportMap, 0], [() => AutomatedReasoningPolicyReportSourceDocumentList, 0]], 5
];
exports.AutomatedReasoningPolicyGeneratedTestCase$ = [3, n0, _ARPGTC,
    0,
    [_qC, _gC, _eAFR],
    [[() => AutomatedReasoningPolicyTestQueryContent, 0], [() => AutomatedReasoningPolicyTestGuardContent, 0], 0], 3
];
exports.AutomatedReasoningPolicyGeneratedTestCases$ = [3, n0, _ARPGTCu,
    0,
    [_gTC],
    [[() => AutomatedReasoningPolicyGeneratedTestCaseList, 0]], 1
];
exports.AutomatedReasoningPolicyIngestContentAnnotation$ = [3, n0, _ARPICA,
    0,
    [_con],
    [[() => AutomatedReasoningPolicyAnnotationIngestContent, 0]], 1
];
exports.AutomatedReasoningPolicyPlanning$ = [3, n0, _ARPP,
    0,
    [],
    []
];
exports.AutomatedReasoningPolicyReportSourceDocument$ = [3, n0, _ARPRSD,
    0,
    [_dN, _dH, _dI, _aSt, _dC],
    [[() => AutomatedReasoningPolicyBuildDocumentName, 0], 0, 0, [() => AutomatedReasoningPolicyAtomicStatementList, 0], [() => AutomatedReasoningPolicyAnnotatedChunkList, 0]], 5
];
exports.AutomatedReasoningPolicyRuleReport$ = [3, n0, _ARPRR,
    0,
    [_r, _gS, _gJ, _aS, _aJ],
    [0, () => AutomatedReasoningPolicyStatementReferenceList, [() => AutomatedReasoningPolicyJustificationList, 0], 1, [() => AutomatedReasoningPolicyJustificationText, 0]], 1
];
exports.AutomatedReasoningPolicyScenario$ = [3, n0, _ARPS,
    0,
    [_ex, _aE, _eR, _rIu],
    [[() => AutomatedReasoningPolicyScenarioExpression, 0], [() => AutomatedReasoningPolicyScenarioAlternateExpression, 0], 0, 64 | 0], 4
];
exports.AutomatedReasoningPolicyScenarios$ = [3, n0, _ARPSu,
    0,
    [_pS],
    [[() => AutomatedReasoningPolicyScenarioList, 0]], 1
];
exports.AutomatedReasoningPolicySourceDocument$ = [3, n0, _ARPSD,
    0,
    [_do, _dCT, _dN, _dH, _dD],
    [[() => AutomatedReasoningPolicyBuildDocumentBlob, 0], 0, [() => AutomatedReasoningPolicyBuildDocumentName, 0], 0, [() => AutomatedReasoningPolicyBuildDocumentDescription, 0]], 4
];
exports.AutomatedReasoningPolicyStatementLocation$ = [3, n0, _ARPSL,
    0,
    [_li],
    [64 | 1], 1
];
exports.AutomatedReasoningPolicyStatementReference$ = [3, n0, _ARPSR,
    0,
    [_dI, _sI],
    [0, 0], 2
];
exports.AutomatedReasoningPolicySummary$ = [3, n0, _ARPSut,
    0,
    [_pA, _n, _ve, _pI, _cA, _uA, _d],
    [0, [() => AutomatedReasoningPolicyName, 0], 0, 0, 5, 5, [() => AutomatedReasoningPolicyDescription, 0]], 6
];
exports.AutomatedReasoningPolicyTestCase$ = [3, n0, _ARPTC,
    0,
    [_tCI, _gC, _cA, _uA, _qC, _eAFR, _cT],
    [0, [() => AutomatedReasoningPolicyTestGuardContent, 0], 5, 5, [() => AutomatedReasoningPolicyTestQueryContent, 0], 0, 1], 4
];
exports.AutomatedReasoningPolicyTestResult$ = [3, n0, _ARPTR,
    0,
    [_tCe, _pA, _tRS, _uA, _tF, _tRR, _aTFR],
    [[() => exports.AutomatedReasoningPolicyTestCase$, 0], 0, 0, 5, [() => AutomatedReasoningCheckFindingList, 0], 0, 0], 4
];
exports.AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation$ = [3, n0, _ARPUFRFA,
    0,
    [_f, _rIu],
    [[() => AutomatedReasoningPolicyAnnotationFeedbackNaturalLanguage, 0], 64 | 0], 1
];
exports.AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation$ = [3, n0, _ARPUFSFA,
    0,
    [_sE, _rIu, _f],
    [[() => AutomatedReasoningPolicyScenarioExpression, 0], 64 | 0, [() => AutomatedReasoningPolicyAnnotationFeedbackNaturalLanguage, 0]], 1
];
exports.AutomatedReasoningPolicyUpdateRuleAnnotation$ = [3, n0, _ARPURA,
    0,
    [_rI, _ex],
    [0, [() => AutomatedReasoningPolicyDefinitionRuleExpression, 0]], 2
];
exports.AutomatedReasoningPolicyUpdateRuleMutation$ = [3, n0, _ARPURM,
    0,
    [_r],
    [[() => exports.AutomatedReasoningPolicyDefinitionRule$, 0]], 1
];
exports.AutomatedReasoningPolicyUpdateTypeAnnotation$ = [3, n0, _ARPUTA,
    0,
    [_n, _v, _nN, _d],
    [[() => AutomatedReasoningPolicyDefinitionTypeName, 0], [() => AutomatedReasoningPolicyTypeValueAnnotationList, 0], [() => AutomatedReasoningPolicyDefinitionTypeName, 0], [() => AutomatedReasoningPolicyDefinitionTypeDescription, 0]], 2
];
exports.AutomatedReasoningPolicyUpdateTypeMutation$ = [3, n0, _ARPUTM,
    0,
    [_ty],
    [[() => exports.AutomatedReasoningPolicyDefinitionType$, 0]], 1
];
exports.AutomatedReasoningPolicyUpdateTypeValue$ = [3, n0, _ARPUTV,
    0,
    [_va, _nV, _d],
    [0, 0, [() => AutomatedReasoningPolicyDefinitionTypeValueDescription, 0]], 1
];
exports.AutomatedReasoningPolicyUpdateVariableAnnotation$ = [3, n0, _ARPUVA,
    0,
    [_n, _nN, _d],
    [[() => AutomatedReasoningPolicyDefinitionVariableName, 0], [() => AutomatedReasoningPolicyDefinitionVariableName, 0], [() => AutomatedReasoningPolicyDefinitionVariableDescription, 0]], 1
];
exports.AutomatedReasoningPolicyUpdateVariableMutation$ = [3, n0, _ARPUVM,
    0,
    [_var],
    [[() => exports.AutomatedReasoningPolicyDefinitionVariable$, 0]], 1
];
exports.AutomatedReasoningPolicyVariableReport$ = [3, n0, _ARPVR,
    0,
    [_pV, _gS, _gJ, _aS, _aJ],
    [[() => AutomatedReasoningPolicyDefinitionVariableName, 0], () => AutomatedReasoningPolicyStatementReferenceList, [() => AutomatedReasoningPolicyJustificationList, 0], 1, [() => AutomatedReasoningPolicyJustificationText, 0]], 1
];
exports.BatchDeleteEvaluationJobError$ = [3, n0, _BDEJE,
    0,
    [_jI, _cod, _m],
    [[() => EvaluationJobIdentifier, 0], 0, 0], 2
];
exports.BatchDeleteEvaluationJobItem$ = [3, n0, _BDEJI,
    0,
    [_jI, _jS],
    [[() => EvaluationJobIdentifier, 0], 0], 2
];
exports.BatchDeleteEvaluationJobRequest$ = [3, n0, _BDEJR,
    0,
    [_jIo],
    [[() => EvaluationJobIdentifiers, 0]], 1
];
exports.BatchDeleteEvaluationJobResponse$ = [3, n0, _BDEJRa,
    0,
    [_er, _eJ],
    [[() => BatchDeleteEvaluationJobErrors, 0], [() => BatchDeleteEvaluationJobItems, 0]], 2
];
exports.BedrockEvaluatorModel$ = [3, n0, _BEM,
    0,
    [_mI],
    [0], 1
];
exports.ByteContentDoc$ = [3, n0, _BCD,
    0,
    [_id, _cTo, _da],
    [[() => Identifier, 0], 0, [() => ByteContentBlob, 0]], 3
];
exports.CancelAutomatedReasoningPolicyBuildWorkflowRequest$ = [3, n0, _CARPBWR,
    0,
    [_pA, _bWI],
    [[0, 1], [0, 1]], 2
];
exports.CancelAutomatedReasoningPolicyBuildWorkflowResponse$ = [3, n0, _CARPBWRa,
    0,
    [],
    []
];
exports.CloudWatchConfig$ = [3, n0, _CWC,
    0,
    [_lGN, _rA, _lDDSC],
    [0, 0, () => exports.S3Config$], 2
];
exports.CreateAutomatedReasoningPolicyRequest$ = [3, n0, _CARPR,
    0,
    [_n, _d, _cRT, _pD, _kKI, _ta],
    [[() => AutomatedReasoningPolicyName, 0], [() => AutomatedReasoningPolicyDescription, 0], [0, 4], [() => exports.AutomatedReasoningPolicyDefinition$, 0], 0, () => TagList], 1
];
exports.CreateAutomatedReasoningPolicyResponse$ = [3, n0, _CARPRr,
    0,
    [_pA, _ve, _n, _cA, _uA, _d, _dHe],
    [0, 0, [() => AutomatedReasoningPolicyName, 0], 5, 5, [() => AutomatedReasoningPolicyDescription, 0], 0], 5
];
exports.CreateAutomatedReasoningPolicyTestCaseRequest$ = [3, n0, _CARPTCR,
    0,
    [_pA, _gC, _eAFR, _qC, _cRT, _cT],
    [[0, 1], [() => AutomatedReasoningPolicyTestGuardContent, 0], 0, [() => AutomatedReasoningPolicyTestQueryContent, 0], [0, 4], 1], 3
];
exports.CreateAutomatedReasoningPolicyTestCaseResponse$ = [3, n0, _CARPTCRr,
    0,
    [_pA, _tCI],
    [0, 0], 2
];
exports.CreateAutomatedReasoningPolicyVersionRequest$ = [3, n0, _CARPVR,
    0,
    [_pA, _lUDH, _cRT, _ta],
    [[0, 1], 0, [0, 4], () => TagList], 2
];
exports.CreateAutomatedReasoningPolicyVersionResponse$ = [3, n0, _CARPVRr,
    0,
    [_pA, _ve, _n, _dHe, _cA, _d],
    [0, 0, [() => AutomatedReasoningPolicyName, 0], 0, 5, [() => AutomatedReasoningPolicyDescription, 0]], 5
];
exports.CreateCustomModelDeploymentRequest$ = [3, n0, _CCMDR,
    0,
    [_mDN, _mA, _d, _ta, _cRT],
    [0, 0, 0, () => TagList, [0, 4]], 2
];
exports.CreateCustomModelDeploymentResponse$ = [3, n0, _CCMDRr,
    0,
    [_cMDA],
    [0], 1
];
exports.CreateCustomModelRequest$ = [3, n0, _CCMR,
    0,
    [_mN, _mSC, _mKKA, _rA, _mTo, _cRT],
    [0, () => exports.ModelDataSource$, 0, 0, () => TagList, [0, 4]], 2
];
exports.CreateCustomModelResponse$ = [3, n0, _CCMRr,
    0,
    [_mA],
    [0], 1
];
exports.CreateEvaluationJobRequest$ = [3, n0, _CEJR,
    0,
    [_jN, _rA, _eC, _iC, _oDC, _jD, _cRT, _cEKI, _jT, _aTp],
    [0, 0, [() => exports.EvaluationConfig$, 0], [() => exports.EvaluationInferenceConfig$, 0], () => exports.EvaluationOutputDataConfig$, [() => EvaluationJobDescription, 0], [0, 4], 0, () => TagList, 0], 5
];
exports.CreateEvaluationJobResponse$ = [3, n0, _CEJRr,
    0,
    [_jA],
    [0], 1
];
exports.CreateFoundationModelAgreementRequest$ = [3, n0, _CFMAR,
    0,
    [_oT, _mIo],
    [0, 0], 2
];
exports.CreateFoundationModelAgreementResponse$ = [3, n0, _CFMARr,
    0,
    [_mIo],
    [0], 1
];
exports.CreateGuardrailRequest$ = [3, n0, _CGR,
    0,
    [_n, _bIM, _bOM, _d, _tPC, _cPC, _wPC, _sIPC, _cGPC, _aRPC, _cRC, _kKI, _ta, _cRT],
    [[() => GuardrailName, 0], [() => GuardrailBlockedMessaging, 0], [() => GuardrailBlockedMessaging, 0], [() => GuardrailDescription, 0], [() => exports.GuardrailTopicPolicyConfig$, 0], [() => exports.GuardrailContentPolicyConfig$, 0], [() => exports.GuardrailWordPolicyConfig$, 0], () => exports.GuardrailSensitiveInformationPolicyConfig$, [() => exports.GuardrailContextualGroundingPolicyConfig$, 0], () => exports.GuardrailAutomatedReasoningPolicyConfig$, () => exports.GuardrailCrossRegionConfig$, 0, () => TagList, [0, 4]], 3
];
exports.CreateGuardrailResponse$ = [3, n0, _CGRr,
    0,
    [_gIu, _gA, _ve, _cA],
    [0, 0, 0, 5], 4
];
exports.CreateGuardrailVersionRequest$ = [3, n0, _CGVR,
    0,
    [_gI, _d, _cRT],
    [[0, 1], [() => GuardrailDescription, 0], [0, 4]], 1
];
exports.CreateGuardrailVersionResponse$ = [3, n0, _CGVRr,
    0,
    [_gIu, _ve],
    [0, 0], 2
];
exports.CreateInferenceProfileRequest$ = [3, n0, _CIPR,
    0,
    [_iPN, _mS, _d, _cRT, _ta],
    [0, () => exports.InferenceProfileModelSource$, [() => InferenceProfileDescription, 0], [0, 4], () => TagList], 2
];
exports.CreateInferenceProfileResponse$ = [3, n0, _CIPRr,
    0,
    [_iPA, _st],
    [0, 0], 1
];
exports.CreateMarketplaceModelEndpointRequest$ = [3, n0, _CMMER,
    0,
    [_mSI, _eCn, _eN, _aEc, _cRT, _ta],
    [0, () => exports.EndpointConfig$, 0, 2, [0, 4], () => TagList], 3
];
exports.CreateMarketplaceModelEndpointResponse$ = [3, n0, _CMMERr,
    0,
    [_mME],
    [() => exports.MarketplaceModelEndpoint$], 1
];
exports.CreateModelCopyJobRequest$ = [3, n0, _CMCJR,
    0,
    [_sMA, _tMN, _mKKI, _tMT, _cRT],
    [0, 0, 0, () => TagList, [0, 4]], 2
];
exports.CreateModelCopyJobResponse$ = [3, n0, _CMCJRr,
    0,
    [_jA],
    [0], 1
];
exports.CreateModelCustomizationJobRequest$ = [3, n0, _CMCJRre,
    0,
    [_jN, _cMN, _rA, _bMI, _tDC, _oDC, _cRT, _cTu, _cMKKI, _jT, _cMT, _vDC, _hP, _vCp, _cC],
    [0, 0, 0, 0, [() => exports.TrainingDataConfig$, 0], () => exports.OutputDataConfig$, [0, 4], 0, 0, () => TagList, () => TagList, () => exports.ValidationDataConfig$, 128 | 0, () => exports.VpcConfig$, () => exports.CustomizationConfig$], 6
];
exports.CreateModelCustomizationJobResponse$ = [3, n0, _CMCJRrea,
    0,
    [_jA],
    [0], 1
];
exports.CreateModelImportJobRequest$ = [3, n0, _CMIJR,
    0,
    [_jN, _iMN, _rA, _mDS, _jT, _iMT, _cRT, _vCp, _iMKKI],
    [0, 0, 0, () => exports.ModelDataSource$, () => TagList, () => TagList, 0, () => exports.VpcConfig$, 0], 4
];
exports.CreateModelImportJobResponse$ = [3, n0, _CMIJRr,
    0,
    [_jA],
    [0], 1
];
exports.CreateModelInvocationJobRequest$ = [3, n0, _CMIJRre,
    0,
    [_jN, _rA, _mIo, _iDC, _oDC, _cRT, _vCp, _tDIH, _ta, _mIT],
    [0, 0, 0, () => exports.ModelInvocationJobInputDataConfig$, () => exports.ModelInvocationJobOutputDataConfig$, [0, 4], () => exports.VpcConfig$, 1, () => TagList, 0], 5
];
exports.CreateModelInvocationJobResponse$ = [3, n0, _CMIJRrea,
    0,
    [_jA],
    [0], 1
];
exports.CreatePromptRouterRequest$ = [3, n0, _CPRR,
    0,
    [_pRN, _mo, _rCo, _fM, _cRT, _d, _ta],
    [0, () => PromptRouterTargetModels, () => exports.RoutingCriteria$, () => exports.PromptRouterTargetModel$, [0, 4], [() => PromptRouterDescription, 0], () => TagList], 4
];
exports.CreatePromptRouterResponse$ = [3, n0, _CPRRr,
    0,
    [_pRA],
    [0]
];
exports.CreateProvisionedModelThroughputRequest$ = [3, n0, _CPMTR,
    0,
    [_mU, _pMN, _mIo, _cRT, _cD, _ta],
    [1, 0, 0, [0, 4], 0, () => TagList], 3
];
exports.CreateProvisionedModelThroughputResponse$ = [3, n0, _CPMTRr,
    0,
    [_pMA],
    [0], 1
];
exports.CustomMetricBedrockEvaluatorModel$ = [3, n0, _CMBEM,
    0,
    [_mI],
    [0], 1
];
exports.CustomMetricDefinition$ = [3, n0, _CMD,
    8,
    [_n, _in, _rS],
    [[() => MetricName, 0], 0, () => RatingScale], 2
];
exports.CustomMetricEvaluatorModelConfig$ = [3, n0, _CMEMC,
    0,
    [_bEM],
    [() => CustomMetricBedrockEvaluatorModels], 1
];
exports.CustomModelDeploymentSummary$ = [3, n0, _CMDS,
    0,
    [_cMDA, _cMDN, _mA, _cA, _st, _lUA, _fMa],
    [0, 0, 0, 5, 0, 5, 0], 5
];
exports.CustomModelDeploymentUpdateDetails$ = [3, n0, _CMDUD,
    0,
    [_mA, _uS],
    [0, 0], 2
];
exports.CustomModelSummary$ = [3, n0, _CMS,
    0,
    [_mA, _mN, _cTr, _bMA, _bMN, _cTu, _oAI, _mSo],
    [0, 0, 5, 0, 0, 0, 0, 0], 5
];
exports.CustomModelUnits$ = [3, n0, _CMU,
    0,
    [_cMUPMC, _cMUV],
    [1, 0]
];
exports.DataProcessingDetails$ = [3, n0, _DPD,
    0,
    [_st, _cTr, _lMT],
    [0, 5, 5]
];
exports.DeleteAutomatedReasoningPolicyBuildWorkflowRequest$ = [3, n0, _DARPBWR,
    0,
    [_pA, _bWI, _lUA],
    [[0, 1], [0, 1], [5, { [_hQ]: _uA }]], 3
];
exports.DeleteAutomatedReasoningPolicyBuildWorkflowResponse$ = [3, n0, _DARPBWRe,
    0,
    [],
    []
];
exports.DeleteAutomatedReasoningPolicyRequest$ = [3, n0, _DARPR,
    0,
    [_pA, _fo],
    [[0, 1], [2, { [_hQ]: _fo }]], 1
];
exports.DeleteAutomatedReasoningPolicyResponse$ = [3, n0, _DARPRe,
    0,
    [],
    []
];
exports.DeleteAutomatedReasoningPolicyTestCaseRequest$ = [3, n0, _DARPTCR,
    0,
    [_pA, _tCI, _lUA],
    [[0, 1], [0, 1], [5, { [_hQ]: _uA }]], 3
];
exports.DeleteAutomatedReasoningPolicyTestCaseResponse$ = [3, n0, _DARPTCRe,
    0,
    [],
    []
];
exports.DeleteCustomModelDeploymentRequest$ = [3, n0, _DCMDR,
    0,
    [_cMDI],
    [[0, 1]], 1
];
exports.DeleteCustomModelDeploymentResponse$ = [3, n0, _DCMDRe,
    0,
    [],
    []
];
exports.DeleteCustomModelRequest$ = [3, n0, _DCMR,
    0,
    [_mI],
    [[0, 1]], 1
];
exports.DeleteCustomModelResponse$ = [3, n0, _DCMRe,
    0,
    [],
    []
];
exports.DeleteEnforcedGuardrailConfigurationRequest$ = [3, n0, _DEGCR,
    0,
    [_cI],
    [[0, 1]], 1
];
exports.DeleteEnforcedGuardrailConfigurationResponse$ = [3, n0, _DEGCRe,
    0,
    [],
    []
];
exports.DeleteFoundationModelAgreementRequest$ = [3, n0, _DFMAR,
    0,
    [_mIo],
    [0], 1
];
exports.DeleteFoundationModelAgreementResponse$ = [3, n0, _DFMARe,
    0,
    [],
    []
];
exports.DeleteGuardrailRequest$ = [3, n0, _DGR,
    0,
    [_gI, _gV],
    [[0, 1], [0, { [_hQ]: _gV }]], 1
];
exports.DeleteGuardrailResponse$ = [3, n0, _DGRe,
    0,
    [],
    []
];
exports.DeleteImportedModelRequest$ = [3, n0, _DIMR,
    0,
    [_mI],
    [[0, 1]], 1
];
exports.DeleteImportedModelResponse$ = [3, n0, _DIMRe,
    0,
    [],
    []
];
exports.DeleteInferenceProfileRequest$ = [3, n0, _DIPR,
    0,
    [_iPI],
    [[0, 1]], 1
];
exports.DeleteInferenceProfileResponse$ = [3, n0, _DIPRe,
    0,
    [],
    []
];
exports.DeleteMarketplaceModelEndpointRequest$ = [3, n0, _DMMER,
    0,
    [_eA],
    [[0, 1]], 1
];
exports.DeleteMarketplaceModelEndpointResponse$ = [3, n0, _DMMERe,
    0,
    [],
    []
];
exports.DeleteModelInvocationLoggingConfigurationRequest$ = [3, n0, _DMILCR,
    0,
    [],
    []
];
exports.DeleteModelInvocationLoggingConfigurationResponse$ = [3, n0, _DMILCRe,
    0,
    [],
    []
];
exports.DeletePromptRouterRequest$ = [3, n0, _DPRR,
    0,
    [_pRA],
    [[0, 1]], 1
];
exports.DeletePromptRouterResponse$ = [3, n0, _DPRRe,
    0,
    [],
    []
];
exports.DeleteProvisionedModelThroughputRequest$ = [3, n0, _DPMTR,
    0,
    [_pMI],
    [[0, 1]], 1
];
exports.DeleteProvisionedModelThroughputResponse$ = [3, n0, _DPMTRe,
    0,
    [],
    []
];
exports.DeleteResourcePolicyRequest$ = [3, n0, _DRPR,
    0,
    [_rAe],
    [[0, 1]], 1
];
exports.DeleteResourcePolicyResponse$ = [3, n0, _DRPRe,
    0,
    [],
    []
];
exports.DeregisterMarketplaceModelEndpointRequest$ = [3, n0, _DMMERer,
    0,
    [_eA],
    [[0, 1]], 1
];
exports.DeregisterMarketplaceModelEndpointResponse$ = [3, n0, _DMMERere,
    0,
    [],
    []
];
exports.DimensionalPriceRate$ = [3, n0, _DPR,
    0,
    [_di, _pr, _d, _u],
    [0, 0, 0, 0]
];
exports.DistillationConfig$ = [3, n0, _DC,
    0,
    [_tMC],
    [() => exports.TeacherModelConfig$], 1
];
exports.EvaluationBedrockModel$ = [3, n0, _EBM,
    0,
    [_mI, _iP, _pC],
    [0, [() => EvaluationModelInferenceParams, 0], () => exports.PerformanceConfiguration$], 1
];
exports.EvaluationDataset$ = [3, n0, _ED,
    0,
    [_n, _dL],
    [[() => EvaluationDatasetName, 0], () => exports.EvaluationDatasetLocation$], 1
];
exports.EvaluationDatasetMetricConfig$ = [3, n0, _EDMC,
    0,
    [_tT, _dat, _mNe],
    [0, [() => exports.EvaluationDataset$, 0], [() => EvaluationMetricNames, 0]], 3
];
exports.EvaluationInferenceConfigSummary$ = [3, n0, _EICS,
    0,
    [_mCS, _rCS],
    [() => exports.EvaluationModelConfigSummary$, () => exports.EvaluationRagConfigSummary$]
];
exports.EvaluationModelConfigSummary$ = [3, n0, _EMCS,
    0,
    [_bMIe, _pISI],
    [64 | 0, 64 | 0]
];
exports.EvaluationOutputDataConfig$ = [3, n0, _EODC,
    0,
    [_sU],
    [0], 1
];
exports.EvaluationPrecomputedInferenceSource$ = [3, n0, _EPIS,
    0,
    [_iSI],
    [0], 1
];
exports.EvaluationPrecomputedRetrieveAndGenerateSourceConfig$ = [3, n0, _EPRAGSC,
    0,
    [_rSI],
    [0], 1
];
exports.EvaluationPrecomputedRetrieveSourceConfig$ = [3, n0, _EPRSC,
    0,
    [_rSI],
    [0], 1
];
exports.EvaluationRagConfigSummary$ = [3, n0, _ERCS,
    0,
    [_bKBI, _pRSI],
    [64 | 0, 64 | 0]
];
exports.EvaluationSummary$ = [3, n0, _ES,
    0,
    [_jA, _jN, _st, _cTr, _jTo, _eTT, _mIod, _rIa, _eMI, _cMEMI, _iCS, _aTp],
    [0, 0, 0, 5, 0, 64 | 0, 64 | 0, 64 | 0, 64 | 0, 64 | 0, () => exports.EvaluationInferenceConfigSummary$, 0], 6
];
exports.ExportAutomatedReasoningPolicyVersionRequest$ = [3, n0, _EARPVR,
    0,
    [_pA],
    [[0, 1]], 1
];
exports.ExportAutomatedReasoningPolicyVersionResponse$ = [3, n0, _EARPVRx,
    0,
    [_pD],
    [[() => exports.AutomatedReasoningPolicyDefinition$, 16]], 1
];
exports.ExternalSource$ = [3, n0, _ESx,
    0,
    [_sT, _sL, _bC],
    [0, () => exports.S3ObjectDoc$, [() => exports.ByteContentDoc$, 0]], 1
];
exports.ExternalSourcesGenerationConfiguration$ = [3, n0, _ESGC,
    0,
    [_pT, _gCu, _kIC, _aMRF],
    [[() => exports.PromptTemplate$, 0], () => exports.GuardrailConfiguration$, () => exports.KbInferenceConfig$, 128 | 15]
];
exports.ExternalSourcesRetrieveAndGenerateConfiguration$ = [3, n0, _ESRAGC,
    0,
    [_mA, _so, _gCe],
    [0, [() => ExternalSources, 0], [() => exports.ExternalSourcesGenerationConfiguration$, 0]], 2
];
exports.FieldForReranking$ = [3, n0, _FFR,
    0,
    [_fN],
    [0], 1
];
exports.FilterAttribute$ = [3, n0, _FA,
    0,
    [_k, _va],
    [0, 15], 2
];
exports.FoundationModelDetails$ = [3, n0, _FMD,
    0,
    [_mA, _mIo, _mN, _pNr, _iM, _oM, _rSS, _cSu, _iTS, _mL],
    [0, 0, 0, 0, 64 | 0, 64 | 0, 2, 64 | 0, 64 | 0, () => exports.FoundationModelLifecycle$], 2
];
exports.FoundationModelLifecycle$ = [3, n0, _FML,
    0,
    [_st, _sOLT, _eOLT, _lTe, _pEAT],
    [0, 5, 5, 5, 5], 1
];
exports.FoundationModelSummary$ = [3, n0, _FMS,
    0,
    [_mA, _mIo, _mN, _pNr, _iM, _oM, _rSS, _cSu, _iTS, _mL],
    [0, 0, 0, 0, 64 | 0, 64 | 0, 2, 64 | 0, 64 | 0, () => exports.FoundationModelLifecycle$], 2
];
exports.GenerationConfiguration$ = [3, n0, _GC,
    0,
    [_pT, _gCu, _kIC, _aMRF],
    [[() => exports.PromptTemplate$, 0], () => exports.GuardrailConfiguration$, () => exports.KbInferenceConfig$, 128 | 15]
];
exports.GetAutomatedReasoningPolicyAnnotationsRequest$ = [3, n0, _GARPAR,
    0,
    [_pA, _bWI],
    [[0, 1], [0, 1]], 2
];
exports.GetAutomatedReasoningPolicyAnnotationsResponse$ = [3, n0, _GARPARe,
    0,
    [_pA, _n, _bWI, _an, _aSH, _uA],
    [0, [() => AutomatedReasoningPolicyName, 0], 0, [() => AutomatedReasoningPolicyAnnotationList, 0], 0, 5], 6
];
exports.GetAutomatedReasoningPolicyBuildWorkflowRequest$ = [3, n0, _GARPBWR,
    0,
    [_pA, _bWI],
    [[0, 1], [0, 1]], 2
];
exports.GetAutomatedReasoningPolicyBuildWorkflowResponse$ = [3, n0, _GARPBWRe,
    0,
    [_pA, _bWI, _st, _bWT, _cA, _uA, _dN, _dCT, _dD],
    [0, 0, 0, 0, 5, 5, [() => AutomatedReasoningPolicyBuildDocumentName, 0], 0, [() => AutomatedReasoningPolicyBuildDocumentDescription, 0]], 6
];
exports.GetAutomatedReasoningPolicyBuildWorkflowResultAssetsRequest$ = [3, n0, _GARPBWRAR,
    0,
    [_pA, _bWI, _aT, _aI],
    [[0, 1], [0, 1], [0, { [_hQ]: _aT }], [0, { [_hQ]: _aI }]], 3
];
exports.GetAutomatedReasoningPolicyBuildWorkflowResultAssetsResponse$ = [3, n0, _GARPBWRARe,
    0,
    [_pA, _bWI, _bWA],
    [0, 0, [() => exports.AutomatedReasoningPolicyBuildResultAssets$, 0]], 2
];
exports.GetAutomatedReasoningPolicyNextScenarioRequest$ = [3, n0, _GARPNSR,
    0,
    [_pA, _bWI],
    [[0, 1], [0, 1]], 2
];
exports.GetAutomatedReasoningPolicyNextScenarioResponse$ = [3, n0, _GARPNSRe,
    0,
    [_pA, _sc],
    [0, [() => exports.AutomatedReasoningPolicyScenario$, 0]], 1
];
exports.GetAutomatedReasoningPolicyRequest$ = [3, n0, _GARPR,
    0,
    [_pA],
    [[0, 1]], 1
];
exports.GetAutomatedReasoningPolicyResponse$ = [3, n0, _GARPRe,
    0,
    [_pA, _n, _ve, _pI, _dHe, _uA, _d, _kKA, _cA],
    [0, [() => AutomatedReasoningPolicyName, 0], 0, 0, 0, 5, [() => AutomatedReasoningPolicyDescription, 0], 0, 5], 6
];
exports.GetAutomatedReasoningPolicyTestCaseRequest$ = [3, n0, _GARPTCR,
    0,
    [_pA, _tCI],
    [[0, 1], [0, 1]], 2
];
exports.GetAutomatedReasoningPolicyTestCaseResponse$ = [3, n0, _GARPTCRe,
    0,
    [_pA, _tCe],
    [0, [() => exports.AutomatedReasoningPolicyTestCase$, 0]], 2
];
exports.GetAutomatedReasoningPolicyTestResultRequest$ = [3, n0, _GARPTRR,
    0,
    [_pA, _bWI, _tCI],
    [[0, 1], [0, 1], [0, 1]], 3
];
exports.GetAutomatedReasoningPolicyTestResultResponse$ = [3, n0, _GARPTRRe,
    0,
    [_tR],
    [[() => exports.AutomatedReasoningPolicyTestResult$, 0]], 1
];
exports.GetCustomModelDeploymentRequest$ = [3, n0, _GCMDR,
    0,
    [_cMDI],
    [[0, 1]], 1
];
exports.GetCustomModelDeploymentResponse$ = [3, n0, _GCMDRe,
    0,
    [_cMDA, _mDN, _mA, _cA, _st, _d, _uD, _fMa, _lUA],
    [0, 0, 0, 5, 0, 0, () => exports.CustomModelDeploymentUpdateDetails$, 0, 5], 5
];
exports.GetCustomModelRequest$ = [3, n0, _GCMR,
    0,
    [_mI],
    [[0, 1]], 1
];
exports.GetCustomModelResponse$ = [3, n0, _GCMRe,
    0,
    [_mA, _mN, _cTr, _jN, _jA, _bMA, _cTu, _mKKA, _hP, _tDC, _vDC, _oDC, _tM, _vM, _cC, _mSo, _fMa],
    [0, 0, 5, 0, 0, 0, 0, 0, 128 | 0, [() => exports.TrainingDataConfig$, 0], () => exports.ValidationDataConfig$, () => exports.OutputDataConfig$, () => exports.TrainingMetrics$, () => ValidationMetrics, () => exports.CustomizationConfig$, 0, 0], 3
];
exports.GetEvaluationJobRequest$ = [3, n0, _GEJR,
    0,
    [_jI],
    [[() => EvaluationJobIdentifier, 1]], 1
];
exports.GetEvaluationJobResponse$ = [3, n0, _GEJRe,
    0,
    [_jN, _st, _jA, _rA, _jTo, _eC, _iC, _oDC, _cTr, _jD, _cEKI, _aTp, _lMT, _fMai],
    [0, 0, 0, 0, 0, [() => exports.EvaluationConfig$, 0], [() => exports.EvaluationInferenceConfig$, 0], () => exports.EvaluationOutputDataConfig$, 5, [() => EvaluationJobDescription, 0], 0, 0, 5, 64 | 0], 9
];
exports.GetFoundationModelAvailabilityRequest$ = [3, n0, _GFMAR,
    0,
    [_mIo],
    [[0, 1]], 1
];
exports.GetFoundationModelAvailabilityResponse$ = [3, n0, _GFMARe,
    0,
    [_mIo, _aA, _aSu, _eAn, _rAeg],
    [0, () => exports.AgreementAvailability$, 0, 0, 0], 5
];
exports.GetFoundationModelRequest$ = [3, n0, _GFMR,
    0,
    [_mI],
    [[0, 1]], 1
];
exports.GetFoundationModelResponse$ = [3, n0, _GFMRe,
    0,
    [_mD],
    [() => exports.FoundationModelDetails$]
];
exports.GetGuardrailRequest$ = [3, n0, _GGR,
    0,
    [_gI, _gV],
    [[0, 1], [0, { [_hQ]: _gV }]], 1
];
exports.GetGuardrailResponse$ = [3, n0, _GGRe,
    0,
    [_n, _gIu, _gA, _ve, _st, _cA, _uA, _bIM, _bOM, _d, _tP, _cP, _wP, _sIP, _cGP, _aRP, _cRD, _sRt, _fR, _kKA],
    [[() => GuardrailName, 0], 0, 0, 0, 0, 5, 5, [() => GuardrailBlockedMessaging, 0], [() => GuardrailBlockedMessaging, 0], [() => GuardrailDescription, 0], [() => exports.GuardrailTopicPolicy$, 0], [() => exports.GuardrailContentPolicy$, 0], [() => exports.GuardrailWordPolicy$, 0], () => exports.GuardrailSensitiveInformationPolicy$, [() => exports.GuardrailContextualGroundingPolicy$, 0], () => exports.GuardrailAutomatedReasoningPolicy$, () => exports.GuardrailCrossRegionDetails$, [() => GuardrailStatusReasons, 0], [() => GuardrailFailureRecommendations, 0], 0], 9
];
exports.GetImportedModelRequest$ = [3, n0, _GIMR,
    0,
    [_mI],
    [[0, 1]], 1
];
exports.GetImportedModelResponse$ = [3, n0, _GIMRe,
    0,
    [_mA, _mN, _jN, _jA, _mDS, _cTr, _mAo, _mKKA, _iS, _cMU],
    [0, 0, 0, 0, () => exports.ModelDataSource$, 5, 0, 0, 2, () => exports.CustomModelUnits$]
];
exports.GetInferenceProfileRequest$ = [3, n0, _GIPR,
    0,
    [_iPI],
    [[0, 1]], 1
];
exports.GetInferenceProfileResponse$ = [3, n0, _GIPRe,
    0,
    [_iPN, _iPA, _mo, _iPIn, _st, _ty, _d, _cA, _uA],
    [0, 0, () => InferenceProfileModels, 0, 0, 0, [() => InferenceProfileDescription, 0], 5, 5], 6
];
exports.GetMarketplaceModelEndpointRequest$ = [3, n0, _GMMER,
    0,
    [_eA],
    [[0, 1]], 1
];
exports.GetMarketplaceModelEndpointResponse$ = [3, n0, _GMMERe,
    0,
    [_mME],
    [() => exports.MarketplaceModelEndpoint$]
];
exports.GetModelCopyJobRequest$ = [3, n0, _GMCJR,
    0,
    [_jA],
    [[0, 1]], 1
];
exports.GetModelCopyJobResponse$ = [3, n0, _GMCJRe,
    0,
    [_jA, _st, _cTr, _tMA, _sAI, _sMA, _tMN, _tMKKA, _tMT, _fMa, _sMN],
    [0, 0, 5, 0, 0, 0, 0, 0, () => TagList, 0, 0], 6
];
exports.GetModelCustomizationJobRequest$ = [3, n0, _GMCJRet,
    0,
    [_jI],
    [[0, 1]], 1
];
exports.GetModelCustomizationJobResponse$ = [3, n0, _GMCJReto,
    0,
    [_jA, _jN, _oMN, _rA, _cTr, _bMA, _tDC, _vDC, _oDC, _oMA, _cRT, _st, _sD, _fMa, _lMT, _eT, _hP, _cTu, _oMKKA, _tM, _vM, _vCp, _cC],
    [0, 0, 0, 0, 5, 0, [() => exports.TrainingDataConfig$, 0], () => exports.ValidationDataConfig$, () => exports.OutputDataConfig$, 0, 0, 0, () => exports.StatusDetails$, 0, 5, 5, 128 | 0, 0, 0, () => exports.TrainingMetrics$, () => ValidationMetrics, () => exports.VpcConfig$, () => exports.CustomizationConfig$], 9
];
exports.GetModelImportJobRequest$ = [3, n0, _GMIJR,
    0,
    [_jI],
    [[0, 1]], 1
];
exports.GetModelImportJobResponse$ = [3, n0, _GMIJRe,
    0,
    [_jA, _jN, _iMN, _iMA, _rA, _mDS, _st, _fMa, _cTr, _lMT, _eT, _vCp, _iMKKA],
    [0, 0, 0, 0, 0, () => exports.ModelDataSource$, 0, 0, 5, 5, 5, () => exports.VpcConfig$, 0]
];
exports.GetModelInvocationJobRequest$ = [3, n0, _GMIJRet,
    0,
    [_jI],
    [[0, 1]], 1
];
exports.GetModelInvocationJobResponse$ = [3, n0, _GMIJReto,
    0,
    [_jA, _mIo, _rA, _sTu, _iDC, _oDC, _jN, _cRT, _st, _m, _lMT, _eT, _vCp, _tDIH, _jET, _mIT, _tRC, _pRC, _sRC, _eRC],
    [0, 0, 0, 5, () => exports.ModelInvocationJobInputDataConfig$, () => exports.ModelInvocationJobOutputDataConfig$, 0, 0, 0, [() => Message, 0], 5, 5, () => exports.VpcConfig$, 1, 5, 0, 1, 1, 1, 1], 6
];
exports.GetModelInvocationLoggingConfigurationRequest$ = [3, n0, _GMILCR,
    0,
    [],
    []
];
exports.GetModelInvocationLoggingConfigurationResponse$ = [3, n0, _GMILCRe,
    0,
    [_lC],
    [() => exports.LoggingConfig$]
];
exports.GetPromptRouterRequest$ = [3, n0, _GPRR,
    0,
    [_pRA],
    [[0, 1]], 1
];
exports.GetPromptRouterResponse$ = [3, n0, _GPRRe,
    0,
    [_pRN, _rCo, _pRA, _mo, _fM, _st, _ty, _d, _cA, _uA],
    [0, () => exports.RoutingCriteria$, 0, () => PromptRouterTargetModels, () => exports.PromptRouterTargetModel$, 0, 0, [() => PromptRouterDescription, 0], 5, 5], 7
];
exports.GetProvisionedModelThroughputRequest$ = [3, n0, _GPMTR,
    0,
    [_pMI],
    [[0, 1]], 1
];
exports.GetProvisionedModelThroughputResponse$ = [3, n0, _GPMTRe,
    0,
    [_mU, _dMU, _pMN, _pMA, _mA, _dMA, _fMA, _st, _cTr, _lMT, _fMa, _cD, _cET],
    [1, 1, 0, 0, 0, 0, 0, 0, 5, 5, 0, 0, 5], 10
];
exports.GetResourcePolicyRequest$ = [3, n0, _GRPR,
    0,
    [_rAe],
    [[0, 1]], 1
];
exports.GetResourcePolicyResponse$ = [3, n0, _GRPRe,
    0,
    [_rP],
    [0]
];
exports.GetUseCaseForModelAccessRequest$ = [3, n0, _GUCFMAR,
    0,
    [],
    []
];
exports.GetUseCaseForModelAccessResponse$ = [3, n0, _GUCFMARe,
    0,
    [_fD],
    [21], 1
];
exports.GuardrailAutomatedReasoningPolicy$ = [3, n0, _GARP,
    0,
    [_po, _cT],
    [64 | 0, 1], 1
];
exports.GuardrailAutomatedReasoningPolicyConfig$ = [3, n0, _GARPC,
    0,
    [_po, _cT],
    [64 | 0, 1], 1
];
exports.GuardrailConfiguration$ = [3, n0, _GCu,
    0,
    [_gIu, _gV],
    [0, 0], 2
];
exports.GuardrailContentFilter$ = [3, n0, _GCF,
    0,
    [_ty, _iSn, _oS, _iM, _oM, _iA, _oA, _iE, _oE],
    [0, 0, 0, [() => GuardrailModalities, 0], [() => GuardrailModalities, 0], [() => GuardrailContentFilterAction, 0], [() => GuardrailContentFilterAction, 0], 2, 2], 3
];
exports.GuardrailContentFilterConfig$ = [3, n0, _GCFC,
    0,
    [_ty, _iSn, _oS, _iM, _oM, _iA, _oA, _iE, _oE],
    [0, 0, 0, [() => GuardrailModalities, 0], [() => GuardrailModalities, 0], [() => GuardrailContentFilterAction, 0], [() => GuardrailContentFilterAction, 0], 2, 2], 3
];
exports.GuardrailContentFiltersTier$ = [3, n0, _GCFT,
    0,
    [_tNi],
    [[() => GuardrailContentFiltersTierName, 0]], 1
];
exports.GuardrailContentFiltersTierConfig$ = [3, n0, _GCFTC,
    0,
    [_tNi],
    [[() => GuardrailContentFiltersTierName, 0]], 1
];
exports.GuardrailContentPolicy$ = [3, n0, _GCP,
    0,
    [_fi, _ti],
    [[() => GuardrailContentFilters, 0], [() => exports.GuardrailContentFiltersTier$, 0]]
];
exports.GuardrailContentPolicyConfig$ = [3, n0, _GCPC,
    0,
    [_fC, _tCi],
    [[() => GuardrailContentFiltersConfig, 0], [() => exports.GuardrailContentFiltersTierConfig$, 0]], 1
];
exports.GuardrailContextualGroundingFilter$ = [3, n0, _GCGF,
    0,
    [_ty, _th, _ac, _ena],
    [0, 1, [() => GuardrailContextualGroundingAction, 0], 2], 2
];
exports.GuardrailContextualGroundingFilterConfig$ = [3, n0, _GCGFC,
    0,
    [_ty, _th, _ac, _ena],
    [0, 1, [() => GuardrailContextualGroundingAction, 0], 2], 2
];
exports.GuardrailContextualGroundingPolicy$ = [3, n0, _GCGP,
    0,
    [_fi],
    [[() => GuardrailContextualGroundingFilters, 0]], 1
];
exports.GuardrailContextualGroundingPolicyConfig$ = [3, n0, _GCGPC,
    0,
    [_fC],
    [[() => GuardrailContextualGroundingFiltersConfig, 0]], 1
];
exports.GuardrailCrossRegionConfig$ = [3, n0, _GCRC,
    0,
    [_gPI],
    [0], 1
];
exports.GuardrailCrossRegionDetails$ = [3, n0, _GCRD,
    0,
    [_gPIu, _gPA],
    [0, 0]
];
exports.GuardrailManagedWords$ = [3, n0, _GMW,
    0,
    [_ty, _iA, _oA, _iE, _oE],
    [0, [() => GuardrailWordAction, 0], [() => GuardrailWordAction, 0], 2, 2], 1
];
exports.GuardrailManagedWordsConfig$ = [3, n0, _GMWC,
    0,
    [_ty, _iA, _oA, _iE, _oE],
    [0, [() => GuardrailWordAction, 0], [() => GuardrailWordAction, 0], 2, 2], 1
];
exports.GuardrailPiiEntity$ = [3, n0, _GPE,
    0,
    [_ty, _ac, _iA, _oA, _iE, _oE],
    [0, 0, 0, 0, 2, 2], 2
];
exports.GuardrailPiiEntityConfig$ = [3, n0, _GPEC,
    0,
    [_ty, _ac, _iA, _oA, _iE, _oE],
    [0, 0, 0, 0, 2, 2], 2
];
exports.GuardrailRegex$ = [3, n0, _GR,
    0,
    [_n, _pa, _ac, _d, _iA, _oA, _iE, _oE],
    [0, 0, 0, 0, 0, 0, 2, 2], 3
];
exports.GuardrailRegexConfig$ = [3, n0, _GRC,
    0,
    [_n, _pa, _ac, _d, _iA, _oA, _iE, _oE],
    [0, 0, 0, 0, 0, 0, 2, 2], 3
];
exports.GuardrailSensitiveInformationPolicy$ = [3, n0, _GSIP,
    0,
    [_pEi, _re],
    [() => GuardrailPiiEntities, () => GuardrailRegexes]
];
exports.GuardrailSensitiveInformationPolicyConfig$ = [3, n0, _GSIPC,
    0,
    [_pEC, _rCe],
    [() => GuardrailPiiEntitiesConfig, () => GuardrailRegexesConfig]
];
exports.GuardrailSummary$ = [3, n0, _GS,
    0,
    [_i, _ar, _st, _n, _ve, _cA, _uA, _d, _cRD],
    [0, 0, 0, [() => GuardrailName, 0], 0, 5, 5, [() => GuardrailDescription, 0], () => exports.GuardrailCrossRegionDetails$], 7
];
exports.GuardrailTopic$ = [3, n0, _GT,
    0,
    [_n, _de, _exa, _ty, _iA, _oA, _iE, _oE],
    [[() => GuardrailTopicName, 0], [() => GuardrailTopicDefinition, 0], [() => GuardrailTopicExamples, 0], 0, [() => GuardrailTopicAction, 0], [() => GuardrailTopicAction, 0], 2, 2], 2
];
exports.GuardrailTopicConfig$ = [3, n0, _GTC,
    0,
    [_n, _de, _ty, _exa, _iA, _oA, _iE, _oE],
    [[() => GuardrailTopicName, 0], [() => GuardrailTopicDefinition, 0], 0, [() => GuardrailTopicExamples, 0], [() => GuardrailTopicAction, 0], [() => GuardrailTopicAction, 0], 2, 2], 3
];
exports.GuardrailTopicPolicy$ = [3, n0, _GTP,
    0,
    [_to, _ti],
    [[() => GuardrailTopics, 0], [() => exports.GuardrailTopicsTier$, 0]], 1
];
exports.GuardrailTopicPolicyConfig$ = [3, n0, _GTPC,
    0,
    [_tCo, _tCi],
    [[() => GuardrailTopicsConfig, 0], [() => exports.GuardrailTopicsTierConfig$, 0]], 1
];
exports.GuardrailTopicsTier$ = [3, n0, _GTT,
    0,
    [_tNi],
    [[() => GuardrailTopicsTierName, 0]], 1
];
exports.GuardrailTopicsTierConfig$ = [3, n0, _GTTC,
    0,
    [_tNi],
    [[() => GuardrailTopicsTierName, 0]], 1
];
exports.GuardrailWord$ = [3, n0, _GW,
    0,
    [_te, _iA, _oA, _iE, _oE],
    [0, [() => GuardrailWordAction, 0], [() => GuardrailWordAction, 0], 2, 2], 1
];
exports.GuardrailWordConfig$ = [3, n0, _GWC,
    0,
    [_te, _iA, _oA, _iE, _oE],
    [0, [() => GuardrailWordAction, 0], [() => GuardrailWordAction, 0], 2, 2], 1
];
exports.GuardrailWordPolicy$ = [3, n0, _GWP,
    0,
    [_w, _mWL],
    [[() => GuardrailWords, 0], [() => GuardrailManagedWordLists, 0]]
];
exports.GuardrailWordPolicyConfig$ = [3, n0, _GWPC,
    0,
    [_wCo, _mWLC],
    [[() => GuardrailWordsConfig, 0], [() => GuardrailManagedWordListsConfig, 0]]
];
exports.HumanEvaluationConfig$ = [3, n0, _HEC,
    0,
    [_dMC, _hWC, _cM],
    [[() => EvaluationDatasetMetricConfigs, 0], [() => exports.HumanWorkflowConfig$, 0], [() => HumanEvaluationCustomMetrics, 0]], 1
];
exports.HumanEvaluationCustomMetric$ = [3, n0, _HECM,
    0,
    [_n, _rM, _d],
    [[() => EvaluationMetricName, 0], 0, [() => EvaluationMetricDescription, 0]], 2
];
exports.HumanWorkflowConfig$ = [3, n0, _HWC,
    0,
    [_fDA, _in],
    [0, [() => HumanTaskInstructions, 0]], 1
];
exports.ImplicitFilterConfiguration$ = [3, n0, _IFC,
    0,
    [_mAe, _mA],
    [[() => MetadataAttributeSchemaList, 0], 0], 2
];
exports.ImportedModelSummary$ = [3, n0, _IMS,
    0,
    [_mA, _mN, _cTr, _iS, _mAo],
    [0, 0, 5, 2, 0], 3
];
exports.InferenceProfileModel$ = [3, n0, _IPM,
    0,
    [_mA],
    [0]
];
exports.InferenceProfileSummary$ = [3, n0, _IPS,
    0,
    [_iPN, _iPA, _mo, _iPIn, _st, _ty, _d, _cA, _uA],
    [0, 0, () => InferenceProfileModels, 0, 0, 0, [() => InferenceProfileDescription, 0], 5, 5], 6
];
exports.InvocationLogsConfig$ = [3, n0, _ILC,
    0,
    [_iLS, _uPR, _rMF],
    [() => exports.InvocationLogSource$, 2, [() => exports.RequestMetadataFilters$, 0]], 1
];
exports.KbInferenceConfig$ = [3, n0, _KIC,
    0,
    [_tIC],
    [() => exports.TextInferenceConfig$]
];
exports.KnowledgeBaseRetrievalConfiguration$ = [3, n0, _KBRC,
    0,
    [_vSC],
    [[() => exports.KnowledgeBaseVectorSearchConfiguration$, 0]], 1
];
exports.KnowledgeBaseRetrieveAndGenerateConfiguration$ = [3, n0, _KBRAGC,
    0,
    [_kBI, _mA, _rCet, _gCe, _oC],
    [0, 0, [() => exports.KnowledgeBaseRetrievalConfiguration$, 0], [() => exports.GenerationConfiguration$, 0], () => exports.OrchestrationConfiguration$], 2
];
exports.KnowledgeBaseVectorSearchConfiguration$ = [3, n0, _KBVSC,
    0,
    [_nOR, _oST, _fil, _iFC, _rCer],
    [1, 0, [() => exports.RetrievalFilter$, 0], [() => exports.ImplicitFilterConfiguration$, 0], [() => exports.VectorSearchRerankingConfiguration$, 0]]
];
exports.LambdaGraderConfig$ = [3, n0, _LGC,
    0,
    [_lA],
    [0], 1
];
exports.LegalTerm$ = [3, n0, _LT,
    0,
    [_ur],
    [0]
];
exports.ListAutomatedReasoningPoliciesRequest$ = [3, n0, _LARPR,
    0,
    [_pA, _nT, _mR],
    [[0, { [_hQ]: _pA }], [0, { [_hQ]: _nT }], [1, { [_hQ]: _mR }]]
];
exports.ListAutomatedReasoningPoliciesResponse$ = [3, n0, _LARPRi,
    0,
    [_aRPS, _nT],
    [[() => AutomatedReasoningPolicySummaries, 0], 0], 1
];
exports.ListAutomatedReasoningPolicyBuildWorkflowsRequest$ = [3, n0, _LARPBWR,
    0,
    [_pA, _nT, _mR],
    [[0, 1], [0, { [_hQ]: _nT }], [1, { [_hQ]: _mR }]], 1
];
exports.ListAutomatedReasoningPolicyBuildWorkflowsResponse$ = [3, n0, _LARPBWRi,
    0,
    [_aRPBWS, _nT],
    [() => AutomatedReasoningPolicyBuildWorkflowSummaries, 0], 1
];
exports.ListAutomatedReasoningPolicyTestCasesRequest$ = [3, n0, _LARPTCR,
    0,
    [_pA, _nT, _mR],
    [[0, 1], [0, { [_hQ]: _nT }], [1, { [_hQ]: _mR }]], 1
];
exports.ListAutomatedReasoningPolicyTestCasesResponse$ = [3, n0, _LARPTCRi,
    0,
    [_tCes, _nT],
    [[() => AutomatedReasoningPolicyTestCaseList, 0], 0], 1
];
exports.ListAutomatedReasoningPolicyTestResultsRequest$ = [3, n0, _LARPTRR,
    0,
    [_pA, _bWI, _nT, _mR],
    [[0, 1], [0, 1], [0, { [_hQ]: _nT }], [1, { [_hQ]: _mR }]], 2
];
exports.ListAutomatedReasoningPolicyTestResultsResponse$ = [3, n0, _LARPTRRi,
    0,
    [_tRe, _nT],
    [[() => AutomatedReasoningPolicyTestList, 0], 0], 1
];
exports.ListCustomModelDeploymentsRequest$ = [3, n0, _LCMDR,
    0,
    [_cBr, _cAr, _nC, _mR, _nT, _sB, _sO, _sEt, _mAE],
    [[5, { [_hQ]: _cBr }], [5, { [_hQ]: _cAr }], [0, { [_hQ]: _nC }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _sB }], [0, { [_hQ]: _sO }], [0, { [_hQ]: _sEt }], [0, { [_hQ]: _mAE }]]
];
exports.ListCustomModelDeploymentsResponse$ = [3, n0, _LCMDRi,
    0,
    [_nT, _mDSo],
    [0, () => CustomModelDeploymentSummaryList]
];
exports.ListCustomModelsRequest$ = [3, n0, _LCMR,
    0,
    [_cTB, _cTA, _nC, _bMAE, _fMAE, _mR, _nT, _sB, _sO, _iO, _mSo],
    [[5, { [_hQ]: _cTB }], [5, { [_hQ]: _cTA }], [0, { [_hQ]: _nC }], [0, { [_hQ]: _bMAE }], [0, { [_hQ]: _fMAE }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _sB }], [0, { [_hQ]: _sO }], [2, { [_hQ]: _iO }], [0, { [_hQ]: _mSo }]]
];
exports.ListCustomModelsResponse$ = [3, n0, _LCMRi,
    0,
    [_nT, _mSod],
    [0, () => CustomModelSummaryList]
];
exports.ListEnforcedGuardrailsConfigurationRequest$ = [3, n0, _LEGCR,
    0,
    [_nT],
    [[0, { [_hQ]: _nT }]]
];
exports.ListEnforcedGuardrailsConfigurationResponse$ = [3, n0, _LEGCRi,
    0,
    [_gCua, _nT],
    [() => AccountEnforcedGuardrailsOutputConfiguration, 0], 1
];
exports.ListEvaluationJobsRequest$ = [3, n0, _LEJR,
    0,
    [_cTA, _cTB, _sEt, _aTE, _nC, _mR, _nT, _sB, _sO],
    [[5, { [_hQ]: _cTA }], [5, { [_hQ]: _cTB }], [0, { [_hQ]: _sEt }], [0, { [_hQ]: _aTE }], [0, { [_hQ]: _nC }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _sB }], [0, { [_hQ]: _sO }]]
];
exports.ListEvaluationJobsResponse$ = [3, n0, _LEJRi,
    0,
    [_nT, _jSo],
    [0, () => EvaluationSummaries]
];
exports.ListFoundationModelAgreementOffersRequest$ = [3, n0, _LFMAOR,
    0,
    [_mIo, _oTf],
    [[0, 1], [0, { [_hQ]: _oTf }]], 1
];
exports.ListFoundationModelAgreementOffersResponse$ = [3, n0, _LFMAORi,
    0,
    [_mIo, _of],
    [0, () => Offers], 2
];
exports.ListFoundationModelsRequest$ = [3, n0, _LFMR,
    0,
    [_bP, _bCT, _bOMy, _bIT],
    [[0, { [_hQ]: _bP }], [0, { [_hQ]: _bCT }], [0, { [_hQ]: _bOMy }], [0, { [_hQ]: _bIT }]]
];
exports.ListFoundationModelsResponse$ = [3, n0, _LFMRi,
    0,
    [_mSod],
    [() => FoundationModelSummaryList]
];
exports.ListGuardrailsRequest$ = [3, n0, _LGR,
    0,
    [_gI, _mR, _nT],
    [[0, { [_hQ]: _gI }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }]]
];
exports.ListGuardrailsResponse$ = [3, n0, _LGRi,
    0,
    [_g, _nT],
    [[() => GuardrailSummaries, 0], 0], 1
];
exports.ListImportedModelsRequest$ = [3, n0, _LIMR,
    0,
    [_cTB, _cTA, _nC, _mR, _nT, _sB, _sO],
    [[5, { [_hQ]: _cTB }], [5, { [_hQ]: _cTA }], [0, { [_hQ]: _nC }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _sB }], [0, { [_hQ]: _sO }]]
];
exports.ListImportedModelsResponse$ = [3, n0, _LIMRi,
    0,
    [_nT, _mSod],
    [0, () => ImportedModelSummaryList]
];
exports.ListInferenceProfilesRequest$ = [3, n0, _LIPR,
    0,
    [_mR, _nT, _tE],
    [[1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _ty }]]
];
exports.ListInferenceProfilesResponse$ = [3, n0, _LIPRi,
    0,
    [_iPS, _nT],
    [[() => InferenceProfileSummaries, 0], 0]
];
exports.ListMarketplaceModelEndpointsRequest$ = [3, n0, _LMMER,
    0,
    [_mR, _nT, _mSE],
    [[1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _mSI }]]
];
exports.ListMarketplaceModelEndpointsResponse$ = [3, n0, _LMMERi,
    0,
    [_mMEa, _nT],
    [() => MarketplaceModelEndpointSummaries, 0]
];
exports.ListModelCopyJobsRequest$ = [3, n0, _LMCJR,
    0,
    [_cTA, _cTB, _sEt, _sAE, _sMAE, _tMNC, _mR, _nT, _sB, _sO],
    [[5, { [_hQ]: _cTA }], [5, { [_hQ]: _cTB }], [0, { [_hQ]: _sEt }], [0, { [_hQ]: _sAE }], [0, { [_hQ]: _sMAE }], [0, { [_hQ]: _oMNC }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _sB }], [0, { [_hQ]: _sO }]]
];
exports.ListModelCopyJobsResponse$ = [3, n0, _LMCJRi,
    0,
    [_nT, _mCJS],
    [0, () => ModelCopyJobSummaries]
];
exports.ListModelCustomizationJobsRequest$ = [3, n0, _LMCJRis,
    0,
    [_cTA, _cTB, _sEt, _nC, _mR, _nT, _sB, _sO],
    [[5, { [_hQ]: _cTA }], [5, { [_hQ]: _cTB }], [0, { [_hQ]: _sEt }], [0, { [_hQ]: _nC }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _sB }], [0, { [_hQ]: _sO }]]
];
exports.ListModelCustomizationJobsResponse$ = [3, n0, _LMCJRist,
    0,
    [_nT, _mCJSo],
    [0, () => ModelCustomizationJobSummaries]
];
exports.ListModelImportJobsRequest$ = [3, n0, _LMIJR,
    0,
    [_cTA, _cTB, _sEt, _nC, _mR, _nT, _sB, _sO],
    [[5, { [_hQ]: _cTA }], [5, { [_hQ]: _cTB }], [0, { [_hQ]: _sEt }], [0, { [_hQ]: _nC }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _sB }], [0, { [_hQ]: _sO }]]
];
exports.ListModelImportJobsResponse$ = [3, n0, _LMIJRi,
    0,
    [_nT, _mIJS],
    [0, () => ModelImportJobSummaries]
];
exports.ListModelInvocationJobsRequest$ = [3, n0, _LMIJRis,
    0,
    [_sTA, _sTB, _sEt, _nC, _mR, _nT, _sB, _sO],
    [[5, { [_hQ]: _sTA }], [5, { [_hQ]: _sTB }], [0, { [_hQ]: _sEt }], [0, { [_hQ]: _nC }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _sB }], [0, { [_hQ]: _sO }]]
];
exports.ListModelInvocationJobsResponse$ = [3, n0, _LMIJRist,
    0,
    [_nT, _iJS],
    [0, [() => ModelInvocationJobSummaries, 0]]
];
exports.ListPromptRoutersRequest$ = [3, n0, _LPRR,
    0,
    [_mR, _nT, _ty],
    [[1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _ty }]]
];
exports.ListPromptRoutersResponse$ = [3, n0, _LPRRi,
    0,
    [_pRS, _nT],
    [[() => PromptRouterSummaries, 0], 0]
];
exports.ListProvisionedModelThroughputsRequest$ = [3, n0, _LPMTR,
    0,
    [_cTA, _cTB, _sEt, _mAE, _nC, _mR, _nT, _sB, _sO],
    [[5, { [_hQ]: _cTA }], [5, { [_hQ]: _cTB }], [0, { [_hQ]: _sEt }], [0, { [_hQ]: _mAE }], [0, { [_hQ]: _nC }], [1, { [_hQ]: _mR }], [0, { [_hQ]: _nT }], [0, { [_hQ]: _sB }], [0, { [_hQ]: _sO }]]
];
exports.ListProvisionedModelThroughputsResponse$ = [3, n0, _LPMTRi,
    0,
    [_nT, _pMS],
    [0, () => ProvisionedModelSummaries]
];
exports.ListTagsForResourceRequest$ = [3, n0, _LTFRR,
    0,
    [_rARN],
    [0], 1
];
exports.ListTagsForResourceResponse$ = [3, n0, _LTFRRi,
    0,
    [_ta],
    [() => TagList]
];
exports.LoggingConfig$ = [3, n0, _LC,
    0,
    [_cWC, _sC, _tDDE, _iDDE, _eDDE, _vDDE, _aDDE],
    [() => exports.CloudWatchConfig$, () => exports.S3Config$, 2, 2, 2, 2, 2]
];
exports.MarketplaceModelEndpoint$ = [3, n0, _MME,
    0,
    [_eA, _mSI, _cA, _uA, _eCn, _eS, _st, _sM, _eSM],
    [0, 0, 5, 5, () => exports.EndpointConfig$, 0, 0, 0, 0], 6
];
exports.MarketplaceModelEndpointSummary$ = [3, n0, _MMES,
    0,
    [_eA, _mSI, _cA, _uA, _st, _sM],
    [0, 0, 5, 5, 0, 0], 4
];
exports.MetadataAttributeSchema$ = [3, n0, _MAS,
    8,
    [_k, _ty, _d],
    [0, 0, 0], 3
];
exports.MetadataConfigurationForReranking$ = [3, n0, _MCFR,
    0,
    [_sMe, _sMC],
    [0, [() => exports.RerankingMetadataSelectiveModeConfiguration$, 0]], 1
];
exports.ModelCopyJobSummary$ = [3, n0, _MCJS,
    0,
    [_jA, _st, _cTr, _tMA, _sAI, _sMA, _tMN, _tMKKA, _tMT, _fMa, _sMN],
    [0, 0, 5, 0, 0, 0, 0, 0, () => TagList, 0, 0], 6
];
exports.ModelCustomizationJobSummary$ = [3, n0, _MCJSo,
    0,
    [_jA, _bMA, _jN, _st, _cTr, _sD, _lMT, _eT, _cMA, _cMN, _cTu],
    [0, 0, 0, 0, 5, () => exports.StatusDetails$, 5, 5, 0, 0, 0], 5
];
exports.ModelEnforcement$ = [3, n0, _ME,
    0,
    [_iMn, _eMx],
    [64 | 0, 64 | 0], 2
];
exports.ModelImportJobSummary$ = [3, n0, _MIJS,
    0,
    [_jA, _jN, _st, _cTr, _lMT, _eT, _iMA, _iMN],
    [0, 0, 0, 5, 5, 5, 0, 0], 4
];
exports.ModelInvocationJobS3InputDataConfig$ = [3, n0, _MIJSIDC,
    0,
    [_sU, _sIF, _sBO],
    [0, 0, 0], 1
];
exports.ModelInvocationJobS3OutputDataConfig$ = [3, n0, _MIJSODC,
    0,
    [_sU, _sEKI, _sBO],
    [0, 0, 0], 1
];
exports.ModelInvocationJobSummary$ = [3, n0, _MIJSo,
    0,
    [_jA, _jN, _mIo, _rA, _sTu, _iDC, _oDC, _cRT, _st, _m, _lMT, _eT, _vCp, _tDIH, _jET, _mIT, _tRC, _pRC, _sRC, _eRC],
    [0, 0, 0, 0, 5, () => exports.ModelInvocationJobInputDataConfig$, () => exports.ModelInvocationJobOutputDataConfig$, 0, 0, [() => Message, 0], 5, 5, () => exports.VpcConfig$, 1, 5, 0, 1, 1, 1, 1], 7
];
exports.Offer$ = [3, n0, _O,
    0,
    [_oT, _tD, _oI],
    [0, () => exports.TermDetails$, 0], 2
];
exports.OrchestrationConfiguration$ = [3, n0, _OC,
    0,
    [_qTC],
    [() => exports.QueryTransformationConfiguration$], 1
];
exports.OutputDataConfig$ = [3, n0, _ODC,
    0,
    [_sU],
    [0], 1
];
exports.PerformanceConfiguration$ = [3, n0, _PC,
    0,
    [_la],
    [0]
];
exports.PricingTerm$ = [3, n0, _PT,
    0,
    [_rCa],
    [() => RateCard], 1
];
exports.PromptRouterSummary$ = [3, n0, _PRS,
    0,
    [_pRN, _rCo, _pRA, _mo, _fM, _st, _ty, _d, _cA, _uA],
    [0, () => exports.RoutingCriteria$, 0, () => PromptRouterTargetModels, () => exports.PromptRouterTargetModel$, 0, 0, [() => PromptRouterDescription, 0], 5, 5], 7
];
exports.PromptRouterTargetModel$ = [3, n0, _PRTM,
    0,
    [_mA],
    [0], 1
];
exports.PromptTemplate$ = [3, n0, _PTr,
    0,
    [_tPT],
    [[() => TextPromptTemplate, 0]]
];
exports.ProvisionedModelSummary$ = [3, n0, _PMS,
    0,
    [_pMN, _pMA, _mA, _dMA, _fMA, _mU, _dMU, _st, _cTr, _lMT, _cD, _cET],
    [0, 0, 0, 0, 0, 1, 1, 0, 5, 5, 0, 5], 10
];
exports.PutEnforcedGuardrailConfigurationRequest$ = [3, n0, _PEGCR,
    0,
    [_gIC, _cI],
    [() => exports.AccountEnforcedGuardrailInferenceInputConfiguration$, 0], 1
];
exports.PutEnforcedGuardrailConfigurationResponse$ = [3, n0, _PEGCRu,
    0,
    [_cI, _uA, _uB],
    [0, 5, 0]
];
exports.PutModelInvocationLoggingConfigurationRequest$ = [3, n0, _PMILCR,
    0,
    [_lC],
    [() => exports.LoggingConfig$], 1
];
exports.PutModelInvocationLoggingConfigurationResponse$ = [3, n0, _PMILCRu,
    0,
    [],
    []
];
exports.PutResourcePolicyRequest$ = [3, n0, _PRPR,
    0,
    [_rAe, _rP],
    [0, 0], 2
];
exports.PutResourcePolicyResponse$ = [3, n0, _PRPRu,
    0,
    [_rAe],
    [0]
];
exports.PutUseCaseForModelAccessRequest$ = [3, n0, _PUCFMAR,
    0,
    [_fD],
    [21], 1
];
exports.PutUseCaseForModelAccessResponse$ = [3, n0, _PUCFMARu,
    0,
    [],
    []
];
exports.QueryTransformationConfiguration$ = [3, n0, _QTC,
    0,
    [_ty],
    [0], 1
];
exports.RatingScaleItem$ = [3, n0, _RSI,
    0,
    [_de, _va],
    [0, () => exports.RatingScaleItemValue$], 2
];
exports.RegisterMarketplaceModelEndpointRequest$ = [3, n0, _RMMER,
    0,
    [_eI, _mSI],
    [[0, 1], 0], 2
];
exports.RegisterMarketplaceModelEndpointResponse$ = [3, n0, _RMMERe,
    0,
    [_mME],
    [() => exports.MarketplaceModelEndpoint$], 1
];
exports.RequestMetadataBaseFilters$ = [3, n0, _RMBF,
    0,
    [_eq, _nE],
    [[() => RequestMetadataMap, 0], [() => RequestMetadataMap, 0]]
];
exports.RetrieveAndGenerateConfiguration$ = [3, n0, _RAGC,
    0,
    [_ty, _kBC, _eSC],
    [0, [() => exports.KnowledgeBaseRetrieveAndGenerateConfiguration$, 0], [() => exports.ExternalSourcesRetrieveAndGenerateConfiguration$, 0]], 1
];
exports.RetrieveConfig$ = [3, n0, _RC,
    0,
    [_kBI, _kBRC],
    [0, [() => exports.KnowledgeBaseRetrievalConfiguration$, 0]], 2
];
exports.RFTConfig$ = [3, n0, _RFTC,
    0,
    [_gCr, _hP],
    [() => exports.GraderConfig$, () => exports.RFTHyperParameters$]
];
exports.RFTHyperParameters$ = [3, n0, _RFTHP,
    0,
    [_eCp, _bSa, _lR, _mPL, _tSPP, _iMTn, _rE, _eIv],
    [1, 1, 1, 1, 1, 1, 0, 1]
];
exports.RoutingCriteria$ = [3, n0, _RCo,
    0,
    [_rQD],
    [1], 1
];
exports.S3Config$ = [3, n0, _SC,
    0,
    [_bN, _kP],
    [0, 0], 1
];
exports.S3DataSource$ = [3, n0, _SDS,
    0,
    [_sU],
    [0], 1
];
exports.S3ObjectDoc$ = [3, n0, _SOD,
    0,
    [_uri],
    [0], 1
];
exports.SageMakerEndpoint$ = [3, n0, _SME,
    0,
    [_iIC, _iTn, _eRx, _kEK, _vp],
    [1, 0, 0, 0, () => exports.VpcConfig$], 3
];
exports.SelectiveContentGuarding$ = [3, n0, _SCG,
    0,
    [_sy, _me],
    [0, 0]
];
exports.StartAutomatedReasoningPolicyBuildWorkflowRequest$ = [3, n0, _SARPBWR,
    0,
    [_pA, _bWT, _sCo, _cRT],
    [[0, 1], [0, 1], [() => exports.AutomatedReasoningPolicyBuildWorkflowSource$, 16], [0, { [_hH]: _xact, [_iTd]: 1 }]], 3
];
exports.StartAutomatedReasoningPolicyBuildWorkflowResponse$ = [3, n0, _SARPBWRt,
    0,
    [_pA, _bWI],
    [0, 0], 2
];
exports.StartAutomatedReasoningPolicyTestWorkflowRequest$ = [3, n0, _SARPTWR,
    0,
    [_pA, _bWI, _tCIe, _cRT],
    [[0, 1], [0, 1], 64 | 0, [0, 4]], 2
];
exports.StartAutomatedReasoningPolicyTestWorkflowResponse$ = [3, n0, _SARPTWRt,
    0,
    [_pA],
    [0], 1
];
exports.StatusDetails$ = [3, n0, _SD,
    0,
    [_vD, _dPD, _tDr],
    [() => exports.ValidationDetails$, () => exports.DataProcessingDetails$, () => exports.TrainingDetails$]
];
exports.StopEvaluationJobRequest$ = [3, n0, _SEJR,
    0,
    [_jI],
    [[() => EvaluationJobIdentifier, 1]], 1
];
exports.StopEvaluationJobResponse$ = [3, n0, _SEJRt,
    0,
    [],
    []
];
exports.StopModelCustomizationJobRequest$ = [3, n0, _SMCJR,
    0,
    [_jI],
    [[0, 1]], 1
];
exports.StopModelCustomizationJobResponse$ = [3, n0, _SMCJRt,
    0,
    [],
    []
];
exports.StopModelInvocationJobRequest$ = [3, n0, _SMIJR,
    0,
    [_jI],
    [[0, 1]], 1
];
exports.StopModelInvocationJobResponse$ = [3, n0, _SMIJRt,
    0,
    [],
    []
];
exports.SupportTerm$ = [3, n0, _ST,
    0,
    [_rPD],
    [0]
];
exports.Tag$ = [3, n0, _T,
    0,
    [_k, _va],
    [0, 0], 2
];
exports.TagResourceRequest$ = [3, n0, _TRR,
    0,
    [_rARN, _ta],
    [0, () => TagList], 2
];
exports.TagResourceResponse$ = [3, n0, _TRRa,
    0,
    [],
    []
];
exports.TeacherModelConfig$ = [3, n0, _TMC,
    0,
    [_tMI, _mRLFI],
    [0, 1], 1
];
exports.TermDetails$ = [3, n0, _TD,
    0,
    [_uBPT, _lTeg, _sTup, _vT],
    [() => exports.PricingTerm$, () => exports.LegalTerm$, () => exports.SupportTerm$, () => exports.ValidityTerm$], 3
];
exports.TextInferenceConfig$ = [3, n0, _TIC,
    0,
    [_tem, _tPo, _mTa, _sS],
    [1, 1, 1, 64 | 0]
];
exports.TrainingDataConfig$ = [3, n0, _TDC,
    0,
    [_sU, _iLC],
    [0, [() => exports.InvocationLogsConfig$, 0]]
];
exports.TrainingDetails$ = [3, n0, _TDr,
    0,
    [_st, _cTr, _lMT],
    [0, 5, 5]
];
exports.TrainingMetrics$ = [3, n0, _TM,
    0,
    [_tL],
    [1]
];
exports.UntagResourceRequest$ = [3, n0, _URR,
    0,
    [_rARN, _tK],
    [0, 64 | 0], 2
];
exports.UntagResourceResponse$ = [3, n0, _URRn,
    0,
    [],
    []
];
exports.UpdateAutomatedReasoningPolicyAnnotationsRequest$ = [3, n0, _UARPAR,
    0,
    [_pA, _bWI, _an, _lUASH],
    [[0, 1], [0, 1], [() => AutomatedReasoningPolicyAnnotationList, 0], 0], 4
];
exports.UpdateAutomatedReasoningPolicyAnnotationsResponse$ = [3, n0, _UARPARp,
    0,
    [_pA, _bWI, _aSH, _uA],
    [0, 0, 0, 5], 4
];
exports.UpdateAutomatedReasoningPolicyRequest$ = [3, n0, _UARPR,
    0,
    [_pA, _pD, _n, _d],
    [[0, 1], [() => exports.AutomatedReasoningPolicyDefinition$, 0], [() => AutomatedReasoningPolicyName, 0], [() => AutomatedReasoningPolicyDescription, 0]], 2
];
exports.UpdateAutomatedReasoningPolicyResponse$ = [3, n0, _UARPRp,
    0,
    [_pA, _n, _dHe, _uA],
    [0, [() => AutomatedReasoningPolicyName, 0], 0, 5], 4
];
exports.UpdateAutomatedReasoningPolicyTestCaseRequest$ = [3, n0, _UARPTCR,
    0,
    [_pA, _tCI, _gC, _lUA, _eAFR, _qC, _cT, _cRT],
    [[0, 1], [0, 1], [() => AutomatedReasoningPolicyTestGuardContent, 0], 5, 0, [() => AutomatedReasoningPolicyTestQueryContent, 0], 1, [0, 4]], 5
];
exports.UpdateAutomatedReasoningPolicyTestCaseResponse$ = [3, n0, _UARPTCRp,
    0,
    [_pA, _tCI],
    [0, 0], 2
];
exports.UpdateCustomModelDeploymentRequest$ = [3, n0, _UCMDR,
    0,
    [_mA, _cMDI],
    [0, [0, 1]], 2
];
exports.UpdateCustomModelDeploymentResponse$ = [3, n0, _UCMDRp,
    0,
    [_cMDA],
    [0], 1
];
exports.UpdateGuardrailRequest$ = [3, n0, _UGR,
    0,
    [_gI, _n, _bIM, _bOM, _d, _tPC, _cPC, _wPC, _sIPC, _cGPC, _aRPC, _cRC, _kKI],
    [[0, 1], [() => GuardrailName, 0], [() => GuardrailBlockedMessaging, 0], [() => GuardrailBlockedMessaging, 0], [() => GuardrailDescription, 0], [() => exports.GuardrailTopicPolicyConfig$, 0], [() => exports.GuardrailContentPolicyConfig$, 0], [() => exports.GuardrailWordPolicyConfig$, 0], () => exports.GuardrailSensitiveInformationPolicyConfig$, [() => exports.GuardrailContextualGroundingPolicyConfig$, 0], () => exports.GuardrailAutomatedReasoningPolicyConfig$, () => exports.GuardrailCrossRegionConfig$, 0], 4
];
exports.UpdateGuardrailResponse$ = [3, n0, _UGRp,
    0,
    [_gIu, _gA, _ve, _uA],
    [0, 0, 0, 5], 4
];
exports.UpdateMarketplaceModelEndpointRequest$ = [3, n0, _UMMER,
    0,
    [_eA, _eCn, _cRT],
    [[0, 1], () => exports.EndpointConfig$, [0, 4]], 2
];
exports.UpdateMarketplaceModelEndpointResponse$ = [3, n0, _UMMERp,
    0,
    [_mME],
    [() => exports.MarketplaceModelEndpoint$], 1
];
exports.UpdateProvisionedModelThroughputRequest$ = [3, n0, _UPMTR,
    0,
    [_pMI, _dPMN, _dMI],
    [[0, 1], 0, 0], 1
];
exports.UpdateProvisionedModelThroughputResponse$ = [3, n0, _UPMTRp,
    0,
    [],
    []
];
exports.ValidationDataConfig$ = [3, n0, _VDC,
    0,
    [_val],
    [() => Validators], 1
];
exports.ValidationDetails$ = [3, n0, _VD,
    0,
    [_st, _cTr, _lMT],
    [0, 5, 5]
];
exports.Validator$ = [3, n0, _V,
    0,
    [_sU],
    [0], 1
];
exports.ValidatorMetric$ = [3, n0, _VM,
    0,
    [_vL],
    [1]
];
exports.ValidityTerm$ = [3, n0, _VT,
    0,
    [_aD],
    [0]
];
exports.VectorSearchBedrockRerankingConfiguration$ = [3, n0, _VSBRC,
    0,
    [_mC, _nORR, _mCe],
    [() => exports.VectorSearchBedrockRerankingModelConfiguration$, 1, [() => exports.MetadataConfigurationForReranking$, 0]], 1
];
exports.VectorSearchBedrockRerankingModelConfiguration$ = [3, n0, _VSBRMC,
    0,
    [_mA, _aMRF],
    [0, 128 | 15], 1
];
exports.VectorSearchRerankingConfiguration$ = [3, n0, _VSRC,
    0,
    [_ty, _bRC],
    [0, [() => exports.VectorSearchBedrockRerankingConfiguration$, 0]], 1
];
exports.VpcConfig$ = [3, n0, _VC,
    0,
    [_sIu, _sGI],
    [64 | 0, 64 | 0], 2
];
var AccountEnforcedGuardrailsOutputConfiguration = [1, n0, _AEGOCc,
    0, () => exports.AccountEnforcedGuardrailOutputConfiguration$
];
var AutomatedEvaluationCustomMetrics = [1, n0, _AECM,
    0, [() => exports.AutomatedEvaluationCustomMetricSource$,
        0]
];
var AutomatedReasoningCheckDifferenceScenarioList = [1, n0, _ARCDSL,
    0, [() => exports.AutomatedReasoningCheckScenario$,
        0]
];
var AutomatedReasoningCheckFindingList = [1, n0, _ARCFL,
    0, [() => exports.AutomatedReasoningCheckFinding$,
        0]
];
var AutomatedReasoningCheckInputTextReferenceList = [1, n0, _ARCITRL,
    0, [() => exports.AutomatedReasoningCheckInputTextReference$,
        0]
];
var AutomatedReasoningCheckRuleList = [1, n0, _ARCRL,
    0, () => exports.AutomatedReasoningCheckRule$
];
var AutomatedReasoningCheckTranslationList = [1, n0, _ARCTL,
    0, [() => exports.AutomatedReasoningCheckTranslation$,
        0]
];
var AutomatedReasoningCheckTranslationOptionList = [1, n0, _ARCTOL,
    0, [() => exports.AutomatedReasoningCheckTranslationOption$,
        0]
];
var AutomatedReasoningLogicStatementList = [1, n0, _ARLSL,
    0, [() => exports.AutomatedReasoningLogicStatement$,
        0]
];
var AutomatedReasoningPolicyAnnotatedChunkList = [1, n0, _ARPACL,
    0, [() => exports.AutomatedReasoningPolicyAnnotatedChunk$,
        0]
];
var AutomatedReasoningPolicyAnnotatedContentList = [1, n0, _ARPACLu,
    0, [() => exports.AutomatedReasoningPolicyAnnotatedContent$,
        0]
];
var AutomatedReasoningPolicyAnnotationList = [1, n0, _ARPALu,
    0, [() => exports.AutomatedReasoningPolicyAnnotation$,
        0]
];
var AutomatedReasoningPolicyArnList = 64 | 0;
var AutomatedReasoningPolicyAtomicStatementList = [1, n0, _ARPASL,
    0, [() => exports.AutomatedReasoningPolicyAtomicStatement$,
        0]
];
var AutomatedReasoningPolicyBuildLogEntryList = [1, n0, _ARPBLEL,
    0, [() => exports.AutomatedReasoningPolicyBuildLogEntry$,
        0]
];
var AutomatedReasoningPolicyBuildResultAssetManifestList = [1, n0, _ARPBRAML,
    0, [() => exports.AutomatedReasoningPolicyBuildResultAssetManifestEntry$,
        0]
];
var AutomatedReasoningPolicyBuildStepList = [1, n0, _ARPBSL,
    0, [() => exports.AutomatedReasoningPolicyBuildStep$,
        0]
];
var AutomatedReasoningPolicyBuildStepMessageList = [1, n0, _ARPBSML,
    0, () => exports.AutomatedReasoningPolicyBuildStepMessage$
];
var AutomatedReasoningPolicyBuildWorkflowDocumentList = [1, n0, _ARPBWDL,
    0, [() => exports.AutomatedReasoningPolicyBuildWorkflowDocument$,
        0]
];
var AutomatedReasoningPolicyBuildWorkflowSummaries = [1, n0, _ARPBWSut,
    0, () => exports.AutomatedReasoningPolicyBuildWorkflowSummary$
];
var AutomatedReasoningPolicyConflictedRuleIdList = 64 | 0;
var AutomatedReasoningPolicyDefinitionRuleIdList = 64 | 0;
var AutomatedReasoningPolicyDefinitionRuleList = [1, n0, _ARPDRL,
    0, [() => exports.AutomatedReasoningPolicyDefinitionRule$,
        0]
];
var AutomatedReasoningPolicyDefinitionTypeList = [1, n0, _ARPDTL,
    0, [() => exports.AutomatedReasoningPolicyDefinitionType$,
        0]
];
var AutomatedReasoningPolicyDefinitionTypeNameList = [1, n0, _ARPDTNL,
    0, [() => AutomatedReasoningPolicyDefinitionTypeName,
        0]
];
var AutomatedReasoningPolicyDefinitionTypeValueList = [1, n0, _ARPDTVL,
    0, [() => exports.AutomatedReasoningPolicyDefinitionTypeValue$,
        0]
];
var AutomatedReasoningPolicyDefinitionTypeValuePairList = [1, n0, _ARPDTVPL,
    0, [() => exports.AutomatedReasoningPolicyDefinitionTypeValuePair$,
        0]
];
var AutomatedReasoningPolicyDefinitionVariableList = [1, n0, _ARPDVL,
    0, [() => exports.AutomatedReasoningPolicyDefinitionVariable$,
        0]
];
var AutomatedReasoningPolicyDefinitionVariableNameList = [1, n0, _ARPDVNL,
    0, [() => AutomatedReasoningPolicyDefinitionVariableName,
        0]
];
var AutomatedReasoningPolicyDisjointedRuleIdList = 64 | 0;
var AutomatedReasoningPolicyDisjointRuleSetList = [1, n0, _ARPDRSL,
    0, [() => exports.AutomatedReasoningPolicyDisjointRuleSet$,
        0]
];
var AutomatedReasoningPolicyGeneratedTestCaseList = [1, n0, _ARPGTCL,
    0, [() => exports.AutomatedReasoningPolicyGeneratedTestCase$,
        0]
];
var AutomatedReasoningPolicyGenerateFidelityReportDocumentList = [1, n0, _ARPGFRDL,
    0, [() => exports.AutomatedReasoningPolicyBuildWorkflowDocument$,
        0]
];
var AutomatedReasoningPolicyJustificationList = [1, n0, _ARPJL,
    0, [() => AutomatedReasoningPolicyJustificationText,
        0]
];
var AutomatedReasoningPolicyLineNumberList = 64 | 1;
var AutomatedReasoningPolicyReportSourceDocumentList = [1, n0, _ARPRSDL,
    0, [() => exports.AutomatedReasoningPolicyReportSourceDocument$,
        0]
];
var AutomatedReasoningPolicyScenarioList = [1, n0, _ARPSLu,
    0, [() => exports.AutomatedReasoningPolicyScenario$,
        0]
];
var AutomatedReasoningPolicyStatementReferenceList = [1, n0, _ARPSRL,
    0, () => exports.AutomatedReasoningPolicyStatementReference$
];
var AutomatedReasoningPolicySummaries = [1, n0, _ARPSuto,
    0, [() => exports.AutomatedReasoningPolicySummary$,
        0]
];
var AutomatedReasoningPolicyTestCaseIdList = 64 | 0;
var AutomatedReasoningPolicyTestCaseList = [1, n0, _ARPTCL,
    0, [() => exports.AutomatedReasoningPolicyTestCase$,
        0]
];
var AutomatedReasoningPolicyTestList = [1, n0, _ARPTL,
    0, [() => exports.AutomatedReasoningPolicyTestResult$,
        0]
];
var AutomatedReasoningPolicyTypeValueAnnotationList = [1, n0, _ARPTVAL,
    0, [() => exports.AutomatedReasoningPolicyTypeValueAnnotation$,
        0]
];
var BatchDeleteEvaluationJobErrors = [1, n0, _BDEJEa,
    0, [() => exports.BatchDeleteEvaluationJobError$,
        0]
];
var BatchDeleteEvaluationJobItems = [1, n0, _BDEJIa,
    0, [() => exports.BatchDeleteEvaluationJobItem$,
        0]
];
var BedrockEvaluatorModels = [1, n0, _BEMe,
    0, () => exports.BedrockEvaluatorModel$
];
var CustomMetricBedrockEvaluatorModels = [1, n0, _CMBEMu,
    0, () => exports.CustomMetricBedrockEvaluatorModel$
];
var CustomModelDeploymentSummaryList = [1, n0, _CMDSL,
    0, () => exports.CustomModelDeploymentSummary$
];
var CustomModelSummaryList = [1, n0, _CMSL,
    0, () => exports.CustomModelSummary$
];
var ErrorMessages = 64 | 0;
var EvaluationBedrockKnowledgeBaseIdentifiers = 64 | 0;
var EvaluationBedrockModelIdentifiers = 64 | 0;
var EvaluationDatasetMetricConfigs = [1, n0, _EDMCv,
    0, [() => exports.EvaluationDatasetMetricConfig$,
        0]
];
var EvaluationJobIdentifiers = [1, n0, _EJIv,
    0, [() => EvaluationJobIdentifier,
        0]
];
var EvaluationMetricNames = [1, n0, _EMNv,
    0, [() => EvaluationMetricName,
        0]
];
var EvaluationModelConfigs = [1, n0, _EMC,
    0, [() => exports.EvaluationModelConfig$,
        0]
];
var EvaluationPrecomputedInferenceSourceIdentifiers = 64 | 0;
var EvaluationPrecomputedRagSourceIdentifiers = 64 | 0;
var EvaluationSummaries = [1, n0, _ESv,
    0, () => exports.EvaluationSummary$
];
var EvaluationTaskTypes = 64 | 0;
var EvaluatorModelIdentifiers = 64 | 0;
var ExcludedModelsList = 64 | 0;
var ExternalSources = [1, n0, _ESxt,
    0, [() => exports.ExternalSource$,
        0]
];
var FieldsForReranking = [1, n0, _FFRi,
    8, () => exports.FieldForReranking$
];
var FoundationModelSummaryList = [1, n0, _FMSL,
    0, () => exports.FoundationModelSummary$
];
var GuardrailContentFilters = [1, n0, _GCFu,
    0, [() => exports.GuardrailContentFilter$,
        0]
];
var GuardrailContentFiltersConfig = [1, n0, _GCFCu,
    0, [() => exports.GuardrailContentFilterConfig$,
        0]
];
var GuardrailContextualGroundingFilters = [1, n0, _GCGFu,
    0, [() => exports.GuardrailContextualGroundingFilter$,
        0]
];
var GuardrailContextualGroundingFiltersConfig = [1, n0, _GCGFCu,
    0, [() => exports.GuardrailContextualGroundingFilterConfig$,
        0]
];
var GuardrailFailureRecommendations = [1, n0, _GFRu,
    0, [() => GuardrailFailureRecommendation,
        0]
];
var GuardrailManagedWordLists = [1, n0, _GMWL,
    0, [() => exports.GuardrailManagedWords$,
        0]
];
var GuardrailManagedWordListsConfig = [1, n0, _GMWLC,
    0, [() => exports.GuardrailManagedWordsConfig$,
        0]
];
var GuardrailModalities = [1, n0, _GMu,
    0, [() => GuardrailModality,
        0]
];
var GuardrailPiiEntities = [1, n0, _GPEu,
    0, () => exports.GuardrailPiiEntity$
];
var GuardrailPiiEntitiesConfig = [1, n0, _GPECu,
    0, () => exports.GuardrailPiiEntityConfig$
];
var GuardrailRegexes = [1, n0, _GRu,
    0, () => exports.GuardrailRegex$
];
var GuardrailRegexesConfig = [1, n0, _GRCu,
    0, () => exports.GuardrailRegexConfig$
];
var GuardrailStatusReasons = [1, n0, _GSRu,
    0, [() => GuardrailStatusReason,
        0]
];
var GuardrailSummaries = [1, n0, _GSu,
    0, [() => exports.GuardrailSummary$,
        0]
];
var GuardrailTopicExamples = [1, n0, _GTEu,
    0, [() => GuardrailTopicExample,
        0]
];
var GuardrailTopics = [1, n0, _GTu,
    0, [() => exports.GuardrailTopic$,
        0]
];
var GuardrailTopicsConfig = [1, n0, _GTCu,
    0, [() => exports.GuardrailTopicConfig$,
        0]
];
var GuardrailWords = [1, n0, _GWu,
    0, [() => exports.GuardrailWord$,
        0]
];
var GuardrailWordsConfig = [1, n0, _GWCu,
    0, [() => exports.GuardrailWordConfig$,
        0]
];
var HumanEvaluationCustomMetrics = [1, n0, _HECMu,
    0, [() => exports.HumanEvaluationCustomMetric$,
        0]
];
var ImportedModelSummaryList = [1, n0, _IMSL,
    0, () => exports.ImportedModelSummary$
];
var IncludedModelsList = 64 | 0;
var InferenceProfileModels = [1, n0, _IPMn,
    0, () => exports.InferenceProfileModel$
];
var InferenceProfileSummaries = [1, n0, _IPSn,
    0, [() => exports.InferenceProfileSummary$,
        0]
];
var InferenceTypeList = 64 | 0;
var MarketplaceModelEndpointSummaries = [1, n0, _MMESa,
    0, () => exports.MarketplaceModelEndpointSummary$
];
var MetadataAttributeSchemaList = [1, n0, _MASL,
    0, [() => exports.MetadataAttributeSchema$,
        0]
];
var ModelCopyJobSummaries = [1, n0, _MCJSod,
    0, () => exports.ModelCopyJobSummary$
];
var ModelCustomizationJobSummaries = [1, n0, _MCJSode,
    0, () => exports.ModelCustomizationJobSummary$
];
var ModelCustomizationList = 64 | 0;
var ModelImportJobSummaries = [1, n0, _MIJSod,
    0, () => exports.ModelImportJobSummary$
];
var ModelInvocationJobSummaries = [1, n0, _MIJSode,
    0, [() => exports.ModelInvocationJobSummary$,
        0]
];
var ModelModalityList = 64 | 0;
var Offers = [1, n0, _Of,
    0, () => exports.Offer$
];
var PromptRouterSummaries = [1, n0, _PRSr,
    0, [() => exports.PromptRouterSummary$,
        0]
];
var PromptRouterTargetModels = [1, n0, _PRTMr,
    0, () => exports.PromptRouterTargetModel$
];
var ProvisionedModelSummaries = [1, n0, _PMSr,
    0, () => exports.ProvisionedModelSummary$
];
var RagConfigs = [1, n0, _RCa,
    0, [() => exports.RAGConfig$,
        0]
];
var RAGStopSequences = 64 | 0;
var RateCard = [1, n0, _RCat,
    0, () => exports.DimensionalPriceRate$
];
var RatingScale = [1, n0, _RS,
    0, () => exports.RatingScaleItem$
];
var RequestMetadataFiltersList = [1, n0, _RMFL,
    0, [() => exports.RequestMetadataBaseFilters$,
        0]
];
var RetrievalFilterList = [1, n0, _RFL,
    0, [() => exports.RetrievalFilter$,
        0]
];
var SecurityGroupIds = 64 | 0;
var SubnetIds = 64 | 0;
var TagKeyList = 64 | 0;
var TagList = [1, n0, _TL,
    0, () => exports.Tag$
];
var ValidationMetrics = [1, n0, _VMa,
    0, () => exports.ValidatorMetric$
];
var Validators = [1, n0, _Va,
    0, () => exports.Validator$
];
var AdditionalModelRequestFields = 128 | 15;
var AutomatedReasoningPolicyRuleReportMap = [2, n0, _ARPRRM,
    0, [0,
        0],
    [() => exports.AutomatedReasoningPolicyRuleReport$,
        0]
];
var AutomatedReasoningPolicyVariableReportMap = [2, n0, _ARPVRM,
    0, [() => AutomatedReasoningPolicyDefinitionVariableName,
        0],
    [() => exports.AutomatedReasoningPolicyVariableReport$,
        0]
];
var ModelCustomizationHyperParameters = 128 | 0;
var RequestMetadataMap = [2, n0, _RMM,
    8, 0, 0
];
exports.AutomatedEvaluationCustomMetricSource$ = [4, n0, _AECMS,
    0,
    [_cMD],
    [[() => exports.CustomMetricDefinition$, 0]]
];
exports.AutomatedReasoningCheckFinding$ = [4, n0, _ARCF,
    0,
    [_vali, _inv, _sa, _im, _tA, _tCoo, _nTo],
    [[() => exports.AutomatedReasoningCheckValidFinding$, 0], [() => exports.AutomatedReasoningCheckInvalidFinding$, 0], [() => exports.AutomatedReasoningCheckSatisfiableFinding$, 0], [() => exports.AutomatedReasoningCheckImpossibleFinding$, 0], [() => exports.AutomatedReasoningCheckTranslationAmbiguousFinding$, 0], () => exports.AutomatedReasoningCheckTooComplexFinding$, () => exports.AutomatedReasoningCheckNoTranslationsFinding$]
];
exports.AutomatedReasoningPolicyAnnotatedContent$ = [4, n0, _ARPACu,
    0,
    [_lin],
    [[() => exports.AutomatedReasoningPolicyAnnotatedLine$, 0]]
];
exports.AutomatedReasoningPolicyAnnotation$ = [4, n0, _ARPA,
    0,
    [_aTd, _uTp, _dT, _aV, _uVp, _dV, _aR, _uR, _dR, _aRFNL, _uFRF, _uFSF, _iCn],
    [[() => exports.AutomatedReasoningPolicyAddTypeAnnotation$, 0], [() => exports.AutomatedReasoningPolicyUpdateTypeAnnotation$, 0], [() => exports.AutomatedReasoningPolicyDeleteTypeAnnotation$, 0], [() => exports.AutomatedReasoningPolicyAddVariableAnnotation$, 0], [() => exports.AutomatedReasoningPolicyUpdateVariableAnnotation$, 0], [() => exports.AutomatedReasoningPolicyDeleteVariableAnnotation$, 0], [() => exports.AutomatedReasoningPolicyAddRuleAnnotation$, 0], [() => exports.AutomatedReasoningPolicyUpdateRuleAnnotation$, 0], () => exports.AutomatedReasoningPolicyDeleteRuleAnnotation$, [() => exports.AutomatedReasoningPolicyAddRuleFromNaturalLanguageAnnotation$, 0], [() => exports.AutomatedReasoningPolicyUpdateFromRuleFeedbackAnnotation$, 0], [() => exports.AutomatedReasoningPolicyUpdateFromScenarioFeedbackAnnotation$, 0], [() => exports.AutomatedReasoningPolicyIngestContentAnnotation$, 0]]
];
exports.AutomatedReasoningPolicyBuildResultAssets$ = [4, n0, _ARPBRA,
    0,
    [_pD, _qR, _bL, _gTC, _pS, _aM, _do, _fRi],
    [[() => exports.AutomatedReasoningPolicyDefinition$, 0], [() => exports.AutomatedReasoningPolicyDefinitionQualityReport$, 0], [() => exports.AutomatedReasoningPolicyBuildLog$, 0], [() => exports.AutomatedReasoningPolicyGeneratedTestCases$, 0], [() => exports.AutomatedReasoningPolicyScenarios$, 0], [() => exports.AutomatedReasoningPolicyBuildResultAssetManifest$, 0], [() => exports.AutomatedReasoningPolicySourceDocument$, 0], [() => exports.AutomatedReasoningPolicyFidelityReport$, 0]]
];
exports.AutomatedReasoningPolicyBuildStepContext$ = [4, n0, _ARPBSC,
    0,
    [_pl, _mu],
    [() => exports.AutomatedReasoningPolicyPlanning$, [() => exports.AutomatedReasoningPolicyMutation$, 0]]
];
exports.AutomatedReasoningPolicyDefinitionElement$ = [4, n0, _ARPDE,
    0,
    [_pDV, _pDT, _pDR],
    [[() => exports.AutomatedReasoningPolicyDefinitionVariable$, 0], [() => exports.AutomatedReasoningPolicyDefinitionType$, 0], [() => exports.AutomatedReasoningPolicyDefinitionRule$, 0]]
];
exports.AutomatedReasoningPolicyGenerateFidelityReportContent$ = [4, n0, _ARPGFRC,
    0,
    [_doc],
    [[() => AutomatedReasoningPolicyGenerateFidelityReportDocumentList, 0]]
];
exports.AutomatedReasoningPolicyMutation$ = [4, n0, _ARPM,
    0,
    [_aTd, _uTp, _dT, _aV, _uVp, _dV, _aR, _uR, _dR],
    [[() => exports.AutomatedReasoningPolicyAddTypeMutation$, 0], [() => exports.AutomatedReasoningPolicyUpdateTypeMutation$, 0], [() => exports.AutomatedReasoningPolicyDeleteTypeMutation$, 0], [() => exports.AutomatedReasoningPolicyAddVariableMutation$, 0], [() => exports.AutomatedReasoningPolicyUpdateVariableMutation$, 0], [() => exports.AutomatedReasoningPolicyDeleteVariableMutation$, 0], [() => exports.AutomatedReasoningPolicyAddRuleMutation$, 0], [() => exports.AutomatedReasoningPolicyUpdateRuleMutation$, 0], () => exports.AutomatedReasoningPolicyDeleteRuleMutation$]
];
exports.AutomatedReasoningPolicyTypeValueAnnotation$ = [4, n0, _ARPTVA,
    0,
    [_aTV, _uTVp, _dTV],
    [[() => exports.AutomatedReasoningPolicyAddTypeValue$, 0], [() => exports.AutomatedReasoningPolicyUpdateTypeValue$, 0], () => exports.AutomatedReasoningPolicyDeleteTypeValue$]
];
exports.AutomatedReasoningPolicyWorkflowTypeContent$ = [4, n0, _ARPWTC,
    0,
    [_doc, _pRAo, _gFRC],
    [[() => AutomatedReasoningPolicyBuildWorkflowDocumentList, 0], [() => exports.AutomatedReasoningPolicyBuildWorkflowRepairContent$, 0], [() => exports.AutomatedReasoningPolicyGenerateFidelityReportContent$, 0]]
];
exports.CustomizationConfig$ = [4, n0, _CC,
    0,
    [_dCi, _rCf],
    [() => exports.DistillationConfig$, () => exports.RFTConfig$]
];
exports.EndpointConfig$ = [4, n0, _EC,
    0,
    [_sMa],
    [() => exports.SageMakerEndpoint$]
];
exports.EvaluationConfig$ = [4, n0, _ECv,
    0,
    [_au, _h],
    [[() => exports.AutomatedEvaluationConfig$, 0], [() => exports.HumanEvaluationConfig$, 0]]
];
exports.EvaluationDatasetLocation$ = [4, n0, _EDL,
    0,
    [_sU],
    [0]
];
exports.EvaluationInferenceConfig$ = [4, n0, _EIC,
    0,
    [_mo, _rCag],
    [[() => EvaluationModelConfigs, 0], [() => RagConfigs, 0]]
];
exports.EvaluationModelConfig$ = [4, n0, _EMCv,
    0,
    [_bM, _pIS],
    [[() => exports.EvaluationBedrockModel$, 0], () => exports.EvaluationPrecomputedInferenceSource$]
];
exports.EvaluationPrecomputedRagSourceConfig$ = [4, n0, _EPRSCv,
    0,
    [_rSC, _rAGSC],
    [() => exports.EvaluationPrecomputedRetrieveSourceConfig$, () => exports.EvaluationPrecomputedRetrieveAndGenerateSourceConfig$]
];
exports.EvaluatorModelConfig$ = [4, n0, _EMCva,
    0,
    [_bEM],
    [() => BedrockEvaluatorModels]
];
exports.GraderConfig$ = [4, n0, _GCr,
    0,
    [_lG],
    [() => exports.LambdaGraderConfig$]
];
exports.InferenceProfileModelSource$ = [4, n0, _IPMS,
    0,
    [_cF],
    [0]
];
exports.InvocationLogSource$ = [4, n0, _ILS,
    0,
    [_sU],
    [0]
];
exports.KnowledgeBaseConfig$ = [4, n0, _KBC,
    0,
    [_rCetr, _rAGC],
    [[() => exports.RetrieveConfig$, 0], [() => exports.RetrieveAndGenerateConfiguration$, 0]]
];
exports.ModelDataSource$ = [4, n0, _MDS,
    0,
    [_sDS],
    [() => exports.S3DataSource$]
];
exports.ModelInvocationJobInputDataConfig$ = [4, n0, _MIJIDC,
    0,
    [_sIDC],
    [() => exports.ModelInvocationJobS3InputDataConfig$]
];
exports.ModelInvocationJobOutputDataConfig$ = [4, n0, _MIJODC,
    0,
    [_sODC],
    [() => exports.ModelInvocationJobS3OutputDataConfig$]
];
exports.RAGConfig$ = [4, n0, _RAGCo,
    0,
    [_kBCn, _pRSC],
    [[() => exports.KnowledgeBaseConfig$, 0], () => exports.EvaluationPrecomputedRagSourceConfig$]
];
exports.RatingScaleItemValue$ = [4, n0, _RSIV,
    0,
    [_sV, _fV],
    [0, 1]
];
exports.RequestMetadataFilters$ = [4, n0, _RMF,
    0,
    [_eq, _nE, _aAn, _oAr],
    [[() => RequestMetadataMap, 0], [() => RequestMetadataMap, 0], [() => RequestMetadataFiltersList, 0], [() => RequestMetadataFiltersList, 0]]
];
exports.RerankingMetadataSelectiveModeConfiguration$ = [4, n0, _RMSMC,
    0,
    [_fTI, _fTE],
    [[() => FieldsForReranking, 0], [() => FieldsForReranking, 0]]
];
exports.RetrievalFilter$ = [4, n0, _RF,
    8,
    [_eq, _nE, _gT, _gTOE, _lTes, _lTOE, _in_, _nI, _sW, _lCi, _sCt, _aAn, _oAr],
    [() => exports.FilterAttribute$, () => exports.FilterAttribute$, () => exports.FilterAttribute$, () => exports.FilterAttribute$, () => exports.FilterAttribute$, () => exports.FilterAttribute$, () => exports.FilterAttribute$, () => exports.FilterAttribute$, () => exports.FilterAttribute$, () => exports.FilterAttribute$, () => exports.FilterAttribute$, [() => RetrievalFilterList, 0], [() => RetrievalFilterList, 0]]
];
exports.BatchDeleteEvaluationJob$ = [9, n0, _BDEJ,
    { [_ht]: ["POST", "/evaluation-jobs/batch-delete", 202] }, () => exports.BatchDeleteEvaluationJobRequest$, () => exports.BatchDeleteEvaluationJobResponse$
];
exports.CancelAutomatedReasoningPolicyBuildWorkflow$ = [9, n0, _CARPBW,
    { [_ht]: ["POST", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}/cancel", 202] }, () => exports.CancelAutomatedReasoningPolicyBuildWorkflowRequest$, () => exports.CancelAutomatedReasoningPolicyBuildWorkflowResponse$
];
exports.CreateAutomatedReasoningPolicy$ = [9, n0, _CARP,
    { [_ht]: ["POST", "/automated-reasoning-policies", 200] }, () => exports.CreateAutomatedReasoningPolicyRequest$, () => exports.CreateAutomatedReasoningPolicyResponse$
];
exports.CreateAutomatedReasoningPolicyTestCase$ = [9, n0, _CARPTC,
    { [_ht]: ["POST", "/automated-reasoning-policies/{policyArn}/test-cases", 200] }, () => exports.CreateAutomatedReasoningPolicyTestCaseRequest$, () => exports.CreateAutomatedReasoningPolicyTestCaseResponse$
];
exports.CreateAutomatedReasoningPolicyVersion$ = [9, n0, _CARPV,
    { [_ht]: ["POST", "/automated-reasoning-policies/{policyArn}/versions", 200] }, () => exports.CreateAutomatedReasoningPolicyVersionRequest$, () => exports.CreateAutomatedReasoningPolicyVersionResponse$
];
exports.CreateCustomModel$ = [9, n0, _CCM,
    { [_ht]: ["POST", "/custom-models/create-custom-model", 202] }, () => exports.CreateCustomModelRequest$, () => exports.CreateCustomModelResponse$
];
exports.CreateCustomModelDeployment$ = [9, n0, _CCMD,
    { [_ht]: ["POST", "/model-customization/custom-model-deployments", 202] }, () => exports.CreateCustomModelDeploymentRequest$, () => exports.CreateCustomModelDeploymentResponse$
];
exports.CreateEvaluationJob$ = [9, n0, _CEJ,
    { [_ht]: ["POST", "/evaluation-jobs", 202] }, () => exports.CreateEvaluationJobRequest$, () => exports.CreateEvaluationJobResponse$
];
exports.CreateFoundationModelAgreement$ = [9, n0, _CFMA,
    { [_ht]: ["POST", "/create-foundation-model-agreement", 202] }, () => exports.CreateFoundationModelAgreementRequest$, () => exports.CreateFoundationModelAgreementResponse$
];
exports.CreateGuardrail$ = [9, n0, _CG,
    { [_ht]: ["POST", "/guardrails", 202] }, () => exports.CreateGuardrailRequest$, () => exports.CreateGuardrailResponse$
];
exports.CreateGuardrailVersion$ = [9, n0, _CGV,
    { [_ht]: ["POST", "/guardrails/{guardrailIdentifier}", 202] }, () => exports.CreateGuardrailVersionRequest$, () => exports.CreateGuardrailVersionResponse$
];
exports.CreateInferenceProfile$ = [9, n0, _CIP,
    { [_ht]: ["POST", "/inference-profiles", 201] }, () => exports.CreateInferenceProfileRequest$, () => exports.CreateInferenceProfileResponse$
];
exports.CreateMarketplaceModelEndpoint$ = [9, n0, _CMME,
    { [_ht]: ["POST", "/marketplace-model/endpoints", 200] }, () => exports.CreateMarketplaceModelEndpointRequest$, () => exports.CreateMarketplaceModelEndpointResponse$
];
exports.CreateModelCopyJob$ = [9, n0, _CMCJ,
    { [_ht]: ["POST", "/model-copy-jobs", 201] }, () => exports.CreateModelCopyJobRequest$, () => exports.CreateModelCopyJobResponse$
];
exports.CreateModelCustomizationJob$ = [9, n0, _CMCJr,
    { [_ht]: ["POST", "/model-customization-jobs", 201] }, () => exports.CreateModelCustomizationJobRequest$, () => exports.CreateModelCustomizationJobResponse$
];
exports.CreateModelImportJob$ = [9, n0, _CMIJ,
    { [_ht]: ["POST", "/model-import-jobs", 201] }, () => exports.CreateModelImportJobRequest$, () => exports.CreateModelImportJobResponse$
];
exports.CreateModelInvocationJob$ = [9, n0, _CMIJr,
    { [_ht]: ["POST", "/model-invocation-job", 200] }, () => exports.CreateModelInvocationJobRequest$, () => exports.CreateModelInvocationJobResponse$
];
exports.CreatePromptRouter$ = [9, n0, _CPR,
    { [_ht]: ["POST", "/prompt-routers", 200] }, () => exports.CreatePromptRouterRequest$, () => exports.CreatePromptRouterResponse$
];
exports.CreateProvisionedModelThroughput$ = [9, n0, _CPMT,
    { [_ht]: ["POST", "/provisioned-model-throughput", 201] }, () => exports.CreateProvisionedModelThroughputRequest$, () => exports.CreateProvisionedModelThroughputResponse$
];
exports.DeleteAutomatedReasoningPolicy$ = [9, n0, _DARP,
    { [_ht]: ["DELETE", "/automated-reasoning-policies/{policyArn}", 202] }, () => exports.DeleteAutomatedReasoningPolicyRequest$, () => exports.DeleteAutomatedReasoningPolicyResponse$
];
exports.DeleteAutomatedReasoningPolicyBuildWorkflow$ = [9, n0, _DARPBW,
    { [_ht]: ["DELETE", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}", 202] }, () => exports.DeleteAutomatedReasoningPolicyBuildWorkflowRequest$, () => exports.DeleteAutomatedReasoningPolicyBuildWorkflowResponse$
];
exports.DeleteAutomatedReasoningPolicyTestCase$ = [9, n0, _DARPTC,
    { [_ht]: ["DELETE", "/automated-reasoning-policies/{policyArn}/test-cases/{testCaseId}", 202] }, () => exports.DeleteAutomatedReasoningPolicyTestCaseRequest$, () => exports.DeleteAutomatedReasoningPolicyTestCaseResponse$
];
exports.DeleteCustomModel$ = [9, n0, _DCM,
    { [_ht]: ["DELETE", "/custom-models/{modelIdentifier}", 200] }, () => exports.DeleteCustomModelRequest$, () => exports.DeleteCustomModelResponse$
];
exports.DeleteCustomModelDeployment$ = [9, n0, _DCMD,
    { [_ht]: ["DELETE", "/model-customization/custom-model-deployments/{customModelDeploymentIdentifier}", 200] }, () => exports.DeleteCustomModelDeploymentRequest$, () => exports.DeleteCustomModelDeploymentResponse$
];
exports.DeleteEnforcedGuardrailConfiguration$ = [9, n0, _DEGC,
    { [_ht]: ["DELETE", "/enforcedGuardrailsConfiguration/{configId}", 200] }, () => exports.DeleteEnforcedGuardrailConfigurationRequest$, () => exports.DeleteEnforcedGuardrailConfigurationResponse$
];
exports.DeleteFoundationModelAgreement$ = [9, n0, _DFMA,
    { [_ht]: ["POST", "/delete-foundation-model-agreement", 202] }, () => exports.DeleteFoundationModelAgreementRequest$, () => exports.DeleteFoundationModelAgreementResponse$
];
exports.DeleteGuardrail$ = [9, n0, _DG,
    { [_ht]: ["DELETE", "/guardrails/{guardrailIdentifier}", 202] }, () => exports.DeleteGuardrailRequest$, () => exports.DeleteGuardrailResponse$
];
exports.DeleteImportedModel$ = [9, n0, _DIM,
    { [_ht]: ["DELETE", "/imported-models/{modelIdentifier}", 200] }, () => exports.DeleteImportedModelRequest$, () => exports.DeleteImportedModelResponse$
];
exports.DeleteInferenceProfile$ = [9, n0, _DIP,
    { [_ht]: ["DELETE", "/inference-profiles/{inferenceProfileIdentifier}", 200] }, () => exports.DeleteInferenceProfileRequest$, () => exports.DeleteInferenceProfileResponse$
];
exports.DeleteMarketplaceModelEndpoint$ = [9, n0, _DMME,
    { [_ht]: ["DELETE", "/marketplace-model/endpoints/{endpointArn}", 200] }, () => exports.DeleteMarketplaceModelEndpointRequest$, () => exports.DeleteMarketplaceModelEndpointResponse$
];
exports.DeleteModelInvocationLoggingConfiguration$ = [9, n0, _DMILC,
    { [_ht]: ["DELETE", "/logging/modelinvocations", 200] }, () => exports.DeleteModelInvocationLoggingConfigurationRequest$, () => exports.DeleteModelInvocationLoggingConfigurationResponse$
];
exports.DeletePromptRouter$ = [9, n0, _DPRe,
    { [_ht]: ["DELETE", "/prompt-routers/{promptRouterArn}", 200] }, () => exports.DeletePromptRouterRequest$, () => exports.DeletePromptRouterResponse$
];
exports.DeleteProvisionedModelThroughput$ = [9, n0, _DPMT,
    { [_ht]: ["DELETE", "/provisioned-model-throughput/{provisionedModelId}", 200] }, () => exports.DeleteProvisionedModelThroughputRequest$, () => exports.DeleteProvisionedModelThroughputResponse$
];
exports.DeleteResourcePolicy$ = [9, n0, _DRP,
    { [_ht]: ["DELETE", "/resource-policy/{resourceArn}", 200] }, () => exports.DeleteResourcePolicyRequest$, () => exports.DeleteResourcePolicyResponse$
];
exports.DeregisterMarketplaceModelEndpoint$ = [9, n0, _DMMEe,
    { [_ht]: ["DELETE", "/marketplace-model/endpoints/{endpointArn}/registration", 200] }, () => exports.DeregisterMarketplaceModelEndpointRequest$, () => exports.DeregisterMarketplaceModelEndpointResponse$
];
exports.ExportAutomatedReasoningPolicyVersion$ = [9, n0, _EARPV,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/export", 200] }, () => exports.ExportAutomatedReasoningPolicyVersionRequest$, () => exports.ExportAutomatedReasoningPolicyVersionResponse$
];
exports.GetAutomatedReasoningPolicy$ = [9, n0, _GARPe,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}", 200] }, () => exports.GetAutomatedReasoningPolicyRequest$, () => exports.GetAutomatedReasoningPolicyResponse$
];
exports.GetAutomatedReasoningPolicyAnnotations$ = [9, n0, _GARPA,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}/annotations", 200] }, () => exports.GetAutomatedReasoningPolicyAnnotationsRequest$, () => exports.GetAutomatedReasoningPolicyAnnotationsResponse$
];
exports.GetAutomatedReasoningPolicyBuildWorkflow$ = [9, n0, _GARPBW,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}", 200] }, () => exports.GetAutomatedReasoningPolicyBuildWorkflowRequest$, () => exports.GetAutomatedReasoningPolicyBuildWorkflowResponse$
];
exports.GetAutomatedReasoningPolicyBuildWorkflowResultAssets$ = [9, n0, _GARPBWRA,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}/result-assets", 200] }, () => exports.GetAutomatedReasoningPolicyBuildWorkflowResultAssetsRequest$, () => exports.GetAutomatedReasoningPolicyBuildWorkflowResultAssetsResponse$
];
exports.GetAutomatedReasoningPolicyNextScenario$ = [9, n0, _GARPNS,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}/scenarios", 200] }, () => exports.GetAutomatedReasoningPolicyNextScenarioRequest$, () => exports.GetAutomatedReasoningPolicyNextScenarioResponse$
];
exports.GetAutomatedReasoningPolicyTestCase$ = [9, n0, _GARPTC,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/test-cases/{testCaseId}", 200] }, () => exports.GetAutomatedReasoningPolicyTestCaseRequest$, () => exports.GetAutomatedReasoningPolicyTestCaseResponse$
];
exports.GetAutomatedReasoningPolicyTestResult$ = [9, n0, _GARPTR,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}/test-cases/{testCaseId}/test-results", 200] }, () => exports.GetAutomatedReasoningPolicyTestResultRequest$, () => exports.GetAutomatedReasoningPolicyTestResultResponse$
];
exports.GetCustomModel$ = [9, n0, _GCM,
    { [_ht]: ["GET", "/custom-models/{modelIdentifier}", 200] }, () => exports.GetCustomModelRequest$, () => exports.GetCustomModelResponse$
];
exports.GetCustomModelDeployment$ = [9, n0, _GCMD,
    { [_ht]: ["GET", "/model-customization/custom-model-deployments/{customModelDeploymentIdentifier}", 200] }, () => exports.GetCustomModelDeploymentRequest$, () => exports.GetCustomModelDeploymentResponse$
];
exports.GetEvaluationJob$ = [9, n0, _GEJ,
    { [_ht]: ["GET", "/evaluation-jobs/{jobIdentifier}", 200] }, () => exports.GetEvaluationJobRequest$, () => exports.GetEvaluationJobResponse$
];
exports.GetFoundationModel$ = [9, n0, _GFM,
    { [_ht]: ["GET", "/foundation-models/{modelIdentifier}", 200] }, () => exports.GetFoundationModelRequest$, () => exports.GetFoundationModelResponse$
];
exports.GetFoundationModelAvailability$ = [9, n0, _GFMA,
    { [_ht]: ["GET", "/foundation-model-availability/{modelId}", 200] }, () => exports.GetFoundationModelAvailabilityRequest$, () => exports.GetFoundationModelAvailabilityResponse$
];
exports.GetGuardrail$ = [9, n0, _GG,
    { [_ht]: ["GET", "/guardrails/{guardrailIdentifier}", 200] }, () => exports.GetGuardrailRequest$, () => exports.GetGuardrailResponse$
];
exports.GetImportedModel$ = [9, n0, _GIM,
    { [_ht]: ["GET", "/imported-models/{modelIdentifier}", 200] }, () => exports.GetImportedModelRequest$, () => exports.GetImportedModelResponse$
];
exports.GetInferenceProfile$ = [9, n0, _GIP,
    { [_ht]: ["GET", "/inference-profiles/{inferenceProfileIdentifier}", 200] }, () => exports.GetInferenceProfileRequest$, () => exports.GetInferenceProfileResponse$
];
exports.GetMarketplaceModelEndpoint$ = [9, n0, _GMME,
    { [_ht]: ["GET", "/marketplace-model/endpoints/{endpointArn}", 200] }, () => exports.GetMarketplaceModelEndpointRequest$, () => exports.GetMarketplaceModelEndpointResponse$
];
exports.GetModelCopyJob$ = [9, n0, _GMCJ,
    { [_ht]: ["GET", "/model-copy-jobs/{jobArn}", 200] }, () => exports.GetModelCopyJobRequest$, () => exports.GetModelCopyJobResponse$
];
exports.GetModelCustomizationJob$ = [9, n0, _GMCJe,
    { [_ht]: ["GET", "/model-customization-jobs/{jobIdentifier}", 200] }, () => exports.GetModelCustomizationJobRequest$, () => exports.GetModelCustomizationJobResponse$
];
exports.GetModelImportJob$ = [9, n0, _GMIJ,
    { [_ht]: ["GET", "/model-import-jobs/{jobIdentifier}", 200] }, () => exports.GetModelImportJobRequest$, () => exports.GetModelImportJobResponse$
];
exports.GetModelInvocationJob$ = [9, n0, _GMIJe,
    { [_ht]: ["GET", "/model-invocation-job/{jobIdentifier}", 200] }, () => exports.GetModelInvocationJobRequest$, () => exports.GetModelInvocationJobResponse$
];
exports.GetModelInvocationLoggingConfiguration$ = [9, n0, _GMILC,
    { [_ht]: ["GET", "/logging/modelinvocations", 200] }, () => exports.GetModelInvocationLoggingConfigurationRequest$, () => exports.GetModelInvocationLoggingConfigurationResponse$
];
exports.GetPromptRouter$ = [9, n0, _GPR,
    { [_ht]: ["GET", "/prompt-routers/{promptRouterArn}", 200] }, () => exports.GetPromptRouterRequest$, () => exports.GetPromptRouterResponse$
];
exports.GetProvisionedModelThroughput$ = [9, n0, _GPMT,
    { [_ht]: ["GET", "/provisioned-model-throughput/{provisionedModelId}", 200] }, () => exports.GetProvisionedModelThroughputRequest$, () => exports.GetProvisionedModelThroughputResponse$
];
exports.GetResourcePolicy$ = [9, n0, _GRP,
    { [_ht]: ["GET", "/resource-policy/{resourceArn}", 200] }, () => exports.GetResourcePolicyRequest$, () => exports.GetResourcePolicyResponse$
];
exports.GetUseCaseForModelAccess$ = [9, n0, _GUCFMA,
    { [_ht]: ["GET", "/use-case-for-model-access", 200] }, () => exports.GetUseCaseForModelAccessRequest$, () => exports.GetUseCaseForModelAccessResponse$
];
exports.ListAutomatedReasoningPolicies$ = [9, n0, _LARP,
    { [_ht]: ["GET", "/automated-reasoning-policies", 200] }, () => exports.ListAutomatedReasoningPoliciesRequest$, () => exports.ListAutomatedReasoningPoliciesResponse$
];
exports.ListAutomatedReasoningPolicyBuildWorkflows$ = [9, n0, _LARPBW,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/build-workflows", 200] }, () => exports.ListAutomatedReasoningPolicyBuildWorkflowsRequest$, () => exports.ListAutomatedReasoningPolicyBuildWorkflowsResponse$
];
exports.ListAutomatedReasoningPolicyTestCases$ = [9, n0, _LARPTC,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/test-cases", 200] }, () => exports.ListAutomatedReasoningPolicyTestCasesRequest$, () => exports.ListAutomatedReasoningPolicyTestCasesResponse$
];
exports.ListAutomatedReasoningPolicyTestResults$ = [9, n0, _LARPTR,
    { [_ht]: ["GET", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}/test-results", 200] }, () => exports.ListAutomatedReasoningPolicyTestResultsRequest$, () => exports.ListAutomatedReasoningPolicyTestResultsResponse$
];
exports.ListCustomModelDeployments$ = [9, n0, _LCMD,
    { [_ht]: ["GET", "/model-customization/custom-model-deployments", 200] }, () => exports.ListCustomModelDeploymentsRequest$, () => exports.ListCustomModelDeploymentsResponse$
];
exports.ListCustomModels$ = [9, n0, _LCM,
    { [_ht]: ["GET", "/custom-models", 200] }, () => exports.ListCustomModelsRequest$, () => exports.ListCustomModelsResponse$
];
exports.ListEnforcedGuardrailsConfiguration$ = [9, n0, _LEGC,
    { [_ht]: ["GET", "/enforcedGuardrailsConfiguration", 200] }, () => exports.ListEnforcedGuardrailsConfigurationRequest$, () => exports.ListEnforcedGuardrailsConfigurationResponse$
];
exports.ListEvaluationJobs$ = [9, n0, _LEJ,
    { [_ht]: ["GET", "/evaluation-jobs", 200] }, () => exports.ListEvaluationJobsRequest$, () => exports.ListEvaluationJobsResponse$
];
exports.ListFoundationModelAgreementOffers$ = [9, n0, _LFMAO,
    { [_ht]: ["GET", "/list-foundation-model-agreement-offers/{modelId}", 200] }, () => exports.ListFoundationModelAgreementOffersRequest$, () => exports.ListFoundationModelAgreementOffersResponse$
];
exports.ListFoundationModels$ = [9, n0, _LFM,
    { [_ht]: ["GET", "/foundation-models", 200] }, () => exports.ListFoundationModelsRequest$, () => exports.ListFoundationModelsResponse$
];
exports.ListGuardrails$ = [9, n0, _LG,
    { [_ht]: ["GET", "/guardrails", 200] }, () => exports.ListGuardrailsRequest$, () => exports.ListGuardrailsResponse$
];
exports.ListImportedModels$ = [9, n0, _LIM,
    { [_ht]: ["GET", "/imported-models", 200] }, () => exports.ListImportedModelsRequest$, () => exports.ListImportedModelsResponse$
];
exports.ListInferenceProfiles$ = [9, n0, _LIP,
    { [_ht]: ["GET", "/inference-profiles", 200] }, () => exports.ListInferenceProfilesRequest$, () => exports.ListInferenceProfilesResponse$
];
exports.ListMarketplaceModelEndpoints$ = [9, n0, _LMME,
    { [_ht]: ["GET", "/marketplace-model/endpoints", 200] }, () => exports.ListMarketplaceModelEndpointsRequest$, () => exports.ListMarketplaceModelEndpointsResponse$
];
exports.ListModelCopyJobs$ = [9, n0, _LMCJ,
    { [_ht]: ["GET", "/model-copy-jobs", 200] }, () => exports.ListModelCopyJobsRequest$, () => exports.ListModelCopyJobsResponse$
];
exports.ListModelCustomizationJobs$ = [9, n0, _LMCJi,
    { [_ht]: ["GET", "/model-customization-jobs", 200] }, () => exports.ListModelCustomizationJobsRequest$, () => exports.ListModelCustomizationJobsResponse$
];
exports.ListModelImportJobs$ = [9, n0, _LMIJ,
    { [_ht]: ["GET", "/model-import-jobs", 200] }, () => exports.ListModelImportJobsRequest$, () => exports.ListModelImportJobsResponse$
];
exports.ListModelInvocationJobs$ = [9, n0, _LMIJi,
    { [_ht]: ["GET", "/model-invocation-jobs", 200] }, () => exports.ListModelInvocationJobsRequest$, () => exports.ListModelInvocationJobsResponse$
];
exports.ListPromptRouters$ = [9, n0, _LPR,
    { [_ht]: ["GET", "/prompt-routers", 200] }, () => exports.ListPromptRoutersRequest$, () => exports.ListPromptRoutersResponse$
];
exports.ListProvisionedModelThroughputs$ = [9, n0, _LPMT,
    { [_ht]: ["GET", "/provisioned-model-throughputs", 200] }, () => exports.ListProvisionedModelThroughputsRequest$, () => exports.ListProvisionedModelThroughputsResponse$
];
exports.ListTagsForResource$ = [9, n0, _LTFR,
    { [_ht]: ["POST", "/listTagsForResource", 200] }, () => exports.ListTagsForResourceRequest$, () => exports.ListTagsForResourceResponse$
];
exports.PutEnforcedGuardrailConfiguration$ = [9, n0, _PEGC,
    { [_ht]: ["PUT", "/enforcedGuardrailsConfiguration", 200] }, () => exports.PutEnforcedGuardrailConfigurationRequest$, () => exports.PutEnforcedGuardrailConfigurationResponse$
];
exports.PutModelInvocationLoggingConfiguration$ = [9, n0, _PMILC,
    { [_ht]: ["PUT", "/logging/modelinvocations", 200] }, () => exports.PutModelInvocationLoggingConfigurationRequest$, () => exports.PutModelInvocationLoggingConfigurationResponse$
];
exports.PutResourcePolicy$ = [9, n0, _PRP,
    { [_ht]: ["POST", "/resource-policy", 201] }, () => exports.PutResourcePolicyRequest$, () => exports.PutResourcePolicyResponse$
];
exports.PutUseCaseForModelAccess$ = [9, n0, _PUCFMA,
    { [_ht]: ["POST", "/use-case-for-model-access", 201] }, () => exports.PutUseCaseForModelAccessRequest$, () => exports.PutUseCaseForModelAccessResponse$
];
exports.RegisterMarketplaceModelEndpoint$ = [9, n0, _RMME,
    { [_ht]: ["POST", "/marketplace-model/endpoints/{endpointIdentifier}/registration", 200] }, () => exports.RegisterMarketplaceModelEndpointRequest$, () => exports.RegisterMarketplaceModelEndpointResponse$
];
exports.StartAutomatedReasoningPolicyBuildWorkflow$ = [9, n0, _SARPBW,
    { [_ht]: ["POST", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowType}/start", 200] }, () => exports.StartAutomatedReasoningPolicyBuildWorkflowRequest$, () => exports.StartAutomatedReasoningPolicyBuildWorkflowResponse$
];
exports.StartAutomatedReasoningPolicyTestWorkflow$ = [9, n0, _SARPTW,
    { [_ht]: ["POST", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}/test-workflows", 200] }, () => exports.StartAutomatedReasoningPolicyTestWorkflowRequest$, () => exports.StartAutomatedReasoningPolicyTestWorkflowResponse$
];
exports.StopEvaluationJob$ = [9, n0, _SEJ,
    { [_ht]: ["POST", "/evaluation-job/{jobIdentifier}/stop", 200] }, () => exports.StopEvaluationJobRequest$, () => exports.StopEvaluationJobResponse$
];
exports.StopModelCustomizationJob$ = [9, n0, _SMCJ,
    { [_ht]: ["POST", "/model-customization-jobs/{jobIdentifier}/stop", 200] }, () => exports.StopModelCustomizationJobRequest$, () => exports.StopModelCustomizationJobResponse$
];
exports.StopModelInvocationJob$ = [9, n0, _SMIJ,
    { [_ht]: ["POST", "/model-invocation-job/{jobIdentifier}/stop", 200] }, () => exports.StopModelInvocationJobRequest$, () => exports.StopModelInvocationJobResponse$
];
exports.TagResource$ = [9, n0, _TR,
    { [_ht]: ["POST", "/tagResource", 200] }, () => exports.TagResourceRequest$, () => exports.TagResourceResponse$
];
exports.UntagResource$ = [9, n0, _UR,
    { [_ht]: ["POST", "/untagResource", 200] }, () => exports.UntagResourceRequest$, () => exports.UntagResourceResponse$
];
exports.UpdateAutomatedReasoningPolicy$ = [9, n0, _UARP,
    { [_ht]: ["PATCH", "/automated-reasoning-policies/{policyArn}", 200] }, () => exports.UpdateAutomatedReasoningPolicyRequest$, () => exports.UpdateAutomatedReasoningPolicyResponse$
];
exports.UpdateAutomatedReasoningPolicyAnnotations$ = [9, n0, _UARPA,
    { [_ht]: ["PATCH", "/automated-reasoning-policies/{policyArn}/build-workflows/{buildWorkflowId}/annotations", 200] }, () => exports.UpdateAutomatedReasoningPolicyAnnotationsRequest$, () => exports.UpdateAutomatedReasoningPolicyAnnotationsResponse$
];
exports.UpdateAutomatedReasoningPolicyTestCase$ = [9, n0, _UARPTC,
    { [_ht]: ["PATCH", "/automated-reasoning-policies/{policyArn}/test-cases/{testCaseId}", 200] }, () => exports.UpdateAutomatedReasoningPolicyTestCaseRequest$, () => exports.UpdateAutomatedReasoningPolicyTestCaseResponse$
];
exports.UpdateCustomModelDeployment$ = [9, n0, _UCMD,
    { [_ht]: ["PATCH", "/model-customization/custom-model-deployments/{customModelDeploymentIdentifier}", 202] }, () => exports.UpdateCustomModelDeploymentRequest$, () => exports.UpdateCustomModelDeploymentResponse$
];
exports.UpdateGuardrail$ = [9, n0, _UG,
    { [_ht]: ["PUT", "/guardrails/{guardrailIdentifier}", 202] }, () => exports.UpdateGuardrailRequest$, () => exports.UpdateGuardrailResponse$
];
exports.UpdateMarketplaceModelEndpoint$ = [9, n0, _UMME,
    { [_ht]: ["PATCH", "/marketplace-model/endpoints/{endpointArn}", 200] }, () => exports.UpdateMarketplaceModelEndpointRequest$, () => exports.UpdateMarketplaceModelEndpointResponse$
];
exports.UpdateProvisionedModelThroughput$ = [9, n0, _UPMT,
    { [_ht]: ["PATCH", "/provisioned-model-throughput/{provisionedModelId}", 200] }, () => exports.UpdateProvisionedModelThroughputRequest$, () => exports.UpdateProvisionedModelThroughputResponse$
];
