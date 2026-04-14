import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteProvisionedModelThroughputRequest, DeleteProvisionedModelThroughputResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteProvisionedModelThroughputCommand}.
 */
export interface DeleteProvisionedModelThroughputCommandInput extends DeleteProvisionedModelThroughputRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteProvisionedModelThroughputCommand}.
 */
export interface DeleteProvisionedModelThroughputCommandOutput extends DeleteProvisionedModelThroughputResponse, __MetadataBearer {
}
declare const DeleteProvisionedModelThroughputCommand_base: {
    new (input: DeleteProvisionedModelThroughputCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteProvisionedModelThroughputCommandInput, DeleteProvisionedModelThroughputCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteProvisionedModelThroughputCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteProvisionedModelThroughputCommandInput, DeleteProvisionedModelThroughputCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes a Provisioned Throughput. You can't delete a Provisioned Throughput before the commitment term is over. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html">Provisioned Throughput</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteProvisionedModelThroughputCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteProvisionedModelThroughputCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteProvisionedModelThroughputRequest
 *   provisionedModelId: "STRING_VALUE", // required
 * };
 * const command = new DeleteProvisionedModelThroughputCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteProvisionedModelThroughputCommandInput - {@link DeleteProvisionedModelThroughputCommandInput}
 * @returns {@link DeleteProvisionedModelThroughputCommandOutput}
 * @see {@link DeleteProvisionedModelThroughputCommandInput} for command's `input` shape.
 * @see {@link DeleteProvisionedModelThroughputCommandOutput} for command's `response` shape.
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
export declare class DeleteProvisionedModelThroughputCommand extends DeleteProvisionedModelThroughputCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeleteProvisionedModelThroughputRequest;
            output: {};
        };
        sdk: {
            input: DeleteProvisionedModelThroughputCommandInput;
            output: DeleteProvisionedModelThroughputCommandOutput;
        };
    };
}
