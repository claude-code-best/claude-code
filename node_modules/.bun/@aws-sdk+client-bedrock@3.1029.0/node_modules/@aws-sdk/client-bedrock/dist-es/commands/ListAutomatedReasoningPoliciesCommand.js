import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListAutomatedReasoningPolicies$ } from "../schemas/schemas_0";
export { $Command };
export class ListAutomatedReasoningPoliciesCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListAutomatedReasoningPolicies", {})
    .n("BedrockClient", "ListAutomatedReasoningPoliciesCommand")
    .sc(ListAutomatedReasoningPolicies$)
    .build() {
}
