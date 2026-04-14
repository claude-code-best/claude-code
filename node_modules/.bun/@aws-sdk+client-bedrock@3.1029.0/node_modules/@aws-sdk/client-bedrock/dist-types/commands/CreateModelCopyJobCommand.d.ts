import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { CreateModelCopyJobRequest, CreateModelCopyJobResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link CreateModelCopyJobCommand}.
 */
export interface CreateModelCopyJobCommandInput extends CreateModelCopyJobRequest {
}
/**
 * @public
 *
 * The output of {@link CreateModelCopyJobCommand}.
 */
export interface CreateModelCopyJobCommandOutput extends CreateModelCopyJobResponse, __MetadataBearer {
}
declare const CreateModelCopyJobCommand_base: {
    new (input: CreateModelCopyJobCommandInput): import("@smithy/smithy-client").CommandImpl<CreateModelCopyJobCommandInput, CreateModelCopyJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: CreateModelCopyJobCommandInput): import("@smithy/smithy-client").CommandImpl<CreateModelCopyJobCommandInput, CreateModelCopyJobCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Copies a model to another region so that it can be used there. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/copy-model.html">Copy models to be used in other regions</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, CreateModelCopyJobCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, CreateModelCopyJobCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // CreateModelCopyJobRequest
 *   sourceModelArn: "STRING_VALUE", // required
 *   targetModelName: "STRING_VALUE", // required
 *   modelKmsKeyId: "STRING_VALUE",
 *   targetModelTags: [ // TagList
 *     { // Tag
 *       key: "STRING_VALUE", // required
 *       value: "STRING_VALUE", // required
 *     },
 *   ],
 *   clientRequestToken: "STRING_VALUE",
 * };
 * const command = new CreateModelCopyJobCommand(input);
 * const response = await client.send(command);
 * // { // CreateModelCopyJobResponse
 * //   jobArn: "STRING_VALUE", // required
 * // };
 *
 * ```
 *
 * @param CreateModelCopyJobCommandInput - {@link CreateModelCopyJobCommandInput}
 * @returns {@link CreateModelCopyJobCommandOutput}
 * @see {@link CreateModelCopyJobCommandInput} for command's `input` shape.
 * @see {@link CreateModelCopyJobCommandOutput} for command's `response` shape.
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
 * @throws {@link TooManyTagsException} (client fault)
 *  <p>The request contains more tags than can be associated with a resource (50 tags per resource). The maximum number of tags includes both existing tags and those included in your current request. </p>
 *
 * @throws {@link BedrockServiceException}
 * <p>Base exception class for all service exceptions from Bedrock service.</p>
 *
 *
 * @public
 */
export declare class CreateModelCopyJobCommand extends CreateModelCopyJobCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: CreateModelCopyJobRequest;
            output: CreateModelCopyJobResponse;
        };
        sdk: {
            input: CreateModelCopyJobCommandInput;
            output: CreateModelCopyJobCommandOutput;
        };
    };
}
