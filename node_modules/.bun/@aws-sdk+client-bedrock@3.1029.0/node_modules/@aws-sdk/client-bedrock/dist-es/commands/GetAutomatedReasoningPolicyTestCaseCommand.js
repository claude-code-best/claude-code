import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetAutomatedReasoningPolicyTestCase$ } from "../schemas/schemas_0";
export { $Command };
export class GetAutomatedReasoningPolicyTestCaseCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyTestCase", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyTestCaseCommand")
    .sc(GetAutomatedReasoningPolicyTestCase$)
    .build() {
}
