import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListFoundationModelsRequest, ListFoundationModelsResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListFoundationModelsCommand}.
 */
export interface ListFoundationModelsCommandInput extends ListFoundationModelsRequest {
}
/**
 * @public
 *
 * The output of {@link ListFoundationModelsCommand}.
 */
export interface ListFoundationModelsCommandOutput extends ListFoundationModelsResponse, __MetadataBearer {
}
declare const ListFoundationModelsCommand_base: {
    new (input: ListFoundationModelsCommandInput): import("@smithy/smithy-client").CommandImpl<ListFoundationModelsCommandInput, ListFoundationModelsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (...[input]: [] | [ListFoundationModelsCommandInput]): import("@smithy/smithy-client").CommandImpl<ListFoundationModelsCommandInput, ListFoundationModelsCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Lists Amazon Bedrock foundation models that you can use. You can filter the results with the request parameters. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/foundation-models.html">Foundation models</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListFoundationModelsCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListFoundationModelsCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListFoundationModelsRequest
 *   byProvider: "STRING_VALUE",
 *   byCustomizationType: "FINE_TUNING" || "CONTINUED_PRE_TRAINING" || "DISTILLATION",
 *   byOutputModality: "TEXT" || "IMAGE" || "EMBEDDING",
 *   byInferenceType: "ON_DEMAND" || "PROVISIONED",
 * };
 * const command = new ListFoundationModelsCommand(input);
 * const response = await client.send(command);
 * // { // ListFoundationModelsResponse
 * //   modelSummaries: [ // FoundationModelSummaryList
 * //     { // FoundationModelSummary
 * //       modelArn: "STRING_VALUE", // required
 * //       modelId: "STRING_VALUE", // required
 * //       modelName: "STRING_VALUE",
 * //       providerName: "STRING_VALUE",
 * //       inputModalities: [ // ModelModalityList
 * //         "TEXT" || "IMAGE" || "EMBEDDING",
 * //       ],
 * //       outputModalities: [
 * //         "TEXT" || "IMAGE" || "EMBEDDING",
 * //       ],
 * //       responseStreamingSupported: true || false,
 * //       customizationsSupported: [ // ModelCustomizationList
 * //         "FINE_TUNING" || "CONTINUED_PRE_TRAINING" || "DISTILLATION",
 * //       ],
 * //       inferenceTypesSupported: [ // InferenceTypeList
 * //         "ON_DEMAND" || "PROVISIONED",
 * //       ],
 * //       modelLifecycle: { // FoundationModelLifecycle
 * //         status: "ACTIVE" || "LEGACY", // required
 * //         startOfLifeTime: new Date("TIMESTAMP"),
 * //         endOfLifeTime: new Date("TIMESTAMP"),
 * //         legacyTime: new Date("TIMESTAMP"),
 * //         publicExtendedAccessTime: new Date("TIMESTAMP"),
 * //       },
 * //     },
 * //   ],
 * // };
 *
 * ```
 *
 * @param ListFoundationModelsCommandInput - {@link ListFoundationModelsCommandInput}
 * @returns {@link ListFoundationModelsCommandOutput}
 * @see {@link ListFoundationModelsCommandInput} for command's `input` shape.
 * @see {@link ListFoundationModelsCommandOutput} for command's `response` shape.
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
export declare class ListFoundationModelsCommand extends ListFoundationModelsCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListFoundationModelsRequest;
            output: ListFoundationModelsResponse;
        };
        sdk: {
            input: ListFoundationModelsCommandInput;
            output: ListFoundationModelsCommandOutput;
        };
    };
}
