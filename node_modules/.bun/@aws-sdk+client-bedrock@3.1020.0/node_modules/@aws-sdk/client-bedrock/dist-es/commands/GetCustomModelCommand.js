import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetCustomModel$ } from "../schemas/schemas_0";
export { $Command };
export class GetCustomModelCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetCustomModel", {})
    .n("BedrockClient", "GetCustomModelCommand")
    .sc(GetCustomModel$)
    .build() {
}
