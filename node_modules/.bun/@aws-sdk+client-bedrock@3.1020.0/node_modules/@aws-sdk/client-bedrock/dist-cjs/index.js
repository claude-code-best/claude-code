'use strict';

var middlewareHostHeader = require('@aws-sdk/middleware-host-header');
var middlewareLogger = require('@aws-sdk/middleware-logger');
var middlewareRecursionDetection = require('@aws-sdk/middleware-recursion-detection');
var middlewareUserAgent = require('@aws-sdk/middleware-user-agent');
var configResolver = require('@smithy/config-resolver');
var core = require('@smithy/core');
var schema = require('@smithy/core/schema');
var middlewareContentLength = require('@smithy/middleware-content-length');
var middlewareEndpoint = require('@smithy/middleware-endpoint');
var middlewareRetry = require('@smithy/middleware-retry');
var smithyClient = require('@smithy/smithy-client');
var httpAuthSchemeProvider = require('./auth/httpAuthSchemeProvider');
var runtimeConfig = require('./runtimeConfig');
var regionConfigResolver = require('@aws-sdk/region-config-resolver');
var protocolHttp = require('@smithy/protocol-http');
var schemas_0 = require('./schemas/schemas_0');
var errors = require('./models/errors');
var BedrockServiceException = require('./models/BedrockServiceException');

const resolveClientEndpointParameters = (options) => {
    return Object.assign(options, {
        useDualstackEndpoint: options.useDualstackEndpoint ?? false,
        useFipsEndpoint: options.useFipsEndpoint ?? false,
        defaultSigningName: "bedrock",
    });
};
const commonParams = {
    UseFIPS: { type: "builtInParams", name: "useFipsEndpoint" },
    Endpoint: { type: "builtInParams", name: "endpoint" },
    Region: { type: "builtInParams", name: "region" },
    UseDualStack: { type: "builtInParams", name: "useDualstackEndpoint" },
};

const getHttpAuthExtensionConfiguration = (runtimeConfig) => {
    const _httpAuthSchemes = runtimeConfig.httpAuthSchemes;
    let _httpAuthSchemeProvider = runtimeConfig.httpAuthSchemeProvider;
    let _credentials = runtimeConfig.credentials;
    let _token = runtimeConfig.token;
    return {
        setHttpAuthScheme(httpAuthScheme) {
            const index = _httpAuthSchemes.findIndex((scheme) => scheme.schemeId === httpAuthScheme.schemeId);
            if (index === -1) {
                _httpAuthSchemes.push(httpAuthScheme);
            }
            else {
                _httpAuthSchemes.splice(index, 1, httpAuthScheme);
            }
        },
        httpAuthSchemes() {
            return _httpAuthSchemes;
        },
        setHttpAuthSchemeProvider(httpAuthSchemeProvider) {
            _httpAuthSchemeProvider = httpAuthSchemeProvider;
        },
        httpAuthSchemeProvider() {
            return _httpAuthSchemeProvider;
        },
        setCredentials(credentials) {
            _credentials = credentials;
        },
        credentials() {
            return _credentials;
        },
        setToken(token) {
            _token = token;
        },
        token() {
            return _token;
        },
    };
};
const resolveHttpAuthRuntimeConfig = (config) => {
    return {
        httpAuthSchemes: config.httpAuthSchemes(),
        httpAuthSchemeProvider: config.httpAuthSchemeProvider(),
        credentials: config.credentials(),
        token: config.token(),
    };
};

const resolveRuntimeExtensions = (runtimeConfig, extensions) => {
    const extensionConfiguration = Object.assign(regionConfigResolver.getAwsRegionExtensionConfiguration(runtimeConfig), smithyClient.getDefaultExtensionConfiguration(runtimeConfig), protocolHttp.getHttpHandlerExtensionConfiguration(runtimeConfig), getHttpAuthExtensionConfiguration(runtimeConfig));
    extensions.forEach((extension) => extension.configure(extensionConfiguration));
    return Object.assign(runtimeConfig, regionConfigResolver.resolveAwsRegionExtensionConfiguration(extensionConfiguration), smithyClient.resolveDefaultRuntimeConfig(extensionConfiguration), protocolHttp.resolveHttpHandlerRuntimeConfig(extensionConfiguration), resolveHttpAuthRuntimeConfig(extensionConfiguration));
};

class BedrockClient extends smithyClient.Client {
    config;
    constructor(...[configuration]) {
        const _config_0 = runtimeConfig.getRuntimeConfig(configuration || {});
        super(_config_0);
        this.initConfig = _config_0;
        const _config_1 = resolveClientEndpointParameters(_config_0);
        const _config_2 = middlewareUserAgent.resolveUserAgentConfig(_config_1);
        const _config_3 = middlewareRetry.resolveRetryConfig(_config_2);
        const _config_4 = configResolver.resolveRegionConfig(_config_3);
        const _config_5 = middlewareHostHeader.resolveHostHeaderConfig(_config_4);
        const _config_6 = middlewareEndpoint.resolveEndpointConfig(_config_5);
        const _config_7 = httpAuthSchemeProvider.resolveHttpAuthSchemeConfig(_config_6);
        const _config_8 = resolveRuntimeExtensions(_config_7, configuration?.extensions || []);
        this.config = _config_8;
        this.middlewareStack.use(schema.getSchemaSerdePlugin(this.config));
        this.middlewareStack.use(middlewareUserAgent.getUserAgentPlugin(this.config));
        this.middlewareStack.use(middlewareRetry.getRetryPlugin(this.config));
        this.middlewareStack.use(middlewareContentLength.getContentLengthPlugin(this.config));
        this.middlewareStack.use(middlewareHostHeader.getHostHeaderPlugin(this.config));
        this.middlewareStack.use(middlewareLogger.getLoggerPlugin(this.config));
        this.middlewareStack.use(middlewareRecursionDetection.getRecursionDetectionPlugin(this.config));
        this.middlewareStack.use(core.getHttpAuthSchemeEndpointRuleSetPlugin(this.config, {
            httpAuthSchemeParametersProvider: httpAuthSchemeProvider.defaultBedrockHttpAuthSchemeParametersProvider,
            identityProviderConfigProvider: async (config) => new core.DefaultIdentityProviderConfig({
                "aws.auth#sigv4": config.credentials,
                "smithy.api#httpBearerAuth": config.token,
            }),
        }));
        this.middlewareStack.use(core.getHttpSigningPlugin(this.config));
    }
    destroy() {
        super.destroy();
    }
}

class BatchDeleteEvaluationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "BatchDeleteEvaluationJob", {})
    .n("BedrockClient", "BatchDeleteEvaluationJobCommand")
    .sc(schemas_0.BatchDeleteEvaluationJob$)
    .build() {
}

class CancelAutomatedReasoningPolicyBuildWorkflowCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CancelAutomatedReasoningPolicyBuildWorkflow", {})
    .n("BedrockClient", "CancelAutomatedReasoningPolicyBuildWorkflowCommand")
    .sc(schemas_0.CancelAutomatedReasoningPolicyBuildWorkflow$)
    .build() {
}

class CreateAutomatedReasoningPolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateAutomatedReasoningPolicy", {})
    .n("BedrockClient", "CreateAutomatedReasoningPolicyCommand")
    .sc(schemas_0.CreateAutomatedReasoningPolicy$)
    .build() {
}

class CreateAutomatedReasoningPolicyTestCaseCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateAutomatedReasoningPolicyTestCase", {})
    .n("BedrockClient", "CreateAutomatedReasoningPolicyTestCaseCommand")
    .sc(schemas_0.CreateAutomatedReasoningPolicyTestCase$)
    .build() {
}

class CreateAutomatedReasoningPolicyVersionCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateAutomatedReasoningPolicyVersion", {})
    .n("BedrockClient", "CreateAutomatedReasoningPolicyVersionCommand")
    .sc(schemas_0.CreateAutomatedReasoningPolicyVersion$)
    .build() {
}

class CreateCustomModelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateCustomModel", {})
    .n("BedrockClient", "CreateCustomModelCommand")
    .sc(schemas_0.CreateCustomModel$)
    .build() {
}

class CreateCustomModelDeploymentCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateCustomModelDeployment", {})
    .n("BedrockClient", "CreateCustomModelDeploymentCommand")
    .sc(schemas_0.CreateCustomModelDeployment$)
    .build() {
}

class CreateEvaluationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateEvaluationJob", {})
    .n("BedrockClient", "CreateEvaluationJobCommand")
    .sc(schemas_0.CreateEvaluationJob$)
    .build() {
}

class CreateFoundationModelAgreementCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateFoundationModelAgreement", {})
    .n("BedrockClient", "CreateFoundationModelAgreementCommand")
    .sc(schemas_0.CreateFoundationModelAgreement$)
    .build() {
}

class CreateGuardrailCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateGuardrail", {})
    .n("BedrockClient", "CreateGuardrailCommand")
    .sc(schemas_0.CreateGuardrail$)
    .build() {
}

class CreateGuardrailVersionCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateGuardrailVersion", {})
    .n("BedrockClient", "CreateGuardrailVersionCommand")
    .sc(schemas_0.CreateGuardrailVersion$)
    .build() {
}

class CreateInferenceProfileCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateInferenceProfile", {})
    .n("BedrockClient", "CreateInferenceProfileCommand")
    .sc(schemas_0.CreateInferenceProfile$)
    .build() {
}

class CreateMarketplaceModelEndpointCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateMarketplaceModelEndpoint", {})
    .n("BedrockClient", "CreateMarketplaceModelEndpointCommand")
    .sc(schemas_0.CreateMarketplaceModelEndpoint$)
    .build() {
}

class CreateModelCopyJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateModelCopyJob", {})
    .n("BedrockClient", "CreateModelCopyJobCommand")
    .sc(schemas_0.CreateModelCopyJob$)
    .build() {
}

class CreateModelCustomizationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateModelCustomizationJob", {})
    .n("BedrockClient", "CreateModelCustomizationJobCommand")
    .sc(schemas_0.CreateModelCustomizationJob$)
    .build() {
}

class CreateModelImportJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateModelImportJob", {})
    .n("BedrockClient", "CreateModelImportJobCommand")
    .sc(schemas_0.CreateModelImportJob$)
    .build() {
}

class CreateModelInvocationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateModelInvocationJob", {})
    .n("BedrockClient", "CreateModelInvocationJobCommand")
    .sc(schemas_0.CreateModelInvocationJob$)
    .build() {
}

class CreatePromptRouterCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreatePromptRouter", {})
    .n("BedrockClient", "CreatePromptRouterCommand")
    .sc(schemas_0.CreatePromptRouter$)
    .build() {
}

class CreateProvisionedModelThroughputCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateProvisionedModelThroughput", {})
    .n("BedrockClient", "CreateProvisionedModelThroughputCommand")
    .sc(schemas_0.CreateProvisionedModelThroughput$)
    .build() {
}

class DeleteAutomatedReasoningPolicyBuildWorkflowCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteAutomatedReasoningPolicyBuildWorkflow", {})
    .n("BedrockClient", "DeleteAutomatedReasoningPolicyBuildWorkflowCommand")
    .sc(schemas_0.DeleteAutomatedReasoningPolicyBuildWorkflow$)
    .build() {
}

class DeleteAutomatedReasoningPolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteAutomatedReasoningPolicy", {})
    .n("BedrockClient", "DeleteAutomatedReasoningPolicyCommand")
    .sc(schemas_0.DeleteAutomatedReasoningPolicy$)
    .build() {
}

class DeleteAutomatedReasoningPolicyTestCaseCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteAutomatedReasoningPolicyTestCase", {})
    .n("BedrockClient", "DeleteAutomatedReasoningPolicyTestCaseCommand")
    .sc(schemas_0.DeleteAutomatedReasoningPolicyTestCase$)
    .build() {
}

class DeleteCustomModelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteCustomModel", {})
    .n("BedrockClient", "DeleteCustomModelCommand")
    .sc(schemas_0.DeleteCustomModel$)
    .build() {
}

class DeleteCustomModelDeploymentCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteCustomModelDeployment", {})
    .n("BedrockClient", "DeleteCustomModelDeploymentCommand")
    .sc(schemas_0.DeleteCustomModelDeployment$)
    .build() {
}

class DeleteEnforcedGuardrailConfigurationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteEnforcedGuardrailConfiguration", {})
    .n("BedrockClient", "DeleteEnforcedGuardrailConfigurationCommand")
    .sc(schemas_0.DeleteEnforcedGuardrailConfiguration$)
    .build() {
}

class DeleteFoundationModelAgreementCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteFoundationModelAgreement", {})
    .n("BedrockClient", "DeleteFoundationModelAgreementCommand")
    .sc(schemas_0.DeleteFoundationModelAgreement$)
    .build() {
}

class DeleteGuardrailCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteGuardrail", {})
    .n("BedrockClient", "DeleteGuardrailCommand")
    .sc(schemas_0.DeleteGuardrail$)
    .build() {
}

class DeleteImportedModelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteImportedModel", {})
    .n("BedrockClient", "DeleteImportedModelCommand")
    .sc(schemas_0.DeleteImportedModel$)
    .build() {
}

class DeleteInferenceProfileCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteInferenceProfile", {})
    .n("BedrockClient", "DeleteInferenceProfileCommand")
    .sc(schemas_0.DeleteInferenceProfile$)
    .build() {
}

class DeleteMarketplaceModelEndpointCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteMarketplaceModelEndpoint", {})
    .n("BedrockClient", "DeleteMarketplaceModelEndpointCommand")
    .sc(schemas_0.DeleteMarketplaceModelEndpoint$)
    .build() {
}

class DeleteModelInvocationLoggingConfigurationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteModelInvocationLoggingConfiguration", {})
    .n("BedrockClient", "DeleteModelInvocationLoggingConfigurationCommand")
    .sc(schemas_0.DeleteModelInvocationLoggingConfiguration$)
    .build() {
}

class DeletePromptRouterCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeletePromptRouter", {})
    .n("BedrockClient", "DeletePromptRouterCommand")
    .sc(schemas_0.DeletePromptRouter$)
    .build() {
}

class DeleteProvisionedModelThroughputCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteProvisionedModelThroughput", {})
    .n("BedrockClient", "DeleteProvisionedModelThroughputCommand")
    .sc(schemas_0.DeleteProvisionedModelThroughput$)
    .build() {
}

class DeregisterMarketplaceModelEndpointCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeregisterMarketplaceModelEndpoint", {})
    .n("BedrockClient", "DeregisterMarketplaceModelEndpointCommand")
    .sc(schemas_0.DeregisterMarketplaceModelEndpoint$)
    .build() {
}

class ExportAutomatedReasoningPolicyVersionCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ExportAutomatedReasoningPolicyVersion", {})
    .n("BedrockClient", "ExportAutomatedReasoningPolicyVersionCommand")
    .sc(schemas_0.ExportAutomatedReasoningPolicyVersion$)
    .build() {
}

