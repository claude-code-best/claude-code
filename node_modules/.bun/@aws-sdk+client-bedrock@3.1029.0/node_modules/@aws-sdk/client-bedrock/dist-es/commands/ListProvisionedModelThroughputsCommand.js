import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListProvisionedModelThroughputs$ } from "../schemas/schemas_0";
export { $Command };
export class ListProvisionedModelThroughputsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListProvisionedModelThroughputs", {})
    .n("BedrockClient", "ListProvisionedModelThroughputsCommand")
    .sc(ListProvisionedModelThroughputs$)
    .build() {
}
