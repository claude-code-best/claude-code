import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { CreateModelImportJobRequest, CreateModelImportJobResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link CreateModelImportJobCommand}.
 */
export interface CreateModelImportJobCommandInput extends CreateModelImportJobRequest {
}
/**
 * @public
 *
 * The output of {@link CreateModelImportJobCommand}.
 */
export interface CreateModelImportJobCommandOutput extends CreateModelImportJobResponse, __MetadataBearer {
}
declare const CreateModelImportJobCommand_base: {
    new (input: CreateModelImportJobCommandInput): import("@smithy/smithy-client").CommandImpl<CreateModelImportJobCommandInput, CreateModelImportJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: CreateModelImportJobCommandInput): import("@smithy/smithy-client").CommandImpl<CreateModelImportJobCommandInput, CreateModelImportJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Creates a model import job to import model that you have customized in other environments, such as Amazon SageMaker. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-import-model.html">Import a customized model</a> </p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, CreateModelImportJobCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, CreateModelImportJobCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // CreateModelImportJobRequest
 *   jobName: "STRING_VALUE", // required
 *   importedModelName: "STRING_VALUE", // required
 *   roleArn: "STRING_VALUE", // required
 *   modelDataSource: { // ModelDataSource Union: only one key present
 *     s3DataSource: { // S3DataSource
 *       s3Uri: "STRING_VALUE", // required
 *     },
 *   },
 *   jobTags: [ // TagList
 *     { // Tag
 *       key: "STRING_VALUE", // required
 *       value: "STRING_VALUE", // required
 *     },
 *   ],
 *   importedModelTags: [
 *     {
 *       key: "STRING_VALUE", // required
 *       value: "STRING_VALUE", // required
 *     },
 *   ],
 *   clientRequestToken: "STRING_VALUE",
 *   vpcConfig: { // VpcConfig
 *     subnetIds: [ // SubnetIds // required
 *       "STRING_VALUE",
 *     ],
 *     securityGroupIds: [ // SecurityGroupIds // required
 *       "STRING_VALUE",
 *     ],
 *   },
 *   importedModelKmsKeyId: "STRING_VALUE",
 * };
 * const command = new CreateModelImportJobCommand(input);
 * const response = await client.send(command);
 * // { // CreateModelImportJobResponse
 * //   jobArn: "STRING_VALUE", // required
 * // };
 *
 * ```
 *
 * @param CreateModelImportJobCommandInput - {@link CreateModelImportJobCommandInput}
 * @returns {@link CreateModelImportJobCommandOutput}
 * @see {@link CreateModelImportJobCommandInput} for command's `input` shape.
 * @see {@link CreateModelImportJobCommandOutput} for command's `response` shape.
 * @see {@link BedrockClientResolvedConfig | config} for BedrockClient's `config` shape.
 *
 * @throws {@link AccessDeniedException} (client fault)
 *  <p>The request is denied because of missing access permissions.</p>
 *
 * @throws {@link ConflictException} (client fault)
 *  <p>Error occurred because of a conflict while performing an operation.</p>
 *
 * @throws {@link InternalServerException} (server fault)
 *  <p>An internal server error occurred. Retry your request.</p>
 *
 * @throws {@link ResourceNotFoundException} (client fault)
 *  <p>The specified resource Amazon Resource Name (ARN) was not found. Check the Amazon Resource Name (ARN) and try your request again.</p>
 *
 * @throws {@link ServiceQuotaExceededException} (client fault)
 *  <p>The number of requests exceeds the service quota. Resubmit your request later.</p>
 *
 * @throws {@link ThrottlingException} (client fault)
 *  <p>The number of requests exceeds the limit. Resubmit your request later.</p>
 *
 * @throws {@link TooManyTagsException} (client fault)
 *  <p>The request contains more tags than can be associated with a resource (50 tags per resource). The maximum number of tags includes both existing tags and those included in your current request. </p>
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
export declare class CreateModelImportJobCommand extends CreateModelImportJobCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: CreateModelImportJobRequest;
            output: CreateModelImportJobResponse;
        };
        sdk: {
            input: CreateModelImportJobCommandInput;
            output: CreateModelImportJobCommandOutput;
        };
    };
}
