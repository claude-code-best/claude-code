import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetProvisionedModelThroughput$ } from "../schemas/schemas_0";
export { $Command };
export class GetProvisionedModelThroughputCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetProvisionedModelThroughput", {})
    .n("BedrockClient", "GetProvisionedModelThroughputCommand")
    .sc(GetProvisionedModelThroughput$)
    .build() {
}
