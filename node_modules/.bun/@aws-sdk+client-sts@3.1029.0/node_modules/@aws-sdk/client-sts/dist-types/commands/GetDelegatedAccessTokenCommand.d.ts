import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { GetDelegatedAccessTokenRequest, GetDelegatedAccessTokenResponse } from "../models/models_0";
import type { ServiceInputTypes, ServiceOutputTypes, STSClientResolvedConfig } from "../STSClient";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link GetDelegatedAccessTokenCommand}.
 */
export interface GetDelegatedAccessTokenCommandInput extends GetDelegatedAccessTokenRequest {
}
/**
 * @public
 *
 * The output of {@link GetDelegatedAccessTokenCommand}.
 */
export interface GetDelegatedAccessTokenCommandOutput extends GetDelegatedAccessTokenResponse, __MetadataBearer {
}
declare const GetDelegatedAccessTokenCommand_base: {
    new (input: GetDelegatedAccessTokenCommandInput): import("@smithy/smithy-client").CommandImpl<GetDelegatedAccessTokenCommandInput, GetDelegatedAccessTokenCommandOutput, STSClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: GetDelegatedAccessTokenCommandInput): import("@smithy/smithy-client").CommandImpl<GetDelegatedAccessTokenCommandInput, GetDelegatedAccessTokenCommandOutput, STSClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Exchanges a trade-in token for temporary Amazon Web Services credentials with the permissions
 *          associated with the assumed principal. This operation allows you to obtain credentials for
 *          a specific principal based on a trade-in token, enabling delegation of access to Amazon Web Services
 *          resources.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { STSClient, GetDelegatedAccessTokenCommand } from "@aws-sdk/client-sts"; // ES Modules import
 * // const { STSClient, GetDelegatedAccessTokenCommand } = require("@aws-sdk/client-sts"); // CommonJS import
 * // import type { STSClientConfig } from "@aws-sdk/client-sts";
 * const config = {}; // type is STSClientConfig
 * const client = new STSClient(config);
 * const input = { // GetDelegatedAccessTokenRequest
 *   TradeInToken: "STRING_VALUE", // required
 * };
 * const command = new GetDelegatedAccessTokenCommand(input);
 * const response = await client.send(command);
 * // { // GetDelegatedAccessTokenResponse
 * //   Credentials: { // Credentials
 * //     AccessKeyId: "STRING_VALUE", // required
 * //     SecretAccessKey: "STRING_VALUE", // required
 * //     SessionToken: "STRING_VALUE", // required
 * //     Expiration: new Date("TIMESTAMP"), // required
 * //   },
 * //   PackedPolicySize: Number("int"),
 * //   AssumedPrincipal: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param GetDelegatedAccessTokenCommandInput - {@link GetDelegatedAccessTokenCommandInput}
 * @returns {@link GetDelegatedAccessTokenCommandOutput}
 * @see {@link GetDelegatedAccessTokenCommandInput} for command's `input` shape.
 * @see {@link GetDelegatedAccessTokenCommandOutput} for command's `response` shape.
 * @see {@link STSClientResolvedConfig | config} for STSClient's `config` shape.
 *
 * @throws {@link ExpiredTradeInTokenException} (client fault)
 *  <p>The trade-in token provided in the request has expired and can no longer be exchanged
 *             for credentials. Request a new token and retry the operation.</p>
 *
 * @throws {@link PackedPolicyTooLargeException} (client fault)
 *  <p>The request was rejected because the total packed size of the session policies and
 *             session tags combined was too large. An Amazon Web Services conversion compresses the session policy
 *             document, session policy ARNs, and session tags into a packed binary format that has a
 *             separate limit. The error message indicates by percentage how close the policies and
 *             tags are to the upper size limit. For more information, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_session-tags.html">Passing Session Tags in STS</a> in
 *             the <i>IAM User Guide</i>.</p>
 *          <p>You could receive this error even though you meet other defined session policy and
 *             session tag limits. For more information, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html#reference_iam-limits-entity-length">IAM and STS Entity Character Limits</a> in the <i>IAM User
 *                 Guide</i>.</p>
 *
 * @throws {@link RegionDisabledException} (client fault)
 *  <p>STS is not activated in the requested region for the account that is being asked to
 *             generate credentials. The account administrator must use the IAM console to activate
 *             STS in that region. For more information, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_enable-regions.html#sts-regions-activate-deactivate">Activating and Deactivating STS in an Amazon Web Services Region</a> in the <i>IAM
 *                 User Guide</i>.</p>
 *
 * @throws {@link STSServiceException}
 * <p>Base exception class for all service exceptions from STS service.</p>
 *
 *
 * @public
 */
export declare class GetDelegatedAccessTokenCommand extends GetDelegatedAccessTokenCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: GetDelegatedAccessTokenRequest;
            output: GetDelegatedAccessTokenResponse;
        };
        sdk: {
            input: GetDelegatedAccessTokenCommandInput;
            output: GetDelegatedAccessTokenCommandOutput;
        };
    };
}
