import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetFoundationModel$ } from "../schemas/schemas_0";
export { $Command };
export class GetFoundationModelCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetFoundationModel", {})
    .n("BedrockClient", "GetFoundationModelCommand")
    .sc(GetFoundationModel$)
    .build() {
}