class GetAutomatedReasoningPolicyAnnotationsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyAnnotations", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyAnnotationsCommand")
    .sc(schemas_0.GetAutomatedReasoningPolicyAnnotations$)
    .build() {
}

class GetAutomatedReasoningPolicyBuildWorkflowCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyBuildWorkflow", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyBuildWorkflowCommand")
    .sc(schemas_0.GetAutomatedReasoningPolicyBuildWorkflow$)
    .build() {
}

class GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyBuildWorkflowResultAssets", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand")
    .sc(schemas_0.GetAutomatedReasoningPolicyBuildWorkflowResultAssets$)
    .build() {
}

class GetAutomatedReasoningPolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicy", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyCommand")
    .sc(schemas_0.GetAutomatedReasoningPolicy$)
    .build() {
}

class GetAutomatedReasoningPolicyNextScenarioCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyNextScenario", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyNextScenarioCommand")
    .sc(schemas_0.GetAutomatedReasoningPolicyNextScenario$)
    .build() {
}

class GetAutomatedReasoningPolicyTestCaseCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyTestCase", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyTestCaseCommand")
    .sc(schemas_0.GetAutomatedReasoningPolicyTestCase$)
    .build() {
}

class GetAutomatedReasoningPolicyTestResultCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyTestResult", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyTestResultCommand")
    .sc(schemas_0.GetAutomatedReasoningPolicyTestResult$)
    .build() {
}

class GetCustomModelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetCustomModel", {})
    .n("BedrockClient", "GetCustomModelCommand")
    .sc(schemas_0.GetCustomModel$)
    .build() {
}

class GetCustomModelDeploymentCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetCustomModelDeployment", {})
    .n("BedrockClient", "GetCustomModelDeploymentCommand")
    .sc(schemas_0.GetCustomModelDeployment$)
    .build() {
}

class GetEvaluationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetEvaluationJob", {})
    .n("BedrockClient", "GetEvaluationJobCommand")
    .sc(schemas_0.GetEvaluationJob$)
    .build() {
}

class GetFoundationModelAvailabilityCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetFoundationModelAvailability", {})
    .n("BedrockClient", "GetFoundationModelAvailabilityCommand")
    .sc(schemas_0.GetFoundationModelAvailability$)
    .build() {
}

class GetFoundationModelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetFoundationModel", {})
    .n("BedrockClient", "GetFoundationModelCommand")
    .sc(schemas_0.GetFoundationModel$)
    .build() {
}

class GetGuardrailCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetGuardrail", {})
    .n("BedrockClient", "GetGuardrailCommand")
    .sc(schemas_0.GetGuardrail$)
    .build() {
}

class GetImportedModelCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetImportedModel", {})
    .n("BedrockClient", "GetImportedModelCommand")
    .sc(schemas_0.GetImportedModel$)
    .build() {
}

class GetInferenceProfileCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetInferenceProfile", {})
    .n("BedrockClient", "GetInferenceProfileCommand")
    .sc(schemas_0.GetInferenceProfile$)
    .build() {
}

class GetMarketplaceModelEndpointCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetMarketplaceModelEndpoint", {})
    .n("BedrockClient", "GetMarketplaceModelEndpointCommand")
    .sc(schemas_0.GetMarketplaceModelEndpoint$)
    .build() {
}

class GetModelCopyJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetModelCopyJob", {})
    .n("BedrockClient", "GetModelCopyJobCommand")
    .sc(schemas_0.GetModelCopyJob$)
    .build() {
}

class GetModelCustomizationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetModelCustomizationJob", {})
    .n("BedrockClient", "GetModelCustomizationJobCommand")
    .sc(schemas_0.GetModelCustomizationJob$)
    .build() {
}

class GetModelImportJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetModelImportJob", {})
    .n("BedrockClient", "GetModelImportJobCommand")
    .sc(schemas_0.GetModelImportJob$)
    .build() {
}

class GetModelInvocationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetModelInvocationJob", {})
    .n("BedrockClient", "GetModelInvocationJobCommand")
    .sc(schemas_0.GetModelInvocationJob$)
    .build() {
}

class GetModelInvocationLoggingConfigurationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetModelInvocationLoggingConfiguration", {})
    .n("BedrockClient", "GetModelInvocationLoggingConfigurationCommand")
    .sc(schemas_0.GetModelInvocationLoggingConfiguration$)
    .build() {
}

class GetPromptRouterCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetPromptRouter", {})
    .n("BedrockClient", "GetPromptRouterCommand")
    .sc(schemas_0.GetPromptRouter$)
    .build() {
}

class GetProvisionedModelThroughputCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetProvisionedModelThroughput", {})
    .n("BedrockClient", "GetProvisionedModelThroughputCommand")
    .sc(schemas_0.GetProvisionedModelThroughput$)
    .build() {
}

class GetUseCaseForModelAccessCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetUseCaseForModelAccess", {})
    .n("BedrockClient", "GetUseCaseForModelAccessCommand")
    .sc(schemas_0.GetUseCaseForModelAccess$)
    .build() {
}

class ListAutomatedReasoningPoliciesCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListAutomatedReasoningPolicies", {})
    .n("BedrockClient", "ListAutomatedReasoningPoliciesCommand")
    .sc(schemas_0.ListAutomatedReasoningPolicies$)
    .build() {
}

class ListAutomatedReasoningPolicyBuildWorkflowsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListAutomatedReasoningPolicyBuildWorkflows", {})
    .n("BedrockClient", "ListAutomatedReasoningPolicyBuildWorkflowsCommand")
    .sc(schemas_0.ListAutomatedReasoningPolicyBuildWorkflows$)
    .build() {
}

class ListAutomatedReasoningPolicyTestCasesCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListAutomatedReasoningPolicyTestCases", {})
    .n("BedrockClient", "ListAutomatedReasoningPolicyTestCasesCommand")
    .sc(schemas_0.ListAutomatedReasoningPolicyTestCases$)
    .build() {
}

class ListAutomatedReasoningPolicyTestResultsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListAutomatedReasoningPolicyTestResults", {})
    .n("BedrockClient", "ListAutomatedReasoningPolicyTestResultsCommand")
    .sc(schemas_0.ListAutomatedReasoningPolicyTestResults$)
    .build() {
}

class ListCustomModelDeploymentsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListCustomModelDeployments", {})
    .n("BedrockClient", "ListCustomModelDeploymentsCommand")
    .sc(schemas_0.ListCustomModelDeployments$)
    .build() {
}

class ListCustomModelsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListCustomModels", {})
    .n("BedrockClient", "ListCustomModelsCommand")
    .sc(schemas_0.ListCustomModels$)
    .build() {
}

class ListEnforcedGuardrailsConfigurationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListEnforcedGuardrailsConfiguration", {})
    .n("BedrockClient", "ListEnforcedGuardrailsConfigurationCommand")
    .sc(schemas_0.ListEnforcedGuardrailsConfiguration$)
    .build() {
}

class ListEvaluationJobsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListEvaluationJobs", {})
    .n("BedrockClient", "ListEvaluationJobsCommand")
    .sc(schemas_0.ListEvaluationJobs$)
    .build() {
}

class ListFoundationModelAgreementOffersCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListFoundationModelAgreementOffers", {})
    .n("BedrockClient", "ListFoundationModelAgreementOffersCommand")
    .sc(schemas_0.ListFoundationModelAgreementOffers$)
    .build() {
}

class ListFoundationModelsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListFoundationModels", {})
    .n("BedrockClient", "ListFoundationModelsCommand")
    .sc(schemas_0.ListFoundationModels$)
    .build() {
}

class ListGuardrailsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListGuardrails", {})
    .n("BedrockClient", "ListGuardrailsCommand")
    .sc(schemas_0.ListGuardrails$)
    .build() {
}

class ListImportedModelsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListImportedModels", {})
    .n("BedrockClient", "ListImportedModelsCommand")
    .sc(schemas_0.ListImportedModels$)
    .build() {
}

class ListInferenceProfilesCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListInferenceProfiles", {})
    .n("BedrockClient", "ListInferenceProfilesCommand")
    .sc(schemas_0.ListInferenceProfiles$)
    .build() {
}

class ListMarketplaceModelEndpointsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListMarketplaceModelEndpoints", {})
    .n("BedrockClient", "ListMarketplaceModelEndpointsCommand")
    .sc(schemas_0.ListMarketplaceModelEndpoints$)
    .build() {
}

class ListModelCopyJobsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListModelCopyJobs", {})
    .n("BedrockClient", "ListModelCopyJobsCommand")
    .sc(schemas_0.ListModelCopyJobs$)
    .build() {
}

class ListModelCustomizationJobsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListModelCustomizationJobs", {})
    .n("BedrockClient", "ListModelCustomizationJobsCommand")
    .sc(schemas_0.ListModelCustomizationJobs$)
    .build() {
}

class ListModelImportJobsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListModelImportJobs", {})
    .n("BedrockClient", "ListModelImportJobsCommand")
    .sc(schemas_0.ListModelImportJobs$)
    .build() {
}

class ListModelInvocationJobsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListModelInvocationJobs", {})
    .n("BedrockClient", "ListModelInvocationJobsCommand")
    .sc(schemas_0.ListModelInvocationJobs$)
    .build() {
}

class ListPromptRoutersCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListPromptRouters", {})
    .n("BedrockClient", "ListPromptRoutersCommand")
    .sc(schemas_0.ListPromptRouters$)
    .build() {
}

class ListProvisionedModelThroughputsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListProvisionedModelThroughputs", {})
    .n("BedrockClient", "ListProvisionedModelThroughputsCommand")
    .sc(schemas_0.ListProvisionedModelThroughputs$)
    .build() {
}

class ListTagsForResourceCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListTagsForResource", {})
    .n("BedrockClient", "ListTagsForResourceCommand")
    .sc(schemas_0.ListTagsForResource$)
    .build() {
}

class PutEnforcedGuardrailConfigurationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "PutEnforcedGuardrailConfiguration", {})
    .n("BedrockClient", "PutEnforcedGuardrailConfigurationCommand")
    .sc(schemas_0.PutEnforcedGuardrailConfiguration$)
    .build() {
}

class PutModelInvocationLoggingConfigurationCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "PutModelInvocationLoggingConfiguration", {})
    .n("BedrockClient", "PutModelInvocationLoggingConfigurationCommand")
    .sc(schemas_0.PutModelInvocationLoggingConfiguration$)
    .build() {
}

class PutUseCaseForModelAccessCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "PutUseCaseForModelAccess", {})
    .n("BedrockClient", "PutUseCaseForModelAccessCommand")
    .sc(schemas_0.PutUseCaseForModelAccess$)
    .build() {
}

class RegisterMarketplaceModelEndpointCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "RegisterMarketplaceModelEndpoint", {})
    .n("BedrockClient", "RegisterMarketplaceModelEndpointCommand")
    .sc(schemas_0.RegisterMarketplaceModelEndpoint$)
    .build() {
}

class StartAutomatedReasoningPolicyBuildWorkflowCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "StartAutomatedReasoningPolicyBuildWorkflow", {})
    .n("BedrockClient", "StartAutomatedReasoningPolicyBuildWorkflowCommand")
    .sc(schemas_0.StartAutomatedReasoningPolicyBuildWorkflow$)
    .build() {
}

class StartAutomatedReasoningPolicyTestWorkflowCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "StartAutomatedReasoningPolicyTestWorkflow", {})
    .n("BedrockClient", "StartAutomatedReasoningPolicyTestWorkflowCommand")
    .sc(schemas_0.StartAutomatedReasoningPolicyTestWorkflow$)
    .build() {
}

class StopEvaluationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "StopEvaluationJob", {})
    .n("BedrockClient", "StopEvaluationJobCommand")
    .sc(schemas_0.StopEvaluationJob$)
    .build() {
}

class StopModelCustomizationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "StopModelCustomizationJob", {})
    .n("BedrockClient", "StopModelCustomizationJobCommand")
    .sc(schemas_0.StopModelCustomizationJob$)
    .build() {
}

class StopModelInvocationJobCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "StopModelInvocationJob", {})
    .n("BedrockClient", "StopModelInvocationJobCommand")
    .sc(schemas_0.StopModelInvocationJob$)
    .build() {
}

class TagResourceCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "TagResource", {})
    .n("BedrockClient", "TagResourceCommand")
    .sc(schemas_0.TagResource$)
    .build() {
}

class UntagResourceCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UntagResource", {})
    .n("BedrockClient", "UntagResourceCommand")
    .sc(schemas_0.UntagResource$)
    .build() {
}

class UpdateAutomatedReasoningPolicyAnnotationsCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateAutomatedReasoningPolicyAnnotations", {})
    .n("BedrockClient", "UpdateAutomatedReasoningPolicyAnnotationsCommand")
    .sc(schemas_0.UpdateAutomatedReasoningPolicyAnnotations$)
    .build() {
}

class UpdateAutomatedReasoningPolicyCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateAutomatedReasoningPolicy", {})
    .n("BedrockClient", "UpdateAutomatedReasoningPolicyCommand")
    .sc(schemas_0.UpdateAutomatedReasoningPolicy$)
    .build() {
}

class UpdateAutomatedReasoningPolicyTestCaseCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateAutomatedReasoningPolicyTestCase", {})
    .n("BedrockClient", "UpdateAutomatedReasoningPolicyTestCaseCommand")
    .sc(schemas_0.UpdateAutomatedReasoningPolicyTestCase$)
    .build() {
}

class UpdateCustomModelDeploymentCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateCustomModelDeployment", {})
    .n("BedrockClient", "UpdateCustomModelDeploymentCommand")
    .sc(schemas_0.UpdateCustomModelDeployment$)
    .build() {
}

class UpdateGuardrailCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateGuardrail", {})
    .n("BedrockClient", "UpdateGuardrailCommand")
    .sc(schemas_0.UpdateGuardrail$)
    .build() {
}

class UpdateMarketplaceModelEndpointCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateMarketplaceModelEndpoint", {})
    .n("BedrockClient", "UpdateMarketplaceModelEndpointCommand")
    .sc(schemas_0.UpdateMarketplaceModelEndpoint$)
    .build() {
}

