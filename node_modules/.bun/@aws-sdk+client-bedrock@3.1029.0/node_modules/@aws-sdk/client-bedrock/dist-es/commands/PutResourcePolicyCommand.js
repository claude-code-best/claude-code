import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { PutResourcePolicy$ } from "../schemas/schemas_0";
export { $Command };
export class PutResourcePolicyCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "PutResourcePolicy", {})
    .n("BedrockClient", "PutResourcePolicyCommand")
    .sc(PutResourcePolicy$)
    .build() {
}
