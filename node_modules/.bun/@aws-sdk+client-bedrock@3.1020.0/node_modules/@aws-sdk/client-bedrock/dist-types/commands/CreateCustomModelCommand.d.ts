import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { CreateCustomModelRequest, CreateCustomModelResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link CreateCustomModelCommand}.
 */
export interface CreateCustomModelCommandInput extends CreateCustomModelRequest {
}
/**
 * @public
 *
 * The output of {@link CreateCustomModelCommand}.
 */
export interface CreateCustomModelCommandOutput extends CreateCustomModelResponse, __MetadataBearer {
}
declare const CreateCustomModelCommand_base: {
    new (input: CreateCustomModelCommandInput): import("@smithy/smithy-client").CommandImpl<CreateCustomModelCommandInput, CreateCustomModelCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: CreateCustomModelCommandInput): import("@smithy/smithy-client").CommandImpl<CreateCustomModelCommandInput, CreateCustomModelCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Creates a new custom model in Amazon Bedrock. After the model is active, you can use it for inference.</p> <p>To use the model for inference, you must purchase Provisioned Throughput for it. You can't use On-demand inference with these custom models. For more information about Provisioned Throughput, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html">Provisioned Throughput</a>.</p> <p>The model appears in <code>ListCustomModels</code> with a <code>customizationType</code> of <code>imported</code>. To track the status of the new model, you use the <code>GetCustomModel</code> API operation. The model can be in the following states:</p> <ul> <li> <p> <code>Creating</code> - Initial state during validation and registration</p> </li> <li> <p> <code>Active</code> - Model is ready for use in inference</p> </li> <li> <p> <code>Failed</code> - Creation process encountered an error</p> </li> </ul> <p> <b>Related APIs</b> </p> <ul> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_GetCustomModel.html">GetCustomModel</a> </p> </li> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_ListCustomModels.html">ListCustomModels</a> </p> </li> <li> <p> <a href="https://docs.aws.amazon.com/bedrock/latest/APIReference/API_DeleteCustomModel.html">DeleteCustomModel</a> </p> </li> </ul>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, CreateCustomModelCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, CreateCustomModelCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // CreateCustomModelRequest
 *   modelName: "STRING_VALUE", // required
 *   modelSourceConfig: { // ModelDataSource Union: only one key present
 *     s3DataSource: { // S3DataSource
 *       s3Uri: "STRING_VALUE", // required
 *     },
 *   },
 *   modelKmsKeyArn: "STRING_VALUE",
 *   roleArn: "STRING_VALUE",
 *   modelTags: [ // TagList
 *     { // Tag
 *       key: "STRING_VALUE", // required
 *       value: "STRING_VALUE", // required
 *     },
 *   ],
 *   clientRequestToken: "STRING_VALUE",
 * };
 * const command = new CreateCustomModelCommand(input);
 * const response = await client.send(command);
 * // { // CreateCustomModelResponse
 * //   modelArn: "STRING_VALUE", // required
 * // };
 *
 * ```
 *
 * @param CreateCustomModelCommandInput - {@link CreateCustomModelCommandInput}
 * @returns {@link CreateCustomModelCommandOutput}
 * @see {@link CreateCustomModelCommandInput} for command's `input` shape.
 * @see {@link CreateCustomModelCommandOutput} for command's `response` shape.
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
 * @example Successful CreateCustomModel API call
 * ```javascript
 * //
 * const input = {
 *   clientRequestToken: "foo",
 *   modelKmsKeyArn: "arn:aws:kms:us-east-1:123456789012:key/1234abcd-12ab-34cd-56ef-1234567890ab",
 *   modelName: "SampleModel",
 *   modelSourceConfig: {
 *     s3DataSource: {
 *       s3Uri: "s3://my-bucket/folder"
 *     }
 *   },
 *   modelTags: [
 *     {
 *       key: "foo",
 *       value: "foo"
 *     },
 *     {
 *       key: "foo",
 *       value: "foo"
 *     }
 *   ],
 *   roleArn: "arn:aws:iam::123456789012:role/SampleRole"
 * };
 * const command = new CreateCustomModelCommand(input);
 * const response = await client.send(command);
 * /* response is
 * {
 *   modelArn: "arn:aws:bedrock:us-east-1:123456789012:custom-model/imported/abcdef123456"
 * }
 * *\/
 * ```
 *
 * @public
 */
export declare class CreateCustomModelCommand extends CreateCustomModelCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: CreateCustomModelRequest;
            output: CreateCustomModelResponse;
        };
        sdk: {
            input: CreateCustomModelCommandInput;
            output: CreateCustomModelCommandOutput;
        };
    };
}
