import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetCustomModelRequest, GetCustomModelResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetCustomModelCommand}.
 */
export interface GetCustomModelCommandInput extends GetCustomModelRequest {
}
/**
 * @public
 *
 * The output of {@link GetCustomModelCommand}.
 */
export interface GetCustomModelCommandOutput extends GetCustomModelResponse, __MetadataBearer {
}
declare const GetCustomModelCommand_base: {
    new (input: GetCustomModelCommandInput): import("@smithy/smithy-client").CommandImpl<GetCustomModelCommandInput, GetCustomModelCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetCustomModelCommandInput): import("@smithy/smithy-client").CommandImpl<GetCustomModelCommandInput, GetCustomModelCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Get the properties associated with a Amazon Bedrock custom model that you have created. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/custom-models.html">Custom models</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetCustomModelCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetCustomModelCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetCustomModelRequest
 *   modelIdentifier: "STRING_VALUE", // required
 * };
 * const command = new GetCustomModelCommand(input);
 * const response = await client.send(command);
 * // { // GetCustomModelResponse
 * //   modelArn: "STRING_VALUE", // required
 * //   modelName: "STRING_VALUE", // required
 * //   jobName: "STRING_VALUE",
 * //   jobArn: "STRING_VALUE",
 * //   baseModelArn: "STRING_VALUE",
 * //   customizationType: "FINE_TUNING" || "CONTINUED_PRE_TRAINING" || "DISTILLATION" || "REINFORCEMENT_FINE_TUNING" || "IMPORTED",
 * //   modelKmsKeyArn: "STRING_VALUE",
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
 * //   trainingMetrics: { // TrainingMetrics
 * //     trainingLoss: Number("float"),
 * //   },
 * //   validationMetrics: [ // ValidationMetrics
 * //     { // ValidatorMetric
 * //       validationLoss: Number("float"),
 * //     },
 * //   ],
 * //   creationTime: new Date("TIMESTAMP"), // required
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
 * //   modelStatus: "Active" || "Creating" || "Failed",
 * //   failureMessage: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param GetCustomModelCommandInput - {@link GetCustomModelCommandInput}
 * @returns {@link GetCustomModelCommandOutput}
 * @see {@link GetCustomModelCommandInput} for command's `input` shape.
 * @see {@link GetCustomModelCommandOutput} for command's `response` shape.
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
export declare class GetCustomModelCommand extends GetCustomModelCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetCustomModelRequest;
            output: GetCustomModelResponse;
        };
        sdk: {
            input: GetCustomModelCommandInput;
            output: GetCustomModelCommandOutput;
        };
    };
}
