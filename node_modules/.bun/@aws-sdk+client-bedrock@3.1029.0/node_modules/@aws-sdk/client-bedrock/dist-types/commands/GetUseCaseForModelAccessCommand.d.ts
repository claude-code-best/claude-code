import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetUseCaseForModelAccessRequest, GetUseCaseForModelAccessResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetUseCaseForModelAccessCommand}.
 */
export interface GetUseCaseForModelAccessCommandInput extends GetUseCaseForModelAccessRequest {
}
/**
 * @public
 *
 * The output of {@link GetUseCaseForModelAccessCommand}.
 */
export interface GetUseCaseForModelAccessCommandOutput extends GetUseCaseForModelAccessResponse, __MetadataBearer {
}
declare const GetUseCaseForModelAccessCommand_base: {
    new (input: GetUseCaseForModelAccessCommandInput): import("@smithy/smithy-client").CommandImpl<GetUseCaseForModelAccessCommandInput, GetUseCaseForModelAccessCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [GetUseCaseForModelAccessCommandInput]): import("@smithy/smithy-client").CommandImpl<GetUseCaseForModelAccessCommandInput, GetUseCaseForModelAccessCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Get usecase for model access.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetUseCaseForModelAccessCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetUseCaseForModelAccessCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = {};
 * const command = new GetUseCaseForModelAccessCommand(input);
 * const response = await client.send(command);
 * // { // GetUseCaseForModelAccessResponse
 * //   formData: new Uint8Array(), // required
 * // };
 *
 * ```
 *
 * @param GetUseCaseForModelAccessCommandInput - {@link GetUseCaseForModelAccessCommandInput}
 * @returns {@link GetUseCaseForModelAccessCommandOutput}
 * @see {@link GetUseCaseForModelAccessCommandInput} for command's `input` shape.
 * @see {@link GetUseCaseForModelAccessCommandOutput} for command's `response` shape.
 * @see {@link BedrockClientResolvedConfig | config} for BedrockClient's `config` shape.
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
export declare class GetUseCaseForModelAccessCommand extends GetUseCaseForModelAccessCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: {};
            output: GetUseCaseForModelAccessResponse;
        };
        sdk: {
            input: GetUseCaseForModelAccessCommandInput;
            output: GetUseCaseForModelAccessCommandOutput;
        };
    };
}
