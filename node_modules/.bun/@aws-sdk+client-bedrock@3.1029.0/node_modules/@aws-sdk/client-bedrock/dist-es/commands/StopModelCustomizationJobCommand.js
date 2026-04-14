import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { StopModelCustomizationJob$ } from "../schemas/schemas_0";
export { $Command };
export class StopModelCustomizationJobCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "StopModelCustomizationJob", {})
    .n("BedrockClient", "StopModelCustomizationJobCommand")
    .sc(StopModelCustomizationJob$)
    .build() {
}
