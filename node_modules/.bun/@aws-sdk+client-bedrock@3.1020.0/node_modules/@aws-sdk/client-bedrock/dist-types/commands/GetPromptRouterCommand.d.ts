import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetPromptRouterRequest, GetPromptRouterResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetPromptRouterCommand}.
 */
export interface GetPromptRouterCommandInput extends GetPromptRouterRequest {
}
/**
 * @public
 *
 * The output of {@link GetPromptRouterCommand}.
 */
export interface GetPromptRouterCommandOutput extends GetPromptRouterResponse, __MetadataBearer {
}
declare const GetPromptRouterCommand_base: {
    new (input: GetPromptRouterCommandInput): import("@smithy/smithy-client").CommandImpl<GetPromptRouterCommandInput, GetPromptRouterCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetPromptRouterCommandInput): import("@smithy/smithy-client").CommandImpl<GetPromptRouterCommandInput, GetPromptRouterCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Retrieves details about a prompt router.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetPromptRouterCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetPromptRouterCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetPromptRouterRequest
 *   promptRouterArn: "STRING_VALUE", // required
 * };
 * const command = new GetPromptRouterCommand(input);
 * const response = await client.send(command);
 * // { // GetPromptRouterResponse
 * //   promptRouterName: "STRING_VALUE", // required
 * //   routingCriteria: { // RoutingCriteria
 * //     responseQualityDifference: Number("double"), // required
 * //   },
 * //   description: "STRING_VALUE",
 * //   createdAt: new Date("TIMESTAMP"),
 * //   updatedAt: new Date("TIMESTAMP"),
 * //   promptRouterArn: "STRING_VALUE", // required
 * //   models: [ // PromptRouterTargetModels // required
 * //     { // PromptRouterTargetModel
 * //       modelArn: "STRING_VALUE", // required
 * //     },
 * //   ],
 * //   fallbackModel: {
 * //     modelArn: "STRING_VALUE", // required
 * //   },
 * //   status: "AVAILABLE", // required
 * //   type: "custom" || "default", // required
 * // };
 *
 * ```
 *
 * @param GetPromptRouterCommandInput - {@link GetPromptRouterCommandInput}
 * @returns {@link GetPromptRouterCommandOutput}
 * @see {@link GetPromptRouterCommandInput} for command's `input` shape.
 * @see {@link GetPromptRouterCommandOutput} for command's `response` shape.
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
export declare class GetPromptRouterCommand extends GetPromptRouterCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetPromptRouterRequest;
            output: GetPromptRouterResponse;
        };
        sdk: {
            input: GetPromptRouterCommandInput;
            output: GetPromptRouterCommandOutput;
        };
    };
}
