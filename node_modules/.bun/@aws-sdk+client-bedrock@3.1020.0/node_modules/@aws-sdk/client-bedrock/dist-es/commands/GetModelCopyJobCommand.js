import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetModelCopyJob$ } from "../schemas/schemas_0";
export { $Command };
export class GetModelCopyJobCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetModelCopyJob", {})
    .n("BedrockClient", "GetModelCopyJobCommand")
    .sc(GetModelCopyJob$)
    .build() {
}
