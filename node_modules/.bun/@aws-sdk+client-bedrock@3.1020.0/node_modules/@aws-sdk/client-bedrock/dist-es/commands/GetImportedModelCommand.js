import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetImportedModel$ } from "../schemas/schemas_0";
export { $Command };
export class GetImportedModelCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetImportedModel", {})
    .n("BedrockClient", "GetImportedModelCommand")
    .sc(GetImportedModel$)
    .build() {
}
