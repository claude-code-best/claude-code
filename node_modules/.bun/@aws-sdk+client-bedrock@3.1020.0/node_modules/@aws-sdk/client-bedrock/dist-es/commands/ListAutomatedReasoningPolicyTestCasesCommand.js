import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListAutomatedReasoningPolicyTestCases$ } from "../schemas/schemas_0";
export { $Command };
export class ListAutomatedReasoningPolicyTestCasesCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListAutomatedReasoningPolicyTestCases", {})
    .n("BedrockClient", "ListAutomatedReasoningPolicyTestCasesCommand")
    .sc(ListAutomatedReasoningPolicyTestCases$)
    .build() {
}
