import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes } from "../BedrockClient";
import type { ListFoundationModelAgreementOffersRequest, ListFoundationModelAgreementOffersResponse } from "../models/models_1";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link ListFoundationModelAgreementOffersCommand}.
 */
export interface ListFoundationModelAgreementOffersCommandInput extends ListFoundationModelAgreementOffersRequest {
}
/**
 * @public
 *
 * The output of {@link ListFoundationModelAgreementOffersCommand}.
 */
export interface ListFoundationModelAgreementOffersCommandOutput extends ListFoundationModelAgreementOffersResponse, __MetadataBearer {
}
declare const ListFoundationModelAgreementOffersCommand_base: {
    new (input: ListFoundationModelAgreementOffersCommandInput): import("@smithy/smithy-client").CommandImpl<ListFoundationModelAgreementOffersCommandInput, ListFoundationModelAgreementOffersCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: ListFoundationModelAgreementOffersCommandInput): import("@smithy/smithy-client").CommandImpl<ListFoundationModelAgreementOffersCommandInput, ListFoundationModelAgreementOffersCommandOutput, BedrockClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Get the offers associated with the specified model.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { BedrockClient, ListFoundationModelAgreementOffersCommand } from "@aws-sdk/client-bedrock"; // ES Modules import
 * // const { BedrockClient, ListFoundationModelAgreementOffersCommand } = require("@aws-sdk/client-bedrock"); // CommonJS import
 * // import type { BedrockClientConfig } from "@aws-sdk/client-bedrock";
 * const config = {}; // type is BedrockClientConfig
 * const client = new BedrockClient(config);
 * const input = { // ListFoundationModelAgreementOffersRequest
 *   modelId: "STRING_VALUE", // required
 *   offerType: "ALL" || "PUBLIC",
 * };
 * const command = new ListFoundationModelAgreementOffersCommand(input);
 * const response = await client.send(command);
 * // { // ListFoundationModelAgreementOffersResponse
 * //   modelId: "STRING_VALUE", // required
 * //   offers: [ // Offers // required
 * //     { // Offer
 * //       offerId: "STRING_VALUE",
 * //       offerToken: "STRING_VALUE", // required
 * //       termDetails: { // TermDetails
 * //         usageBasedPricingTerm: { // PricingTerm
 * //           rateCard: [ // RateCard // required
 * //             { // DimensionalPriceRate
 * //               dimension: "STRING_VALUE",
 * //               price: "STRING_VALUE",
 * //               description: "STRING_VALUE",
 * //               unit: "STRING_VALUE",
 * //             },
 * //           ],
 * //         },
 * //         legalTerm: { // LegalTerm
 * //           url: "STRING_VALUE",
 * //         },
 * //         supportTerm: { // SupportTerm
 * //           refundPolicyDescription: "STRING_VALUE",
 * //         },
 * //         validityTerm: { // ValidityTerm
 * //           agreementDuration: "STRING_VALUE",
 * //         },
 * //       },
 * //     },
 * //   ],
 * // };
 *
 * ```
 *
 * @param ListFoundationModelAgreementOffersCommandInput - {@link ListFoundationModelAgreementOffersCommandInput}
 * @returns {@link ListFoundationModelAgreementOffersCommandOutput}
 * @see {@link ListFoundationModelAgreementOffersCommandInput} for command's `input` shape.
 * @see {@link ListFoundationModelAgreementOffersCommandOutput} for command's `response` shape.
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
export declare class ListFoundationModelAgreementOffersCommand extends ListFoundationModelAgreementOffersCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: ListFoundationModelAgreementOffersRequest;
            output: ListFoundationModelAgreementOffersResponse;
        };
        sdk: {
            input: ListFoundationModelAgreementOffersCommandInput;
            output: ListFoundationModelAgreementOffersCommandOutput;
        };
    };
}
