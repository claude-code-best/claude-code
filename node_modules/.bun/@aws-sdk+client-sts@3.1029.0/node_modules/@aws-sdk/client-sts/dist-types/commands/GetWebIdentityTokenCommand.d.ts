import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { GetWebIdentityTokenRequest, GetWebIdentityTokenResponse } from "../models/models_0";
import type { ServiceInputTypes, ServiceOutputTypes, STSClientResolvedConfig } from "../STSClient";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetWebIdentityTokenCommand}.
 */
export interface GetWebIdentityTokenCommandInput extends GetWebIdentityTokenRequest {
}
/**
 * @public
 *
 * The output of {@link GetWebIdentityTokenCommand}.
 */
export interface GetWebIdentityTokenCommandOutput extends GetWebIdentityTokenResponse, __MetadataBearer {
}
declare const GetWebIdentityTokenCommand_base: {
    new (input: GetWebIdentityTokenCommandInput): import("@smithy/smithy-client").CommandImpl<GetWebIdentityTokenCommandInput, GetWebIdentityTokenCommandOutput, STSClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetWebIdentityTokenCommandInput): import("@smithy/smithy-client").CommandImpl<GetWebIdentityTokenCommandInput, GetWebIdentityTokenCommandOutput, STSClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Returns a signed JSON Web Token (JWT) that represents the calling Amazon Web Services identity.
 *          The returned JWT can be used to authenticate with external services that support OIDC discovery.
 *          The token is signed by Amazon Web Services STS and can be publicly verified using the verification keys published at the issuer's JWKS endpoint.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { STSClient, GetWebIdentityTokenCommand } from "@aws-sdk/client-sts"; // ES Modules import
 * // const { STSClient, GetWebIdentityTokenCommand } = require("@aws-sdk/client-sts"); // CommonJS import
 * // import type { STSClientConfig } from "@aws-sdk/client-sts";
 * const config = {}; // type is STSClientConfig
 * const client = new STSClient(config);
 * const input = { // GetWebIdentityTokenRequest
 *   Audience: [ // webIdentityTokenAudienceListType // required
 *     "STRING_VALUE",
 *   ],
 *   DurationSeconds: Number("int"),
 *   SigningAlgorithm: "STRING_VALUE", // required
 *   Tags: [ // tagListType
 *     { // Tag
 *       Key: "STRING_VALUE", // required
 *       Value: "STRING_VALUE", // required
 *     },
 *   ],
 * };
 * const command = new GetWebIdentityTokenCommand(input);
 * const response = await client.send(command);
 * // { // GetWebIdentityTokenResponse
 * //   WebIdentityToken: "STRING_VALUE",
 * //   Expiration: new Date("TIMESTAMP"),
 * // };
 *
 * ```
 *
 * @param GetWebIdentityTokenCommandInput - {@link GetWebIdentityTokenCommandInput}
 * @returns {@link GetWebIdentityTokenCommandOutput}
 * @see {@link GetWebIdentityTokenCommandInput} for command's `input` shape.
 * @see {@link GetWebIdentityTokenCommandOutput} for command's `response` shape.
 * @see {@link STSClientResolvedConfig | config} for STSClient's `config` shape.
 *
 * @throws {@link JWTPayloadSizeExceededException} (client fault)
 *  <p>The requested token payload size exceeds the maximum allowed size. Reduce the number of request tags included in the <code>GetWebIdentityToken</code> API call to reduce the token payload size.</p>
 *
 * @throws {@link OutboundWebIdentityFederationDisabledException} (client fault)
 *  <p>The outbound web identity federation feature is not enabled for this account. To use
 *             this feature, you must first enable it through the Amazon Web Services Management Console or API.</p>
 *
 * @throws {@link SessionDurationEscalationException} (client fault)
 *  <p>The requested token duration would extend the session beyond its original expiration time.
 *             You cannot use this operation to extend the lifetime of a session beyond what was granted when the session was originally created.</p>
 *
 * @throws {@link STSServiceException}
 * <p>Base exception class for all service exceptions from STS service.</p>
 *
 *
 * @public
 */
export declare class GetWebIdentityTokenCommand extends GetWebIdentityTokenCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetWebIdentityTokenRequest;
            output: GetWebIdentityTokenResponse;
        };
        sdk: {
            input: GetWebIdentityTokenCommandInput;
            output: GetWebIdentityTokenCommandOutput;
        };
    };
}
