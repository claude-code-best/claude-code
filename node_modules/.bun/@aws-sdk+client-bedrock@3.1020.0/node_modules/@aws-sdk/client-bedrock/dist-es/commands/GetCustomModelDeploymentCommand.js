import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetCustomModelDeployment$ } from "../schemas/schemas_0";
export { $Command };
export class GetCustomModelDeploymentCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetCustomModelDeployment", {})
    .n("BedrockClient", "GetCustomModelDeploymentCommand")
    .sc(GetCustomModelDeployment$)
    .build() {
}
