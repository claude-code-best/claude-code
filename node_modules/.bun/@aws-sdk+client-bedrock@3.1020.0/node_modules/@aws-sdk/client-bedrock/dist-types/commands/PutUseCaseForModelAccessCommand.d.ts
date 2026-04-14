import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { PutUseCaseForModelAccessRequest, PutUseCaseForModelAccessResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link PutUseCaseForModelAccessCommand}.
 */
export interface PutUseCaseForModelAccessCommandInput extends PutUseCaseForModelAccessRequest {
}
/**
 * @public
 *
 * The output of {@link PutUseCaseForModelAccessCommand}.
 */
export interface PutUseCaseForModelAccessCommandOutput extends PutUseCaseForModelAccessResponse, __MetadataBearer {
}
declare const PutUseCaseForModelAccessCommand_base: {
    new (input: PutUseCaseForModelAccessCommandInput): import("@smithy/smithy-client").CommandImpl<PutUseCaseForModelAccessCommandInput, PutUseCaseForModelAccessCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: PutUseCaseForModelAccessCommandInput): import("@smithy/smithy-client").CommandImpl<PutUseCaseForModelAccessCommandInput, PutUseCaseForModelAccessCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Put usecase for model access.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, PutUseCaseForModelAccessCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, PutUseCaseForModelAccessCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // PutUseCaseForModelAccessRequest
 *   formData: new Uint8Array(), // e.g. Buffer.from("") or new TextEncoder().encode("")   // required
 * };
 * const command = new PutUseCaseForModelAccessCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param PutUseCaseForModelAccessCommandInput - {@link PutUseCaseForModelAccessCommandInput}
 * @returns {@link PutUseCaseForModelAccessCommandOutput}
 * @see {@link PutUseCaseForModelAccessCommandInput} for command's `input` shape.
 * @see {@link PutUseCaseForModelAccessCommandOutput} for command's `response` shape.
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
export declare class PutUseCaseForModelAccessCommand extends PutUseCaseForModelAccessCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: PutUseCaseForModelAccessRequest;
            output: {};
        };
        sdk: {
            input: PutUseCaseForModelAccessCommandInput;
            output: PutUseCaseForModelAccessCommandOutput;
        };
    };
}
