import { getEndpointPlugin } from "@smithy/middleware-endpoint";
import { Command as $Command } from "@smithy/smithy-client";
import { commonParams } from "../endpoint/EndpointParameters";
import { CreateFoundationModelAgreement$ } from "../schemas/schemas_0";
export { $Command };
export class CreateFoundationModelAgreementCommand extends $Command
    .classBuilder()
    .ep(commonParams)
    .m(function (Command, cs, config, o) {
    return [getEndpointPlugin(config, Command.getEndpointParameterInstructions())];
})
    .s("AmazonBedrockControlPlaneService", "CreateFoundationModelAgreement", {})
    .n("BedrockClient", "CreateFoundationModelAgreementCommand")
    .sc(CreateFoundationModelAgreement$)
    .build() {
}
