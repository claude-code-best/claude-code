import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListAutomatedReasoningPolicyBuildWorkflows$ } from "../schemas/schemas_0";
export { $Command };
export class ListAutomatedReasoningPolicyBuildWorkflowsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListAutomatedReasoningPolicyBuildWorkflows", {})
    .n("BedrockClient", "ListAutomatedReasoningPolicyBuildWorkflowsCommand")
    .sc(ListAutomatedReasoningPolicyBuildWorkflows$)
    .build() {
}
