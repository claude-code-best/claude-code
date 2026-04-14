import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListModelInvocationJobs$ } from "../schemas/schemas_0";
export { $Command };
export class ListModelInvocationJobsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListModelInvocationJobs", {})
    .n("BedrockClient", "ListModelInvocationJobsCommand")
    .sc(ListModelInvocationJobs$)
    .build() {
}
