import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetPromptRouter$ } from "../schemas/schemas_0";
export { $Command };
export class GetPromptRouterCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetPromptRouter", {})
    .n("BedrockClient", "GetPromptRouterCommand")
    .sc(GetPromptRouter$)
    .build() {
}
