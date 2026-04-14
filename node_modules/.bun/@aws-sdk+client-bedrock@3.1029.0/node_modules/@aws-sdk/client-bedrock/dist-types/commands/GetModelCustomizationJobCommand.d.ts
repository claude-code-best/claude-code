import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetModelCustomizationJobRequest, GetModelCustomizationJobResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetModelCustomizationJobCommand}.
 */
export interface GetModelCustomizationJobCommandInput extends GetModelCustomizationJobRequest {
}
/**
 * @public
 *
 * The output of {@link GetModelCustomizationJobCommand}.
 */
export interface GetModelCustomizationJobCommandOutput extends GetModelCustomizationJobResponse, __MetadataBearer {
}
declare const GetModelCustomizationJobCommand_base: {
    new (input: GetModelCustomizationJobCommandInput): import("@smithy/smithy-client").CommandImpl<GetModelCustomizationJobCommandInput, GetModelCustomizationJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetModelCustomizationJobCommandInput): import("@smithy/smithy-client").CommandImpl<GetModelCustomizationJobCommandInput, GetModelCustomizationJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Retrieves the properties associated with a model-customization job, including the status of the job. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models.html">Custom models</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetModelCustomizationJobCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetModelCustomizationJobCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetModelCustomizationJobRequest
 *   jobIdentifier: "STRING_VALUE", // required
 * };
 * const command = new GetModelCustomizationJobCommand(input);
 * const response = await client.send(command);
 * // { // GetModelCustomizationJobResponse
 * //   jobArn: "STRING_VALUE", // required
 * //   jobName: "STRING_VALUE", // required
 * //   outputModelName: "STRING_VALUE", // required
 * //   outputModelArn: "STRING_VALUE",
 * //   clientRequestToken: "STRING_VALUE",
 * //   roleArn: "STRING_VALUE", // required
 * //   status: "InProgress" || "Completed" || "Failed" || "Stopping" || "Stopped",
 * //   statusDetails: { // StatusDetails
 * //     validationDetails: { // ValidationDetails
 * //       status: "InProgress" || "Completed" || "Stopping" || "Stopped" || "Failed" || "NotStarted",
 * //       creationTime: new Date("TIMESTAMP"),
 * //       lastModifiedTime: new Date("TIMESTAMP"),
 * //     },
 * //     dataProcessingDetails: { // DataProcessingDetails
 * //       status: "InProgress" || "Completed" || "Stopping" || "Stopped" || "Failed" || "NotStarted",
 * //       creationTime: new Date("TIMESTAMP"),
 * //       lastModifiedTime: new Date("TIMESTAMP"),
 * //     },
 * //     trainingDetails: { // TrainingDetails
 * //       status: "InProgress" || "Completed" || "Stopping" || "Stopped" || "Failed" || "NotStarted",
 * //       creationTime: new Date("TIMESTAMP"),
 * //       lastModifiedTime: new Date("TIMESTAMP"),
 * //     },
 * //   },
 * //   failureMessage: "STRING_VALUE",
 * //   creationTime: new Date("TIMESTAMP"), // required
 * //   lastModifiedTime: new Date("TIMESTAMP"),
 * //   endTime: new Date("TIMESTAMP"),
 * //   baseModelArn: "STRING_VALUE", // required
 * //   hyperParameters: { // ModelCustomizationHyperParameters
 * //     "<keys>": "STRING_VALUE",
 * //   },
 * //   trainingDataConfig: { // TrainingDataConfig
 * //     s3Uri: "STRING_VALUE",
 * //     invocationLogsConfig: { // InvocationLogsConfig
 * //       usePromptResponse: true || false,
 * //       invocationLogSource: { // InvocationLogSource Union: only one key present
 * //         s3Uri: "STRING_VALUE",
 * //       },
 * //       requestMetadataFilters: { // RequestMetadataFilters Union: only one key present
 * //         equals: { // RequestMetadataMap
 * //           "<keys>": "STRING_VALUE",
 * //         },
 * //         notEquals: {
 * //           "<keys>": "STRING_VALUE",
 * //         },
 * //         andAll: [ // RequestMetadataFiltersList
 * //           { // RequestMetadataBaseFilters
 * //             equals: {
 * //               "<keys>": "STRING_VALUE",
 * //             },
 * //             notEquals: {
 * //               "<keys>": "STRING_VALUE",
 * //             },
 * //           },
 * //         ],
 * //         orAll: [
 * //           {
 * //             equals: {
 * //               "<keys>": "STRING_VALUE",
 * //             },
 * //             notEquals: "<RequestMetadataMap>",
 * //           },
 * //         ],
 * //       },
 * //     },
 * //   },
 * //   validationDataConfig: { // ValidationDataConfig
 * //     validators: [ // Validators // required
 * //       { // Validator
 * //         s3Uri: "STRING_VALUE", // required
 * //       },
 * //     ],
 * //   },
 * //   outputDataConfig: { // OutputDataConfig
 * //     s3Uri: "STRING_VALUE", // required
 * //   },
 * //   customizationType: "FINE_TUNING" || "CONTINUED_PRE_TRAINING" || "DISTILLATION" || "REINFORCEMENT_FINE_TUNING" || "IMPORTED",
 * //   outputModelKmsKeyArn: "STRING_VALUE",
 * //   trainingMetrics: { // TrainingMetrics
 * //     trainingLoss: Number("float"),
 * //   },
 * //   validationMetrics: [ // ValidationMetrics
 * //     { // ValidatorMetric
 * //       validationLoss: Number("float"),
 * //     },
 * //   ],
 * //   vpcConfig: { // VpcConfig
 * //     subnetIds: [ // SubnetIds // required
 * //       "STRING_VALUE",
 * //     ],
 * //     securityGroupIds: [ // SecurityGroupIds // required
 * //       "STRING_VALUE",
 * //     ],
 * //   },
 * //   customizationConfig: { // CustomizationConfig Union: only one key present
 * //     distillationConfig: { // DistillationConfig
 * //       teacherModelConfig: { // TeacherModelConfig
 * //         teacherModelIdentifier: "STRING_VALUE", // required
 * //         maxResponseLengthForInference: Number("int"),
 * //       },
 * //     },
 * //     rftConfig: { // RFTConfig
 * //       graderConfig: { // GraderConfig Union: only one key present
 * //         lambdaGrader: { // LambdaGraderConfig
 * //           lambdaArn: "STRING_VALUE", // required
 * //         },
 * //       },
 * //       hyperParameters: { // RFTHyperParameters
 * //         epochCount: Number("int"),
 * //         batchSize: Number("int"),
 * //         learningRate: Number("float"),
 * //         maxPromptLength: Number("int"),
 * //         trainingSamplePerPrompt: Number("int"),
 * //         inferenceMaxTokens: Number("int"),
 * //         reasoningEffort: "low" || "medium" || "high",
 * //         evalInterval: Number("int"),
 * //       },
 * //     },
 * //   },
 * // };
 *
 * ```
 *
 * @param GetModelCustomizationJobCommandInput - {@link GetModelCustomizationJobCommandInput}
 * @returns {@link GetModelCustomizationJobCommandOutput}
 * @see {@link GetModelCustomizationJobCommandInput} for command's `input` shape.
 * @see {@link GetModelCustomizationJobCommandOutput} for command's `response` shape.
 * @see {@link BedrockClientResolvedConfig | config} for BedrockClient's `config` shape.
 *
 * @throws {@link AccessDeniedException} (client fault)
 *  <p>The request is denied because of missing access permissions.</p>
 *
 * @throws {@link InternalServerException} (server fault)
 *  <p>An internal server error occurred. Retry your request.</p>
 *
 * @throws {@link ResourceNotFoundException} (client fault)
 *  <p>The specified resource Amazon Resource Name (ARN) was not found. Check the Amazon Resource Name (ARN) and try your request again.</p>
 *
 * @throws {@link ThrottlingException} (client fault)
 *  <p>The number of requests exceeds the limit. Resubmit your request later.</p>
 *
 * @throws {@link ValidationException} (client fault)
 *  <p>Input validation failed. Check your request parameters and retry the request.</p>
 *
 * @throws {@link BedrockServiceException}
 * <p>Base exception class for all service exceptions from Bedrock service.</p>
 *
 *
 * @public
 */
export declare class GetModelCustomizationJobCommand extends GetModelCustomizationJobCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetModelCustomizationJobRequest;
            output: GetModelCustomizationJobResponse;
        };
        sdk: {
            input: GetModelCustomizationJobCommandInput;
            output: GetModelCustomizationJobCommandOutput;
        };
    };
}
