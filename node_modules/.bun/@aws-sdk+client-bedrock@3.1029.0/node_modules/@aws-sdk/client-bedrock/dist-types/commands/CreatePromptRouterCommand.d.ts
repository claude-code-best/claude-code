import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { CreatePromptRouterRequest, CreatePromptRouterResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link CreatePromptRouterCommand}.
 */
export interface CreatePromptRouterCommandInput extends CreatePromptRouterRequest {
}
/**
 * @public
 *
 * The output of {@link CreatePromptRouterCommand}.
 */
export interface CreatePromptRouterCommandOutput extends CreatePromptRouterResponse, __MetadataBearer {
}
declare const CreatePromptRouterCommand_base: {
    new (input: CreatePromptRouterCommandInput): import("@smithy/smithy-client").CommandImpl<CreatePromptRouterCommandInput, CreatePromptRouterCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: CreatePromptRouterCommandInput): import("@smithy/smithy-client").CommandImpl<CreatePromptRouterCommandInput, CreatePromptRouterCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Creates a prompt router that manages the routing of requests between multiple foundation models based on the routing criteria.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, CreatePromptRouterCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, CreatePromptRouterCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // CreatePromptRouterRequest
 *   clientRequestToken: "STRING_VALUE",
 *   promptRouterName: "STRING_VALUE", // required
 *   models: [ // PromptRouterTargetModels // required
 *     { // PromptRouterTargetModel
 *       modelArn: "STRING_VALUE", // required
 *     },
 *   ],
 *   description: "STRING_VALUE",
 *   routingCriteria: { // RoutingCriteria
 *     responseQualityDifference: Number("double"), // required
 *   },
 *   fallbackModel: {
 *     modelArn: "STRING_VALUE", // required
 *   },
 *   tags: [ // TagList
 *     { // Tag
 *       key: "STRING_VALUE", // required
 *       value: "STRING_VALUE", // required
 *     },
 *   ],
 * };
 * const command = new CreatePromptRouterCommand(input);
 * const response = await client.send(command);
 * // { // CreatePromptRouterResponse
 * //   promptRouterArn: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param CreatePromptRouterCommandInput - {@link CreatePromptRouterCommandInput}
 * @returns {@link CreatePromptRouterCommandOutput}
 * @see {@link CreatePromptRouterCommandInput} for command's `input` shape.
 * @see {@link CreatePromptRouterCommandOutput} for command's `response` shape.
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
 * @public
 */
export declare class CreatePromptRouterCommand extends CreatePromptRouterCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: CreatePromptRouterRequest;
            output: CreatePromptRouterResponse;
        };
        sdk: {
            input: CreatePromptRouterCommandInput;
            output: CreatePromptRouterCommandOutput;
        };
    };
}
