import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeletePromptRouterRequest, DeletePromptRouterResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeletePromptRouterCommand}.
 */
export interface DeletePromptRouterCommandInput extends DeletePromptRouterRequest {
}
/**
 * @public
 *
 * The output of {@link DeletePromptRouterCommand}.
 */
export interface DeletePromptRouterCommandOutput extends DeletePromptRouterResponse, __MetadataBearer {
}
declare const DeletePromptRouterCommand_base: {
    new (input: DeletePromptRouterCommandInput): import("@smithy/smithy-client").CommandImpl<DeletePromptRouterCommandInput, DeletePromptRouterCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: DeletePromptRouterCommandInput): import("@smithy/smithy-client").CommandImpl<DeletePromptRouterCommandInput, DeletePromptRouterCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Deletes a specified prompt router. This action cannot be undone.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeletePromptRouterCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeletePromptRouterCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // DeletePromptRouterRequest
 *   promptRouterArn: "STRING_VALUE", // required
 * };
 * const command = new DeletePromptRouterCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeletePromptRouterCommandInput - {@link DeletePromptRouterCommandInput}
 * @returns {@link DeletePromptRouterCommandOutput}
 * @see {@link DeletePromptRouterCommandInput} for command's `input` shape.
 * @see {@link DeletePromptRouterCommandOutput} for command's `response` shape.
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
export declare class DeletePromptRouterCommand extends DeletePromptRouterCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: DeletePromptRouterRequest;
            output: {};
        };
        sdk: {
            input: DeletePromptRouterCommandInput;
            output: DeletePromptRouterCommandOutput;
        };
    };
}
