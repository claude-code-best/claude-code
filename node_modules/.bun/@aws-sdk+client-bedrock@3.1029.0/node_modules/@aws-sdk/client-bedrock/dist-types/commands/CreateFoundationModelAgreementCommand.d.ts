import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { CreateFoundationModelAgreementRequest, CreateFoundationModelAgreementResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link CreateFoundationModelAgreementCommand}.
 */
export interface CreateFoundationModelAgreementCommandInput extends CreateFoundationModelAgreementRequest {
}
/**
 * @public
 *
 * The output of {@link CreateFoundationModelAgreementCommand}.
 */
export interface CreateFoundationModelAgreementCommandOutput extends CreateFoundationModelAgreementResponse, __MetadataBearer {
}
declare const CreateFoundationModelAgreementCommand_base: {
    new (input: CreateFoundationModelAgreementCommandInput): import("@smithy/smithy-client").CommandImpl<CreateFoundationModelAgreementCommandInput, CreateFoundationModelAgreementCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: CreateFoundationModelAgreementCommandInput): import("@smithy/smithy-client").CommandImpl<CreateFoundationModelAgreementCommandInput, CreateFoundationModelAgreementCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Request a model access agreement for the specified model.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, CreateFoundationModelAgreementCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, CreateFoundationModelAgreementCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // CreateFoundationModelAgreementRequest
 *   offerToken: "STRING_VALUE", // required
 *   modelId: "STRING_VALUE", // required
 * };
 * const command = new CreateFoundationModelAgreementCommand(input);
 * const response = await client.send(command);
 * // { // CreateFoundationModelAgreementResponse
 * //   modelId: "STRING_VALUE", // required
 * // };
 *
 * ```
 *
 * @param CreateFoundationModelAgreementCommandInput - {@link CreateFoundationModelAgreementCommandInput}
 * @returns {@link CreateFoundationModelAgreementCommandOutput}
 * @see {@link CreateFoundationModelAgreementCommandInput} for command's `input` shape.
 * @see {@link CreateFoundationModelAgreementCommandOutput} for command's `response` shape.
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
export declare class CreateFoundationModelAgreementCommand extends CreateFoundationModelAgreementCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: CreateFoundationModelAgreementRequest;
            output: CreateFoundationModelAgreementResponse;
        };
        sdk: {
            input: CreateFoundationModelAgreementCommandInput;
            output: CreateFoundationModelAgreementCommandOutput;
        };
    };
}
