import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListPromptRouters$ } from "../schemas/schemas_0";
export { $Command };
export class ListPromptRoutersCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListPromptRouters", {})
    .n("BedrockClient", "ListPromptRoutersCommand")
    .sc(ListPromptRouters$)
    .build() {
}
