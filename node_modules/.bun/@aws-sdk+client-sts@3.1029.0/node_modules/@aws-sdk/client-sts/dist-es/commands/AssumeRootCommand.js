import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { AssumeRoot$ } from "../schemas/schemas_0";
export { $Command };
export class AssumeRootCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AWSSecurityTokenServiceV20110615", "AssumeRoot", {})
    .n("STSClient", "AssumeRootCommand")
    .sc(AssumeRoot$)
    .build() {
}
