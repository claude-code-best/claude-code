import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { CreateAutomatedReasoningPolicyVersionRequest, CreateAutomatedReasoningPolicyVersionResponse } from "../models/models_0";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link CreateAutomatedReasoningPolicyVersionCommand}.
 */
export interface CreateAutomatedReasoningPolicyVersionCommandInput extends CreateAutomatedReasoningPolicyVersionRequest {
}
/**
 * @public
 *
 * The output of {@link CreateAutomatedReasoningPolicyVersionCommand}.
 */
export interface CreateAutomatedReasoningPolicyVersionCommandOutput extends CreateAutomatedReasoningPolicyVersionResponse, __MetadataBearer {
}
declare const CreateAutomatedReasoningPolicyVersionCommand_base: {
    new (input: CreateAutomatedReasoningPolicyVersionCommandInput): import("@smithy/smithy-client").CommandImpl<CreateAutomatedReasoningPolicyVersionCommandInput, CreateAutomatedReasoningPolicyVersionCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: CreateAutomatedReasoningPolicyVersionCommandInput): import("@smithy/smithy-client").CommandImpl<CreateAutomatedReasoningPolicyVersionCommandInput, CreateAutomatedReasoningPolicyVersionCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Creates a new version of an existing Automated Reasoning policy. This allows you to iterate on your policy rules while maintaining previous versions for rollback or comparison purposes.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, CreateAutomatedReasoningPolicyVersionCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, CreateAutomatedReasoningPolicyVersionCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // CreateAutomatedReasoningPolicyVersionRequest
 *   policyArn: "STRING_VALUE", // required
 *   clientRequestToken: "STRING_VALUE",
 *   lastUpdatedDefinitionHash: "STRING_VALUE", // required
 *   tags: [ // TagList
 *     { // Tag
 *       key: "STRING_VALUE", // required
 *       value: "STRING_VALUE", // required
 *     },
 *   ],
 * };
 * const command = new CreateAutomatedReasoningPolicyVersionCommand(input);
 * const response = await client.send(command);
 * // { // CreateAutomatedReasoningPolicyVersionResponse
 * //   policyArn: "STRING_VALUE", // required
 * //   version: "STRING_VALUE", // required
 * //   name: "STRING_VALUE", // required
 * //   description: "STRING_VALUE",
 * //   definitionHash: "STRING_VALUE", // required
 * //   createdAt: new Date("TIMESTAMP"), // required
 * // };
 *
 * ```
 *
 * @param CreateAutomatedReasoningPolicyVersionCommandInput - {@link CreateAutomatedReasoningPolicyVersionCommandInput}
 * @returns {@link CreateAutomatedReasoningPolicyVersionCommandOutput}
 * @see {@link CreateAutomatedReasoningPolicyVersionCommandInput} for command's `input` shape.
 * @see {@link CreateAutomatedReasoningPolicyVersionCommandOutput} for command's `response` shape.
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
export declare class CreateAutomatedReasoningPolicyVersionCommand extends CreateAutomatedReasoningPolicyVersionCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: CreateAutomatedReasoningPolicyVersionRequest;
            output: CreateAutomatedReasoningPolicyVersionResponse;
        };
        sdk: {
            input: CreateAutomatedReasoningPolicyVersionCommandInput;
            output: CreateAutomatedReasoningPolicyVersionCommandOutput;
        };
    };
}
