import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { CancelAutomatedReasoningPolicyBuildWorkflow$ } from "../schemas/schemas_0";
export { $Command };
export class CancelAutomatedReasoningPolicyBuildWorkflowCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CancelAutomatedReasoningPolicyBuildWorkflow", {})
    .n("BedrockClient", "CancelAutomatedReasoningPolicyBuildWorkflowCommand")
    .sc(CancelAutomatedReasoningPolicyBuildWorkflow$)
    .build() {
}
