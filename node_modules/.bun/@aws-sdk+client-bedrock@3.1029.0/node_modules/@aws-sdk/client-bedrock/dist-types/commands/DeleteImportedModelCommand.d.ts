import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteImportedModelRequest, DeleteImportedModelResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteImportedModelCommand}.
 */
export interface DeleteImportedModelCommandInput extends DeleteImportedModelRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteImportedModelCommand}.
 */
export interface DeleteImportedModelCommandOutput extends DeleteImportedModelResponse, __MetadataBearer {
}
declare const DeleteImportedModelCommand_base: {
    new (input: DeleteImportedModelCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteImportedModelCommandInput, DeleteImportedModelCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeleteImportedModelCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteImportedModelCommandInput, DeleteImportedModelCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes a custom model that you imported earlier. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/model-customization-import-model.html">Import a customized model</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>. </p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteImportedModelCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteImportedModelCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeleteImportedModelRequest
 *   modelIdentifier: "STRING_VALUE", // required
 * };
 * const command = new DeleteImportedModelCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteImportedModelCommandInput - {@link DeleteImportedModelCommandInput}
 * @returns {@link DeleteImportedModelCommandOutput}
 * @see {@link DeleteImportedModelCommandInput} for command's `input` shape.
 * @see {@link DeleteImportedModelCommandOutput} for command's `response` shape.
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
export declare class DeleteImportedModelCommand extends DeleteImportedModelCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeleteImportedModelRequest;
            output: {};
        };
        sdk: {
            input: DeleteImportedModelCommandInput;
            output: DeleteImportedModelCommandOutput;
        };
    };
}
