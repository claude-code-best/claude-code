import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { DeleteModelInvocationLoggingConfigurationRequest, DeleteModelInvocationLoggingConfigurationResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link DeleteModelInvocationLoggingConfigurationCommand}.
 */
export interface DeleteModelInvocationLoggingConfigurationCommandInput extends DeleteModelInvocationLoggingConfigurationRequest {
}
/**
 * @public
 *
 * The output of {@link DeleteModelInvocationLoggingConfigurationCommand}.
 */
export interface DeleteModelInvocationLoggingConfigurationCommandOutput extends DeleteModelInvocationLoggingConfigurationResponse, __MetadataBearer {
}
declare const DeleteModelInvocationLoggingConfigurationCommand_base: {
    new (input: DeleteModelInvocationLoggingConfigurationCommandInput): import("@smithy/smithy-client").CommandImpl<DeleteModelInvocationLoggingConfigurationCommandInput, DeleteModelInvocationLoggingConfigurationCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [DeleteModelInvocationLoggingConfigurationCommandInput]): import("@smithy/smithy-client").CommandImpl<DeleteModelInvocationLoggingConfigurationCommandInput, DeleteModelInvocationLoggingConfigurationCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Delete the invocation logging. </p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, DeleteModelInvocationLoggingConfigurationCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, DeleteModelInvocationLoggingConfigurationCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = {};
 * const command = new DeleteModelInvocationLoggingConfigurationCommand(input);
 * const response = await client.send(command);
 * // {};
 *
 * ```
 *
 * @param DeleteModelInvocationLoggingConfigurationCommandInput - {@link DeleteModelInvocationLoggingConfigurationCommandInput}
 * @returns {@link DeleteModelInvocationLoggingConfigurationCommandOutput}
 * @see {@link DeleteModelInvocationLoggingConfigurationCommandInput} for command's `input` shape.
 * @see {@link DeleteModelInvocationLoggingConfigurationCommandOutput} for command's `response` shape.
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
 * @throws {@link BedrockServiceException}
 * <p>Base exception class for all service exceptions from Bedrock service.</p>
 *
 *
 * @public
 */
export declare class DeleteModelInvocationLoggingConfigurationCommand extends DeleteModelInvocationLoggingConfigurationCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: {};
            output: {};
        };
        sdk: {
            input: DeleteModelInvocationLoggingConfigurationCommandInput;
            output: DeleteModelInvocationLoggingConfigurationCommandOutput;
        };
    };
}
