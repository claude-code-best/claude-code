import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetProvisionedModelThroughputRequest, GetProvisionedModelThroughputResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetProvisionedModelThroughputCommand}.
 */
export interface GetProvisionedModelThroughputCommandInput extends GetProvisionedModelThroughputRequest {
}
/**
 * @public
 *
 * The output of {@link GetProvisionedModelThroughputCommand}.
 */
export interface GetProvisionedModelThroughputCommandOutput extends GetProvisionedModelThroughputResponse, __MetadataBearer {
}
declare const GetProvisionedModelThroughputCommand_base: {
    new (input: GetProvisionedModelThroughputCommandInput): import("@smithy/smithy-client").CommandImpl<GetProvisionedModelThroughputCommandInput, GetProvisionedModelThroughputCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetProvisionedModelThroughputCommandInput): import("@smithy/smithy-client").CommandImpl<GetProvisionedModelThroughputCommandInput, GetProvisionedModelThroughputCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Returns details for a Provisioned Throughput. For more information, see <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/prov-throughput.html">Provisioned Throughput</a> in the <a href="https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-service.html">Amazon Bedrock User Guide</a>.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetProvisionedModelThroughputCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetProvisionedModelThroughputCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetProvisionedModelThroughputRequest
 *   provisionedModelId: "STRING_VALUE", // required
 * };
 * const command = new GetProvisionedModelThroughputCommand(input);
 * const response = await client.send(command);
 * // { // GetProvisionedModelThroughputResponse
 * //   modelUnits: Number("int"), // required
 * //   desiredModelUnits: Number("int"), // required
 * //   provisionedModelName: "STRING_VALUE", // required
 * //   provisionedModelArn: "STRING_VALUE", // required
 * //   modelArn: "STRING_VALUE", // required
 * //   desiredModelArn: "STRING_VALUE", // required
 * //   foundationModelArn: "STRING_VALUE", // required
 * //   status: "Creating" || "InService" || "Updating" || "Failed", // required
 * //   creationTime: new Date("TIMESTAMP"), // required
 * //   lastModifiedTime: new Date("TIMESTAMP"), // required
 * //   failureMessage: "STRING_VALUE",
 * //   commitmentDuration: "OneMonth" || "SixMonths",
 * //   commitmentExpirationTime: new Date("TIMESTAMP"),
 * // };
 *
 * ```
 *
 * @param GetProvisionedModelThroughputCommandInput - {@link GetProvisionedModelThroughputCommandInput}
 * @returns {@link GetProvisionedModelThroughputCommandOutput}
 * @see {@link GetProvisionedModelThroughputCommandInput} for command's `input` shape.
 * @see {@link GetProvisionedModelThroughputCommandOutput} for command's `response` shape.
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
export declare class GetProvisionedModelThroughputCommand extends GetProvisionedModelThroughputCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetProvisionedModelThroughputRequest;
            output: GetProvisionedModelThroughputResponse;
        };
        sdk: {
            input: GetProvisionedModelThroughputCommandInput;
            output: GetProvisionedModelThroughputCommandOutput;
        };
    };
}
