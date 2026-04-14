import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetAutomatedReasoningPolicyNextScenario$ } from "../schemas/schemas_0";
export { $Command };
export class GetAutomatedReasoningPolicyNextScenarioCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyNextScenario", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyNextScenarioCommand")
    .sc(GetAutomatedReasoningPolicyNextScenario$)
    .build() {
}
