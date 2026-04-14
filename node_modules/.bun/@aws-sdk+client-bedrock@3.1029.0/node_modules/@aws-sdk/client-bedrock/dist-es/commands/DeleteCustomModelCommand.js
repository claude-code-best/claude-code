import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { DeleteCustomModel$ } from "../schemas/schemas_0";
export { $Command };
export class DeleteCustomModelCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteCustomModel", {})
    .n("BedrockClient", "DeleteCustomModelCommand")
    .sc(DeleteCustomModel$)
    .build() {
}
