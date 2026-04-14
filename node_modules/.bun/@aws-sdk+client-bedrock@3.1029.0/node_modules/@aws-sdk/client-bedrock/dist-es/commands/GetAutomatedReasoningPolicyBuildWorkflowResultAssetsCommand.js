import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetAutomatedReasoningPolicyBuildWorkflowResultAssets$ } from "../schemas/schemas_0";
export { $Command };
export class GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetAutomatedReasoningPolicyBuildWorkflowResultAssets", {})
    .n("BedrockClient", "GetAutomatedReasoningPolicyBuildWorkflowResultAssetsCommand")
    .sc(GetAutomatedReasoningPolicyBuildWorkflowResultAssets$)
    .build() {
}
