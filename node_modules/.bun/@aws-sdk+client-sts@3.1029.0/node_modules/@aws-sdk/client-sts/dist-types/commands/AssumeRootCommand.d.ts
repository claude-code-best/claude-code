import { Command as $Command } from "@smithy/smithy-client";
import type { MetadataBearer as __MetadataBearer } from "@smithy/types";
import type { AssumeRootRequest, AssumeRootResponse } from "../models/models_0";
import type { ServiceInputTypes, ServiceOutputTypes, STSClientResolvedConfig } from "../STSClient";
/**
 * @public
 */
export type { __MetadataBearer };
export { $Command };
/**
 * @public
 *
 * The input for {@link AssumeRootCommand}.
 */
export interface AssumeRootCommandInput extends AssumeRootRequest {
}
/**
 * @public
 *
 * The output of {@link AssumeRootCommand}.
 */
export interface AssumeRootCommandOutput extends AssumeRootResponse, __MetadataBearer {
}
declare const AssumeRootCommand_base: {
    new (input: AssumeRootCommandInput): import("@smithy/smithy-client").CommandImpl<AssumeRootCommandInput, AssumeRootCommandOutput, STSClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    new (input: AssumeRootCommandInput): import("@smithy/smithy-client").CommandImpl<AssumeRootCommandInput, AssumeRootCommandOutput, STSClientResolvedConfig, ServiceInputTypes, ServiceOutputTypes>;
    getEndpointParameterInstructions(): import("@smithy/middleware-endpoint").EndpointParameterInstructions;
};
/**
 * <p>Returns a set of short term credentials you can use to perform privileged tasks on a
 *          member account in your organization. You must use credentials from an Organizations management
 *          account or a delegated administrator account for IAM to call <code>AssumeRoot</code>. You
 *          cannot use root user credentials to make this call.</p>
 *          <p>Before you can launch a privileged session, you must have centralized root access in
 *          your organization. For steps to enable this feature, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-enable-root-access.html">Centralize root access for
 *             member accounts</a> in the <i>IAM User Guide</i>.</p>
 *          <note>
 *             <p>The STS global endpoint is not supported for AssumeRoot. You must send this request
 *             to a Regional STS endpoint. For more information, see <a href="https://docs.aws.amazon.com/STS/latest/APIReference/welcome.html#sts-endpoints">Endpoints</a>.</p>
 *          </note>
 *          <p>You can track AssumeRoot in CloudTrail logs to determine what actions were performed in a
 *          session. For more information, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/cloudtrail-track-privileged-tasks.html">Track privileged tasks
 *             in CloudTrail</a> in the <i>IAM User Guide</i>.</p>
 *          <p>When granting access to privileged tasks you should only grant the necessary permissions
 *          required to perform that task. For more information, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html">Security best practices in
 *          IAM</a>. In addition, you can use <a href="https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps.html">service control
 *             policies</a> (SCPs) to manage and limit permissions in your organization. See <a href="https://docs.aws.amazon.com/organizations/latest/userguide/orgs_manage_policies_scps_examples_general.html">General examples</a> in the <i>Organizations User
 *             Guide</i> for more information on SCPs.</p>
 * @example
 * Use a bare-bones client and the command you need to make an API call.
 * ```javascript
 * import { STSClient, AssumeRootCommand } from "@aws-sdk/client-sts"; // ES Modules import
 * // const { STSClient, AssumeRootCommand } = require("@aws-sdk/client-sts"); // CommonJS import
 * // import type { STSClientConfig } from "@aws-sdk/client-sts";
 * const config = {}; // type is STSClientConfig
 * const client = new STSClient(config);
 * const input = { // AssumeRootRequest
 *   TargetPrincipal: "STRING_VALUE", // required
 *   TaskPolicyArn: { // PolicyDescriptorType
 *     arn: "STRING_VALUE",
 *   },
 *   DurationSeconds: Number("int"),
 * };
 * const command = new AssumeRootCommand(input);
 * const response = await client.send(command);
 * // { // AssumeRootResponse
 * //   Credentials: { // Credentials
 * //     AccessKeyId: "STRING_VALUE", // required
 * //     SecretAccessKey: "STRING_VALUE", // required
 * //     SessionToken: "STRING_VALUE", // required
 * //     Expiration: new Date("TIMESTAMP"), // required
 * //   },
 * //   SourceIdentity: "STRING_VALUE",
 * // };
 *
 * ```
 *
 * @param AssumeRootCommandInput - {@link AssumeRootCommandInput}
 * @returns {@link AssumeRootCommandOutput}
 * @see {@link AssumeRootCommandInput} for command's `input` shape.
 * @see {@link AssumeRootCommandOutput} for command's `response` shape.
 * @see {@link STSClientResolvedConfig | config} for STSClient's `config` shape.
 *
 * @throws {@link ExpiredTokenException} (client fault)
 *  <p>The web identity token that was passed is expired or is not valid. Get a new identity
 *             token from the identity provider and then retry the request.</p>
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
 * @example To launch a privileged session
 * ```javascript
 * // The following command retrieves a set of short-term credentials you can use to unlock an S3 bucket for a member account by removing the bucket policy.
 * const input = {
 *   DurationSeconds: 900,
 *   TargetPrincipal: "111122223333",
 *   TaskPolicyArn: {
 *     arn: "arn:aws:iam::aws:policy/root-task/S3UnlockBucketPolicy"
 *   }
 * };
 * const command = new AssumeRootCommand(input);
 * const response = await client.send(command);
 * /* response is
 * {
 *   Credentials: {
 *     AccessKeyId: "ASIAJEXAMPLEXEG2JICEA",
 *     Expiration: "2024-11-15T00:05:07Z",
 *     SecretAccessKey: "9drTJvcXLB89EXAMPLELB8923FB892xMFI",
 *     SessionToken: "AQoXdzELDDY//////////wEaoAK1wvxJY12r2IrDFT2IvAzTCn3zHoZ7YNtpiQLF0MqZye/qwjzP2iEXAMPLEbw/m3hsj8VBTkPORGvr9jM5sgP+w9IZWZnU+LWhmg+a5fDi2oTGUYcdg9uexQ4mtCHIHfi4citgqZTgco40Yqr4lIlo4V2b2Dyauk0eYFNebHtYlFVgAUj+7Indz3LU0aTWk1WKIjHmmMCIoTkyYp/k7kUG7moeEYKSitwQIi6Gjn+nyzM+PtoA3685ixzv0R7i5rjQi0YE0lf1oeie3bDiNHncmzosRM6SFiPzSvp6h/32xQuZsjcypmwsPSDtTPYcs0+YN/8BRi2/IcrxSpnWEXAMPLEXSDFTAQAM6Dl9zR0tXoybnlrZIwMLlMi1Kcgo5OytwU="
 *   },
 *   SourceIdentity: "Alice"
 * }
 * *\/
 * ```
 *
 * @public
 */
export declare class AssumeRootCommand extends AssumeRootCommand_base {
    /** @internal type navigation helper, not in runtime. */
    protected static __types: {
        api: {
            input: AssumeRootRequest;
            output: AssumeRootResponse;
        };
        sdk: {
            input: AssumeRootCommandInput;
            output: AssumeRootCommandOutput;
        };
    };
}
