import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { CreateCustomModelDeployment$ } from "../schemas/schemas_0";
export { $Command };
export class CreateCustomModelDeploymentCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateCustomModelDeployment", {})
    .n("BedrockClient", "CreateCustomModelDeploymentCommand")
    .sc(CreateCustomModelDeployment$)
    .build() {
}
