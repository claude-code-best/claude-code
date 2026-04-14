import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { PutModelInvocationLoggingConfiguration$ } from "../schemas/schemas_0";
export { $Command };
export class PutModelInvocationLoggingConfigurationCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "PutModelInvocationLoggingConfiguration", {})
    .n("BedrockClient", "PutModelInvocationLoggingConfigurationCommand")
    .sc(PutModelInvocationLoggingConfiguration$)
    .build() {
}
