import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListFoundationModelAgreementOffers$ } from "../schemas/schemas_0";
export { $Command };
export class ListFoundationModelAgreementOffersCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListFoundationModelAgreementOffers", {})
    .n("BedrockClient", "ListFoundationModelAgreementOffersCommand")
    .sc(ListFoundationModelAgreementOffers$)
    .build() {
}
