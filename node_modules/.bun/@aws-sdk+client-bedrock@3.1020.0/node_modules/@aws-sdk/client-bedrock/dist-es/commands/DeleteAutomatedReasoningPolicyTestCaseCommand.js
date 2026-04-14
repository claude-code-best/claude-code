import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { DeleteAutomatedReasoningPolicyTestCase$ } from "../schemas/schemas_0";
export { $Command };
export class DeleteAutomatedReasoningPolicyTestCaseCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "DeleteAutomatedReasoningPolicyTestCase", {})
    .n("BedrockClient", "DeleteAutomatedReasoningPolicyTestCaseCommand")
    .sc(DeleteAutomatedReasoningPolicyTestCase$)
    .build() {
}
