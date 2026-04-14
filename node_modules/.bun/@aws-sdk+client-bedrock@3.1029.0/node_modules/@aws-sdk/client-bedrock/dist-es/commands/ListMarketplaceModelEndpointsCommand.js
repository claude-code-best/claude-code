import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListMarketplaceModelEndpoints$ } from "../schemas/schemas_0";
export { $Command };
export class ListMarketplaceModelEndpointsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListMarketplaceModelEndpoints", {})
    .n("BedrockClient", "ListMarketplaceModelEndpointsCommand")
    .sc(ListMarketplaceModelEndpoints$)
    .build() {
}
