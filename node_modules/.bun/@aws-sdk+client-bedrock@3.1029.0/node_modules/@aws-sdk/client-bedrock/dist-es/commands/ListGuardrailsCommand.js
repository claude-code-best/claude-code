import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListGuardrails$ } from "../schemas/schemas_0";
export { $Command };
export class ListGuardrailsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListGuardrails", {})
    .n("BedrockClient", "ListGuardrailsCommand")
    .sc(ListGuardrails$)
    .build() {
}
