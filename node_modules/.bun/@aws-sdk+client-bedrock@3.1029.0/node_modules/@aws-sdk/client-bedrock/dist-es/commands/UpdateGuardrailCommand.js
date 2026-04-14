import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { UpdateGuardrail$ } from "../schemas/schemas_0";
export { $Command };
export class UpdateGuardrailCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateGuardrail", {})
    .n("BedrockClient", "UpdateGuardrailCommand")
    .sc(UpdateGuardrail$)
    .build() {
}
