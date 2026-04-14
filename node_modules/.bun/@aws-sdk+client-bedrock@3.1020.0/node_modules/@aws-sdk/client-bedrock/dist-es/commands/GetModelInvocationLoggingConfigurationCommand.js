import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetModelInvocationLoggingConfiguration$ } from "../schemas/schemas_0";
export { $Command };
export class GetModelInvocationLoggingConfigurationCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetModelInvocationLoggingConfiguration", {})
    .n("BedrockClient", "GetModelInvocationLoggingConfigurationCommand")
    .sc(GetModelInvocationLoggingConfiguration$)
    .build() {
}
