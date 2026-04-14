import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { UpdateCustomModelDeployment$ } from "../schemas/schemas_0";
export { $Command };
export class UpdateCustomModelDeploymentCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateCustomModelDeployment", {})
    .n("BedrockClient", "UpdateCustomModelDeploymentCommand")
    .sc(UpdateCustomModelDeployment$)
    .build() {
}
