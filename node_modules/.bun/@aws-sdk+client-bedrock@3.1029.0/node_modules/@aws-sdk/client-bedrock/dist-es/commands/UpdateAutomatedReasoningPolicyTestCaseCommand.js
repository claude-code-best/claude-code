import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { UpdateAutomatedReasoningPolicyTestCase$ } from "../schemas/schemas_0";
export { $Command };
export class UpdateAutomatedReasoningPolicyTestCaseCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "UpdateAutomatedReasoningPolicyTestCase", {})
    .n("BedrockClient", "UpdateAutomatedReasoningPolicyTestCaseCommand")
    .sc(UpdateAutomatedReasoningPolicyTestCase$)
    .build() {
}
