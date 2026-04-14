import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListFoundationModels$ } from "../schemas/schemas_0";
export { $Command };
export class ListFoundationModelsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListFoundationModels", {})
    .n("BedrockClient", "ListFoundationModelsCommand")
    .sc(ListFoundationModels$)
    .build() {
}
