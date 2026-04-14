import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { GetImportedModelRequest, GetImportedModelResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetImportedModelCommand}.
 */
export interface GetImportedModelCommandInput extends GetImportedModelRequest {
}
/**
 * @public
 *
 * The output of {@link GetImportedModelCommand}.
 */
export interface GetImportedModelCommandOutput extends GetImportedModelResponse, __MetadataBearer {
}
declare const GetImportedModelCommand_base: {
    new (input: GetImportedModelCommandInput): import("@smithy/smithy-client").CommandImpl<GetImportedModelCommandInput, GetImportedModelCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetImportedModelCommandInput): import("@smithy/smithy-client").CommandImpl<GetImportedModelCommandInput, GetImportedModelCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Gets properties associated with a customized model you imported. </p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, GetImportedModelCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, GetImportedModelCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // GetImportedModelRequest
 *   modelIdentifier: "STRING_VALUE", // required
 * };
 * const command = new GetImportedModelCommand(input);
 * const response = await client.send(command);
 * // { // GetImportedModelResponse
 * //   modelArn: "STRING_VALUE",
 * //   modelName: "STRING_VALUE",
 * //   jobName: "STRING_VALUE",
 * //   jobArn: "STRING_VALUE",
 * //   modelDataSource: { // ModelDataSource Union: only one key present
 * //     s3DataSource: { // S3DataSource
 * //       s3Uri: "STRING_VALUE", // required
 * //     },
 * //   },
 * //   creationTime: new Date("TIMESTAMP"),
 * //   modelArchitecture: "STRING_VALUE",
 * //   modelKmsKeyArn: "STRING_VALUE",
 * //   instructSupported: true || false,
 * //   customModelUnits: { // CustomModelUnits
 * //     customModelUnitsPerModelCopy: Number("int"),
 * //     customModelUnitsVersion: "STRING_VALUE",
 * //   },
 * // };
 *
 * ```
 *
 * @param GetImportedModelCommandInput - {@link GetImportedModelCommandInput}
 * @returns {@link GetImportedModelCommandOutput}
 * @see {@link GetImportedModelCommandInput} for command's `input` shape.
 * @see {@link GetImportedModelCommandOutput} for command's `response` shape.
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
export declare class GetImportedModelCommand extends GetImportedModelCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetImportedModelRequest;
            output: GetImportedModelResponse;
        };
        sdk: {
            input: GetImportedModelCommandInput;
            output: GetImportedModelCommandOutput;
        };
    };
}
