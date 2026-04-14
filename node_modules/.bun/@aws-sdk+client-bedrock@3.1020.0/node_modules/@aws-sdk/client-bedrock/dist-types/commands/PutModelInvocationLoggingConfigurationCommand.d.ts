import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { PutModelInvocationLoggingConfigurationRequest, PutModelInvocationLoggingConfigurationResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link PutModelInvocationLoggingConfigurationCommand}.
 */
export interface PutModelInvocationLoggingConfigurationCommandInput extends PutModelInvocationLoggingConfigurationRequest {
}
/**
 * @public
 *
 * The output of {@link PutModelInvocationLoggingConfigurationCommand}.
 */
export interface PutModelInvocationLoggingConfigurationCommandOutput extends PutModelInvocationLoggingConfigurationResponse, __MetadataBearer {
}
declare const PutModelInvocationLoggingConfigurationCommand_base: {
    new (input: PutModelInvocationLoggingConfigurationCommandInput): import("@smithy/smithy-client").CommandImpl<PutModelInvocationLoggingConfigurationCommandInput, PutModelInvocationLoggingConfigurationCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: PutModelInvocationLoggingConfigurationCommandInput): import("@smithy/smithy-client").CommandImpl<PutModelInvocationLoggingConfigurationCommandInput, PutModelInvocationLoggingConfigurationCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Set the configuration values for model invocation logging.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, PutModelInvocationLoggingConfigurationCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, PutModelInvocationLoggingConfigurationCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // PutModelInvocationLoggingConfigurationRequest
 *   loggingConfig: { // LoggingConfig
 *     cloudWatchConfig: { // CloudWatchConfig
 *       logGroupName: "STRING_VALUE", // required
 *       roleArn: "STRING_VALUE", // required
 *       largeDataDeliveryS3Config: { // S3Config
 *         bucketName: "STRING_VALUE", // required
 *         keyPrefix: "STRING_VALUE",
 *       },
 *     },
 *     s3Config: {
 *       bucketName: "STRING_VALUE", // required
 *       keyPrefix: "STRING_VALUE",
 *     },
 *     textDataDeliveryEnabled: true || false,
 *     imageDataDeliveryEnabled: true || false,
 *     embeddingDataDeliveryEnabled: true || false,
 *     videoDataDeliveryEnabled: true || false,
 *     audioDataDeliveryEnabled: true || false,
 *   },
 * };
 * const command = new PutModelInvocationLoggingConfigurationCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param PutModelInvocationLoggingConfigurationCommandInput - {@link PutModelInvocationLoggingConfigurationCommandInput}
 * @returns {@link PutModelInvocationLoggingConfigurationCommandOutput}
 * @see {@link PutModelInvocationLoggingConfigurationCommandInput} for command's `input` shape.
 * @see {@link PutModelInvocationLoggingConfigurationCommandOutput} for command's `response` shape.
 * @see {@link BedrockClientResolvedConfig | config} for BedrockClient's `config` shape.
 *
 * @throws {@link AccessDeniedException} (client fault)
 *  <p>The request is denied because of missing access permissions.</p>
 *
 * @throws {@link InternalServerException} (server fault)
 *  <p>An internal server error occurred. Retry your request.</p>
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
export declare class PutModelInvocationLoggingConfigurationCommand extends PutModelInvocationLoggingConfigurationCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: PutModelInvocationLoggingConfigurationRequest;
            output: {};
        };
        sdk: {
            input: PutModelInvocationLoggingConfigurationCommandInput;
            output: PutModelInvocationLoggingConfigurationCommandOutput;
        };
    };
}
