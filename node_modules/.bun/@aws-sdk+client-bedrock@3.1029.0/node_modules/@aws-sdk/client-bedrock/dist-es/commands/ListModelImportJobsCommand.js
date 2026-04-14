import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { ListModelImportJobs$ } from "../schemas/schemas_0";
export { $Command };
export class ListModelImportJobsCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "ListModelImportJobs", {})
    .n("BedrockClient", "ListModelImportJobsCommand")
    .sc(ListModelImportJobs$)
    .build() {
}
