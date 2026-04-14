import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListEnforcedGuardrailsConfiguration$ } from "../schemas/schemas_0";
export { $Command };
export class ListEnforcedGuardrailsConfigurationCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListEnforcedGuardrailsConfiguration", {})
    .n("BedrockClient", "ListEnforcedGuardrailsConfigurationCommand")
    .sc(ListEnforcedGuardrailsConfiguration$)
    .build() {
}
