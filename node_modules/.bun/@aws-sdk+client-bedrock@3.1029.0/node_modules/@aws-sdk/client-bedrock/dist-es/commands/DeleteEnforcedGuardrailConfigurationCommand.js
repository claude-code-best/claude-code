import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { DeleteEnforcedGuardrailConfiguration$ } from "../schemas/schemas_0";
export { $Command };
export class DeleteEnforcedGuardrailConfigurationCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteEnforcedGuardrailConfiguration", {})
    .n("BedrockClient", "DeleteEnforcedGuardrailConfigurationCommand")
    .sc(DeleteEnforcedGuardrailConfiguration$)
    .build() {
}
