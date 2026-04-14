import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { GetDelegatedAccessToken$ } from "../schemas/schemas_0";
export { $Command };
export class GetDelegatedAccessTokenCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AWSSecurityTokenServiceV20110615", "GetDelegatedAccessToken", {})
    .n("STSClient", "GetDelegatedAccessTokenCommand")
    .sc(GetDelegatedAccessToken$)
    .build() {
}
