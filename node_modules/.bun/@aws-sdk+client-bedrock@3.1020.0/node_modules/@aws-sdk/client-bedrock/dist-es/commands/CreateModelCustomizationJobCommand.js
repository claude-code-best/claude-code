import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { CreateModelCustomizationJob$ } from "../schemas/schemas_0";
export { $Command };
export class CreateModelCustomizationJobCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateModelCustomizationJob", {})
    .n("BedrockClient", "CreateModelCustomizationJobCommand")
    .sc(CreateModelCustomizationJob$)
    .build() {
}
