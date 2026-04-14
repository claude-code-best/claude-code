import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { DeleteResourcePolicy$ } from "../schemas/schemas_0";
export { $Command };
export class DeleteResourcePolicyCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteResourcePolicy", {})
    .n("BedrockClient", "DeleteResourcePolicyCommand")
    .sc(DeleteResourcePolicy$)
    .build() {
}