class UpdateProvisionedModelThroughputCommand extends smithyClient.Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [middlewareEndpoint.getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateProvisionedModelThroughput", {})
    .n("BedrockClient", "UpdateProvisionedModelThroughputCommand")
    .sc(schemas_0.UpdateProvisionedModelThroughput$)
    .build() {
}

const paginateListAutomatedReasoningPolicies = core.createPaginator(BedrockClient, ListAutomatedReasoningPoliciesCommand, "nextToken", "nextToken", "maxResults");

const paginateListAutomatedReasoningPolicyBuildWorkflows = core.createPaginator(BedrockClient, ListAutomatedReasoningPolicyBuildWorkflowsCommand, "nextToken", "nextToken", "maxResults");

const paginateListAutomatedReasoningPolicyTestCases = core.createPaginator(BedrockClient, ListAutomatedReasoningPolicyTestCasesCommand, "nextToken", "nextToken", "maxResults");

const paginateListAutomatedReasoningPolicyTestResults = core.createPaginator(BedrockClient, ListAutomatedReasoningPolicyTestResultsCommand, "nextToken", "nextToken", "maxResults");

const paginateListCustomModelDeployments = core.createPaginator(BedrockClient, ListCustomModelDeploymentsCommand, "nextToken", "nextToken", "maxResults");

const paginateListCustomModels = core.createPaginator(BedrockClient, ListCustomModelsCommand, "nextToken", "nextToken", "maxResults");

const paginateListEnforcedGuardrailsConfiguration = core.createPaginator(BedrockClient, ListEnforcedGuardrailsConfigurationCommand, "nextToken", "nextToken", "");

const paginateListEvaluationJobs = core.createPaginator(BedrockClient, ListEvaluationJobsCommand, "nextToken", "nextToken", "maxResults");

const paginateListGuardrails = core.createPaginator(BedrockClient, ListGuardrailsCommand, "nextToken", "nextToken", "maxResults");

const paginateListImportedModels = core.createPaginator(BedrockClient, ListImportedModelsCommand, "nextToken", "nextToken", "maxResults");

const paginateListInferenceProfiles = core.createPaginator(BedrockClient, ListInferenceProfilesCommand, "nextToken", "nextToken", "maxResults");

const paginateListMarketplaceModelEndpoints = core.createPaginator(BedrockClient, ListMarketplaceModelEndpointsCommand, "nextToken", "nextToken", "maxResults");

const paginateListModelCopyJobs = core.createPaginator(BedrockClient, ListModelCopyJobsCommand, "nextToken", "nextToken", "maxResults");

const paginateListModelCustomizationJobs = core.createPaginator(BedrockClient, ListModelCustomizationJobsCommand, "nextToken", "nextToken", "maxResults");

const paginateListModelImportJobs = core.createPaginator(BedrockClient, ListModelImportJobsCommand, "nextToken", "nextToken", "maxResults");

const paginateListModelInvocationJobs = core.createPaginator(BedrockClient, ListModelInvocationJobsCommand, "nextToken", "nextToken", "maxResults");

const paginateListPromptRouters = core.createPaginator(BedrockClient, ListPromptRoutersCommand, "nextToken", "nextToken", "maxResults");

const paginateListProvisionedModelThroughputs = core.createPaginator(BedrockClient, ListProvisionedModelThroughputsCommand, "nextToken", "nextToken", "maxResults");

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
class Bedrock extends BedrockClient {
}
smithyClient.createAggregatedClient(commands, Bedrock, { paginators });

const InputTags = {
    HONOR: "HONOR",
    IGNORE: "IGNORE",
};
const ConfigurationOwner = {
    ACCOUNT: "ACCOUNT",
};
const AgreementStatus = {
    AVAILABLE: "AVAILABLE",
    ERROR: "ERROR",
    NOT_AVAILABLE: "NOT_AVAILABLE",
    PENDING: "PENDING",
};
const AutomatedReasoningCheckResult = {
    IMPOSSIBLE: "IMPOSSIBLE",
    INVALID: "INVALID",
    NO_TRANSLATION: "NO_TRANSLATION",
    SATISFIABLE: "SATISFIABLE",
    TOO_COMPLEX: "TOO_COMPLEX",
    TRANSLATION_AMBIGUOUS: "TRANSLATION_AMBIGUOUS",
    VALID: "VALID",
};
const AutomatedReasoningPolicyBuildWorkflowType = {
    GENERATE_FIDELITY_REPORT: "GENERATE_FIDELITY_REPORT",
    GENERATE_POLICY_SCENARIOS: "GENERATE_POLICY_SCENARIOS",
    IMPORT_POLICY: "IMPORT_POLICY",
    INGEST_CONTENT: "INGEST_CONTENT",
    REFINE_POLICY: "REFINE_POLICY",
};
const AutomatedReasoningPolicyBuildDocumentContentType = {
    PDF: "pdf",
    TEXT: "txt",
};
const AutomatedReasoningPolicyBuildWorkflowStatus = {
    BUILDING: "BUILDING",
    CANCELLED: "CANCELLED",
    CANCEL_REQUESTED: "CANCEL_REQUESTED",
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    PREPROCESSING: "PREPROCESSING",
    SCHEDULED: "SCHEDULED",
    TESTING: "TESTING",
};
const AutomatedReasoningPolicyBuildResultAssetType = {
    ASSET_MANIFEST: "ASSET_MANIFEST",
    BUILD_LOG: "BUILD_LOG",
    FIDELITY_REPORT: "FIDELITY_REPORT",
    GENERATED_TEST_CASES: "GENERATED_TEST_CASES",
    POLICY_DEFINITION: "POLICY_DEFINITION",
    POLICY_SCENARIOS: "POLICY_SCENARIOS",
    QUALITY_REPORT: "QUALITY_REPORT",
    SOURCE_DOCUMENT: "SOURCE_DOCUMENT",
};
const AutomatedReasoningPolicyBuildMessageType = {
    ERROR: "ERROR",
    INFO: "INFO",
    WARNING: "WARNING",
};
const AutomatedReasoningPolicyAnnotationStatus = {
    APPLIED: "APPLIED",
    FAILED: "FAILED",
};
const AutomatedReasoningCheckLogicWarningType = {
    ALWAYS_FALSE: "ALWAYS_FALSE",
    ALWAYS_TRUE: "ALWAYS_TRUE",
};
const AutomatedReasoningPolicyTestRunResult = {
    FAILED: "FAILED",
    PASSED: "PASSED",
};
const AutomatedReasoningPolicyTestRunStatus = {
    COMPLETED: "COMPLETED",
    FAILED: "FAILED",
    IN_PROGRESS: "IN_PROGRESS",
    NOT_STARTED: "NOT_STARTED",
    SCHEDULED: "SCHEDULED",
};
const Status = {
    INCOMPATIBLE_ENDPOINT: "INCOMPATIBLE_ENDPOINT",
    REGISTERED: "REGISTERED",
};
const CustomModelDeploymentStatus = {
    ACTIVE: "Active",
    CREATING: "Creating",
    FAILED: "Failed",
};
const CustomModelDeploymentUpdateStatus = {
    UPDATE_COMPLETED: "UpdateCompleted",
    UPDATE_FAILED: "UpdateFailed",
    UPDATING: "Updating",
};
const SortModelsBy = {
    CREATION_TIME: "CreationTime",
};
const SortOrder = {
    ASCENDING: "Ascending",
    DESCENDING: "Descending",
};
const ReasoningEffort = {
    HIGH: "high",
    LOW: "low",
    MEDIUM: "medium",
};
const CustomizationType = {
    CONTINUED_PRE_TRAINING: "CONTINUED_PRE_TRAINING",
    DISTILLATION: "DISTILLATION",
    FINE_TUNING: "FINE_TUNING",
    IMPORTED: "IMPORTED",
    REINFORCEMENT_FINE_TUNING: "REINFORCEMENT_FINE_TUNING",
};
const ModelStatus = {
    ACTIVE: "Active",
    CREATING: "Creating",
    FAILED: "Failed",
};
const EvaluationJobStatus = {
    COMPLETED: "Completed",
    DELETING: "Deleting",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
    STOPPED: "Stopped",
    STOPPING: "Stopping",
};
const ApplicationType = {
    MODEL_EVALUATION: "ModelEvaluation",
    RAG_EVALUATION: "RagEvaluation",
};
const EvaluationTaskType = {
    CLASSIFICATION: "Classification",
    CUSTOM: "Custom",
    GENERATION: "Generation",
    QUESTION_AND_ANSWER: "QuestionAndAnswer",
    SUMMARIZATION: "Summarization",
};
const PerformanceConfigLatency = {
    OPTIMIZED: "optimized",
    STANDARD: "standard",
};
const ExternalSourceType = {
    BYTE_CONTENT: "BYTE_CONTENT",
    S3: "S3",
};
const QueryTransformationType = {
    QUERY_DECOMPOSITION: "QUERY_DECOMPOSITION",
};
const AttributeType = {
    BOOLEAN: "BOOLEAN",
    NUMBER: "NUMBER",
    STRING: "STRING",
    STRING_LIST: "STRING_LIST",
};
const SearchType = {
    HYBRID: "HYBRID",
    SEMANTIC: "SEMANTIC",
};
const RerankingMetadataSelectionMode = {
    ALL: "ALL",
    SELECTIVE: "SELECTIVE",
};
const VectorSearchRerankingConfigurationType = {
    BEDROCK_RERANKING_MODEL: "BEDROCK_RERANKING_MODEL",
};
const RetrieveAndGenerateType = {
    EXTERNAL_SOURCES: "EXTERNAL_SOURCES",
    KNOWLEDGE_BASE: "KNOWLEDGE_BASE",
};
const EvaluationJobType = {
    AUTOMATED: "Automated",
    HUMAN: "Human",
};
const SortJobsBy = {
    CREATION_TIME: "CreationTime",
};
const GuardrailContentFilterAction = {
    BLOCK: "BLOCK",
    NONE: "NONE",
};
const GuardrailModality = {
    IMAGE: "IMAGE",
    TEXT: "TEXT",
};
const GuardrailFilterStrength = {
    HIGH: "HIGH",
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    NONE: "NONE",
};
const GuardrailContentFilterType = {
    HATE: "HATE",
    INSULTS: "INSULTS",
    MISCONDUCT: "MISCONDUCT",
    PROMPT_ATTACK: "PROMPT_ATTACK",
    SEXUAL: "SEXUAL",
    VIOLENCE: "VIOLENCE",
};
const GuardrailContentFiltersTierName = {
    CLASSIC: "CLASSIC",
    STANDARD: "STANDARD",
};
const GuardrailContextualGroundingAction = {
    BLOCK: "BLOCK",
    NONE: "NONE",
};
const GuardrailContextualGroundingFilterType = {
    GROUNDING: "GROUNDING",
    RELEVANCE: "RELEVANCE",
};
const GuardrailSensitiveInformationAction = {
    ANONYMIZE: "ANONYMIZE",
    BLOCK: "BLOCK",
    NONE: "NONE",
};
const GuardrailPiiEntityType = {
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
const GuardrailTopicsTierName = {
    CLASSIC: "CLASSIC",
    STANDARD: "STANDARD",
};
const GuardrailTopicAction = {
    BLOCK: "BLOCK",
    NONE: "NONE",
};
const GuardrailTopicType = {
    DENY: "DENY",
};
const GuardrailWordAction = {
    BLOCK: "BLOCK",
    NONE: "NONE",
};
const GuardrailManagedWordsType = {
    PROFANITY: "PROFANITY",
};
const GuardrailStatus = {
    CREATING: "CREATING",
    DELETING: "DELETING",
    FAILED: "FAILED",
    READY: "READY",
    UPDATING: "UPDATING",
    VERSIONING: "VERSIONING",
};
const InferenceProfileStatus = {
    ACTIVE: "ACTIVE",
};
const InferenceProfileType = {
    APPLICATION: "APPLICATION",
    SYSTEM_DEFINED: "SYSTEM_DEFINED",
};
const ModelCopyJobStatus = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
};
const ModelImportJobStatus = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
};
const S3InputFormat = {
    JSONL: "JSONL",
};
const ModelInvocationType = {
    Converse: "Converse",
    InvokeModel: "InvokeModel",
};
const ModelInvocationJobStatus = {
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
const ModelCustomization = {
    CONTINUED_PRE_TRAINING: "CONTINUED_PRE_TRAINING",
    DISTILLATION: "DISTILLATION",
    FINE_TUNING: "FINE_TUNING",
};
const InferenceType = {
    ON_DEMAND: "ON_DEMAND",
    PROVISIONED: "PROVISIONED",
};
const ModelModality = {
    EMBEDDING: "EMBEDDING",
    IMAGE: "IMAGE",
    TEXT: "TEXT",
};
const FoundationModelLifecycleStatus = {
    ACTIVE: "ACTIVE",
    LEGACY: "LEGACY",
};
const PromptRouterStatus = {
    AVAILABLE: "AVAILABLE",
};
const PromptRouterType = {
    CUSTOM: "custom",
    DEFAULT: "default",
};
const CommitmentDuration = {
    ONE_MONTH: "OneMonth",
    SIX_MONTHS: "SixMonths",
};
const ProvisionedModelStatus = {
    CREATING: "Creating",
    FAILED: "Failed",
    IN_SERVICE: "InService",
    UPDATING: "Updating",
};
const SortByProvisionedModels = {
    CREATION_TIME: "CreationTime",
};
const AuthorizationStatus = {
    AUTHORIZED: "AUTHORIZED",
    NOT_AUTHORIZED: "NOT_AUTHORIZED",
};
const EntitlementAvailability = {
    AVAILABLE: "AVAILABLE",
    NOT_AVAILABLE: "NOT_AVAILABLE",
};
const RegionAvailability = {
    AVAILABLE: "AVAILABLE",
    NOT_AVAILABLE: "NOT_AVAILABLE",
};
const OfferType = {
    ALL: "ALL",
    PUBLIC: "PUBLIC",
};
const ModelCustomizationJobStatus = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
    STOPPED: "Stopped",
    STOPPING: "Stopping",
};
const JobStatusDetails = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
    NOT_STARTED: "NotStarted",
    STOPPED: "Stopped",
    STOPPING: "Stopping",
};
const FineTuningJobStatus = {
    COMPLETED: "Completed",
    FAILED: "Failed",
    IN_PROGRESS: "InProgress",
    STOPPED: "Stopped",
    STOPPING: "Stopping",
};

