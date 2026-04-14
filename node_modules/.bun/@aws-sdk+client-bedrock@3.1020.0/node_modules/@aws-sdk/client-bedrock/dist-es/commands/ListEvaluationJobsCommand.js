import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListEvaluationJobs$ } from "../schemas/schemas_0";
export { $Command };
export class ListEvaluationJobsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListEvaluationJobs", {})
    .n("BedrockClient", "ListEvaluationJobsCommand")
    .sc(ListEvaluationJobs$)
    .build() {
}
