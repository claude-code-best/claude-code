import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetEvaluationJob$ } from "../schemas/schemas_0";
export { $Command };
export class GetEvaluationJobCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "GetEvaluationJob", {})
    .n("BedrockClient", "GetEvaluationJobCommand")
    .sc(GetEvaluationJob$)
    .build() {
}
