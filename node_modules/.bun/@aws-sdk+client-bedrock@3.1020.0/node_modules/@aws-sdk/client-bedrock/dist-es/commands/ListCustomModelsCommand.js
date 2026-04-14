import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListCustomModels$ } from "../schemas/schemas_0";
export { $Command };
export class ListCustomModelsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListCustomModels", {})
    .n("BedrockClient", "ListCustomModelsCommand")
    .sc(ListCustomModels$)
    .build() {
}
