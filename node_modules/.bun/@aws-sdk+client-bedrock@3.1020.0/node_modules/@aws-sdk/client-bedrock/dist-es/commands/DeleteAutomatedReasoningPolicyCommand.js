import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { DeleteAutomatedReasoningPolicy$ } from "../schemas/schemas_0";
export { $Command };
export class DeleteAutomatedReasoningPolicyCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteAutomatedReasoningPolicy", {})
    .n("BedrockClient", "DeleteAutomatedReasoningPolicyCommand")
    .sc(DeleteAutomatedReasoningPolicy$)
    .build() {
}