exports.$Command = smithyClient.Command;
exports.__Client = smithyClient.Client;
exports.BedrockServiceException = BedrockServiceException.BedrockServiceException;
exports.AgreementStatus = AgreementStatus;
exports.ApplicationType = ApplicationType;
exports.AttributeType = AttributeType;
exports.AuthorizationStatus = AuthorizationStatus;
exports.AutomatedReasoningCheckLogicWarningType = AutomatedReasoningCheckLogicWarningType;
exports.AutomatedReasoningCheckResult = AutomatedReasoningCheckResult;
exports.AutomatedReasoningPolicyAnnotationStatus = AutomatedReasoningPolicyAnnotationStatus;
exports.AutomatedReasoningPolicyBuildDocumentContentType = AutomatedReasoningPolicyBuildDocumentContentType;
exports.AutomatedReasoningPolicyBuildMessageType = AutomatedReasoningPolicyBuildMessageType;
exports.AutomatedReasoningPolicyBuildResultAssetType = AutomatedReasoningPolicyBuildResultAssetType;
exports.AutomatedReasoningPolicyBuildWorkflowStatus = AutomatedReasoningPolicyBuildWorkflowStatus;
exports.AutomatedReasoningPolicyBuildWorkflowType = AutomatedReasoningPolicyBuildWorkflowType;
exports.AutomatedReasoningPolicyTestRunResult = AutomatedReasoningPolicyTestRunResult;
exports.AutomatedReasoningPolicyTestRunStatus = AutomatedReasoningPolicyTestRunStatus;
exports.BatchDeleteEvaluationJobCommand = BatchDeleteEvaluationJobCommand;
exports.Bedrock = Bedrock;
exports.BedrockClient = BedrockClient;
exports.CancelAutomatedReasoningPolicyBuildWorkflowCommand = CancelAutomatedReasoningPolicyBuildWorkflowCommand;
exports.CommitmentDuration = CommitmentDuration;
exports.ConfigurationOwner = ConfigurationOwner;
exports.CreateAutomatedReasoningPolicyCommand = CreateAutomatedReasoningPolicyCommand;
exports.CreateAutomatedReasoningPolicyTestCaseCommand = CreateAutomatedReasoningPolicyTestCaseCommand;
exports.CreateAutomatedReasoningPolicyVersionCommand = CreateAutomatedReasoningPolicyVersionCommand;
exports.CreateCustomModelCommand = CreateCustomModelCommand;
exports.CreateCustomModelDeploymentCommand = CreateCustomModelDeploymentCommand;
exports.CreateEvaluationJobCommand = CreateEvaluationJobCommand;
exports.CreateFoundationModelAgreementCommand = CreateFoundationModelAgreementCommand;
exports.CreateGuardrailCommand = CreateGuardrailCommand;
exports.CreateGuardrailVersionCommand = CreateGuardrailVersionCommand;
exports.CreateInferenceProfileCommand = CreateInferenceProfileCommand;
exports.CreateMarketplaceModelEndpointCommand = CreateMarketplaceModelEndpointCommand;
exports.CreateModelCopyJobCommand = CreateModelCopyJobCommand;
exports.CreateModelCustomizationJobCommand = CreateModelCustomizationJobCommand;
exports.CreateModelImportJobCommand = CreateModelImportJobCommand;
exports.CreateModelInvocationJobCommand = CreateModelInvocationJobCommand;
exports.CreatePromptRouterCommand = CreatePromptRouterCommand;
exports.CreateProvisionedModelThroughputCommand = CreateProvisionedModelThroughputCommand;
exports.CustomModelDeploymentStatus = CustomModelDeploymentStatus;
exports.CustomModelDeploymentUpdateStatus = CustomModelDeploymentUpdateStatus;
exports.CustomizationType = CustomizationType;
exports.DeleteAutomatedReasoningPolicyBuildWorkflowCommand = DeleteAutomatedReasoningPolicyBuildWorkflowCommand;
exports.DeleteAutomatedReasoningPolicyCommand = DeleteAutomatedReasoningPolicyCommand;
exports.DeleteAutomatedReasoningPolicyTestCaseCommand = DeleteAutomatedReasoningPolicyTestCaseCommand;
exports.DeleteCustomModelCommand = DeleteCustomModelCommand;
exports.DeleteCustomModelDeploymentCommand = DeleteCustomModelDeploymentCommand;
exports.DeleteEnforcedGuardrailConfigurationCommand = DeleteEnforcedGuardrailConfigurationCommand;
exports.DeleteFoundationModelAgreementCommand = DeleteFoundationModelAgreementCommand;
exports.DeleteGuardrailCommand = DeleteGuardrailCommand;
exports.DeleteImportedModelCommand = DeleteImportedModelCommand;
exports.DeleteInferenceProfileCommand = DeleteInferenceProfileCommand;
exports.DeleteMarketplaceModelEndpointCommand = DeleteMarketplaceModelEndpointCommand;
exports.DeleteModelInvocationLoggingConfigurationCommand = DeleteModelInvocationLoggingConfigurationCommand;
exports.DeletePromptRouterCommand = DeletePromptRouterCommand;
exports.DeleteProvisionedModelThroughputCommand = DeleteProvisionedModelThroughputCommand;
exports.DeregisterMarketplaceModelEndpointCommand = DeregisterMarketplaceModelEndpointCommand;
exports.EntitlementAvailability = EntitlementAvailability;
exports.EvaluationJobStatus = EvaluationJobStatus;
exports.EvaluationJobType = EvaluationJobType;
exports.EvaluationTaskType = EvaluationTaskType;
exports.ExportAutomatedReasoningPolicyVersionCommand = ExportAutomatedReasoningPolicyVersionCommand;
exports.ExternalSourceType = ExternalSourceType;
exports.FineTuningJobStatus = FineTuningJobStatus;
exports.FoundationModelLifecycleStatus = FoundationModelLifecycleStatus;
exports.GetAutomatedReasoningPolicyAnnotationsCommand = GetAutomatedReasoningPolicyAnnotationsCommand;
exports.GetAutomatedReasoningPolicyBuildWorkflowCommand = GetAutomatedReasoningPolicyBuildWorkflowCommand;
exports.GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand = GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand;
exports.GetAutomatedReasoningPolicyCommand = GetAutomatedReasoningPolicyCommand;
exports.GetAutomatedReasoningPolicyNextScenarioCommand = GetAutomatedReasoningPolicyNextScenarioCommand;
exports.GetAutomatedReasoningPolicyTestCaseCommand = GetAutomatedReasoningPolicyTestCaseCommand;
exports.GetAutomatedReasoningPolicyTestResultCommand = GetAutomatedReasoningPolicyTestResultCommand;
exports.GetCustomModelCommand = GetCustomModelCommand;
exports.GetCustomModelDeploymentCommand = GetCustomModelDeploymentCommand;
exports.GetEvaluationJobCommand = GetEvaluationJobCommand;
exports.GetFoundationModelAvailabilityCommand = GetFoundationModelAvailabilityCommand;
exports.GetFoundationModelCommand = GetFoundationModelCommand;
exports.GetGuardrailCommand = GetGuardrailCommand;
exports.GetImportedModelCommand = GetImportedModelCommand;
exports.GetInferenceProfileCommand = GetInferenceProfileCommand;
exports.GetMarketplaceModelEndpointCommand = GetMarketplaceModelEndpointCommand;
exports.GetModelCopyJobCommand = GetModelCopyJobCommand;
exports.GetModelCustomizationJobCommand = GetModelCustomizationJobCommand;
exports.GetModelImportJobCommand = GetModelImportJobCommand;
exports.GetModelInvocationJobCommand = GetModelInvocationJobCommand;
exports.GetModelInvocationLoggingConfigurationCommand = GetModelInvocationLoggingConfigurationCommand;
exports.GetPromptRouterCommand = GetPromptRouterCommand;
exports.GetProvisionedModelThroughputCommand = GetProvisionedModelThroughputCommand;
exports.GetUseCaseForModelAccessCommand = GetUseCaseForModelAccessCommand;
exports.GuardrailContentFilterAction = GuardrailContentFilterAction;
exports.GuardrailContentFilterType = GuardrailContentFilterType;
exports.GuardrailContentFiltersTierName = GuardrailContentFiltersTierName;
exports.GuardrailContextualGroundingAction = GuardrailContextualGroundingAction;
exports.GuardrailContextualGroundingFilterType = GuardrailContextualGroundingFilterType;
exports.GuardrailFilterStrength = GuardrailFilterStrength;
exports.GuardrailManagedWordsType = GuardrailManagedWordsType;
exports.GuardrailModality = GuardrailModality;
exports.GuardrailPiiEntityType = GuardrailPiiEntityType;
exports.GuardrailSensitiveInformationAction = GuardrailSensitiveInformationAction;
exports.GuardrailStatus = GuardrailStatus;
exports.GuardrailTopicAction = GuardrailTopicAction;
exports.GuardrailTopicType = GuardrailTopicType;
exports.GuardrailTopicsTierName = GuardrailTopicsTierName;
exports.GuardrailWordAction = GuardrailWordAction;
exports.InferenceProfileStatus = InferenceProfileStatus;
exports.InferenceProfileType = InferenceProfileType;
exports.InferenceType = InferenceType;
exports.InputTags = InputTags;
exports.JobStatusDetails = JobStatusDetails;
exports.ListAutomatedReasoningPoliciesCommand = ListAutomatedReasoningPoliciesCommand;
exports.ListAutomatedReasoningPolicyBuildWorkflowsCommand = ListAutomatedReasoningPolicyBuildWorkflowsCommand;
exports.ListAutomatedReasoningPolicyTestCasesCommand = ListAutomatedReasoningPolicyTestCasesCommand;
exports.ListAutomatedReasoningPolicyTestResultsCommand = ListAutomatedReasoningPolicyTestResultsCommand;
exports.ListCustomModelDeploymentsCommand = ListCustomModelDeploymentsCommand;
exports.ListCustomModelsCommand = ListCustomModelsCommand;
exports.ListEnforcedGuardrailsConfigurationCommand = ListEnforcedGuardrailsConfigurationCommand;
exports.ListEvaluationJobsCommand = ListEvaluationJobsCommand;
exports.ListFoundationModelAgreementOffersCommand = ListFoundationModelAgreementOffersCommand;
exports.ListFoundationModelsCommand = ListFoundationModelsCommand;
exports.ListGuardrailsCommand = ListGuardrailsCommand;
exports.ListImportedModelsCommand = ListImportedModelsCommand;
exports.ListInferenceProfilesCommand = ListInferenceProfilesCommand;
exports.ListMarketplaceModelEndpointsCommand = ListMarketplaceModelEndpointsCommand;
exports.ListModelCopyJobsCommand = ListModelCopyJobsCommand;
exports.ListModelCustomizationJobsCommand = ListModelCustomizationJobsCommand;
exports.ListModelImportJobsCommand = ListModelImportJobsCommand;
exports.ListModelInvocationJobsCommand = ListModelInvocationJobsCommand;
exports.ListPromptRoutersCommand = ListPromptRoutersCommand;
exports.ListProvisionedModelThroughputsCommand = ListProvisionedModelThroughputsCommand;
exports.ListTagsForResourceCommand = ListTagsForResourceCommand;
exports.ModelCopyJobStatus = ModelCopyJobStatus;
exports.ModelCustomization = ModelCustomization;
exports.ModelCustomizationJobStatus = ModelCustomizationJobStatus;
exports.ModelImportJobStatus = ModelImportJobStatus;
exports.ModelInvocationJobStatus = ModelInvocationJobStatus;
exports.ModelInvocationType = ModelInvocationType;
exports.ModelModality = ModelModality;
exports.ModelStatus = ModelStatus;
exports.OfferType = OfferType;
exports.PerformanceConfigLatency = PerformanceConfigLatency;
exports.PromptRouterStatus = PromptRouterStatus;
exports.PromptRouterType = PromptRouterType;
exports.ProvisionedModelStatus = ProvisionedModelStatus;
exports.PutEnforcedGuardrailConfigurationCommand = PutEnforcedGuardrailConfigurationCommand;
exports.PutModelInvocationLoggingConfigurationCommand = PutModelInvocationLoggingConfigurationCommand;
exports.PutUseCaseForModelAccessCommand = PutUseCaseForModelAccessCommand;
exports.QueryTransformationType = QueryTransformationType;
exports.ReasoningEffort = ReasoningEffort;
exports.RegionAvailability = RegionAvailability;
exports.RegisterMarketplaceModelEndpointCommand = RegisterMarketplaceModelEndpointCommand;
exports.RerankingMetadataSelectionMode = RerankingMetadataSelectionMode;
exports.RetrieveAndGenerateType = RetrieveAndGenerateType;
exports.S3InputFormat = S3InputFormat;
exports.SearchType = SearchType;
exports.SortByProvisionedModels = SortByProvisionedModels;
exports.SortJobsBy = SortJobsBy;
exports.SortModelsBy = SortModelsBy;
exports.SortOrder = SortOrder;
exports.StartAutomatedReasoningPolicyBuildWorkflowCommand = StartAutomatedReasoningPolicyBuildWorkflowCommand;
exports.StartAutomatedReasoningPolicyTestWorkflowCommand = StartAutomatedReasoningPolicyTestWorkflowCommand;
exports.Status = Status;
exports.StopEvaluationJobCommand = StopEvaluationJobCommand;
exports.StopModelCustomizationJobCommand = StopModelCustomizationJobCommand;
exports.StopModelInvocationJobCommand = StopModelInvocationJobCommand;
exports.TagResourceCommand = TagResourceCommand;
exports.UntagResourceCommand = UntagResourceCommand;
exports.UpdateAutomatedReasoningPolicyAnnotationsCommand = UpdateAutomatedReasoningPolicyAnnotationsCommand;
exports.UpdateAutomatedReasoningPolicyCommand = UpdateAutomatedReasoningPolicyCommand;
exports.UpdateAutomatedReasoningPolicyTestCaseCommand = UpdateAutomatedReasoningPolicyTestCaseCommand;
exports.UpdateCustomModelDeploymentCommand = UpdateCustomModelDeploymentCommand;
exports.UpdateGuardrailCommand = UpdateGuardrailCommand;
exports.UpdateMarketplaceModelEndpointCommand = UpdateMarketplaceModelEndpointCommand;
exports.UpdateProvisionedModelThroughputCommand = UpdateProvisionedModelThroughputCommand;
exports.VectorSearchRerankingConfigurationType = VectorSearchRerankingConfigurationType;
exports.paginateListAutomatedReasoningPolicies = paginateListAutomatedReasoningPolicies;
exports.paginateListAutomatedReasoningPolicyBuildWorkflows = paginateListAutomatedReasoningPolicyBuildWorkflows;
exports.paginateListAutomatedReasoningPolicyTestCases = paginateListAutomatedReasoningPolicyTestCases;
exports.paginateListAutomatedReasoningPolicyTestResults = paginateListAutomatedReasoningPolicyTestResults;
exports.paginateListCustomModelDeployments = paginateListCustomModelDeployments;
exports.paginateListCustomModels = paginateListCustomModels;
exports.paginateListEnforcedGuardrailsConfiguration = paginateListEnforcedGuardrailsConfiguration;
exports.paginateListEvaluationJobs = paginateListEvaluationJobs;
exports.paginateListGuardrails = paginateListGuardrails;
exports.paginateListImportedModels = paginateListImportedModels;
exports.paginateListInferenceProfiles = paginateListInferenceProfiles;
exports.paginateListMarketplaceModelEndpoints = paginateListMarketplaceModelEndpoints;
exports.paginateListModelCopyJobs = paginateListModelCopyJobs;
exports.paginateListModelCustomizationJobs = paginateListModelCustomizationJobs;
exports.paginateListModelImportJobs = paginateListModelImportJobs;
exports.paginateListModelInvocationJobs = paginateListModelInvocationJobs;
exports.paginateListPromptRouters = paginateListPromptRouters;
exports.paginateListProvisionedModelThroughputs = paginateListProvisionedModelThroughputs;
Object.prototype.hasOwnProperty.call(schemas_0, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: schemas_0['__proto__']
    });

Object.keys(schemas_0).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = schemas_0[k];
});
Object.prototype.hasOwnProperty.call(errors, '__proto__') &&
    !Object.prototype.hasOwnProperty.call(exports, '__proto__') &&
    Object.defineProperty(exports, '__proto__', {
        enumerable: true,
        value: errors['__proto__']
    });

Object.keys(errors).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) exports[k] = errors[k];
});
