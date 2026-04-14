import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetAutomatedReasoningPolicyBuildWorkflow$ } from "../schemas/schemas_0";
export { $Command };
export class GetAutomatedReasoningPolicyBuildWorkflowCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyBuildWorkflow", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyBuildWorkflowCommand")
    .sc(GetAutomatedReasoningPolicyBuildWorkflow$)
    .build() {
}
