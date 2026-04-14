import type { HttpHandlerOptions as __HttpHandlerOptions } from "@smithy/types";
import { type AssumeRoleCommandInput, type AssumeRoleCommandOutput } from "./commands/AssumeRoleCommand";
import { type AssumeRoleWithSAMLCommandInput, type AssumeRoleWithSAMLCommandOutput } from "./commands/AssumeRoleWithSAMLCommand";
import { type AssumeRoleWithWebIdentityCommandInput, type AssumeRoleWithWebIdentityCommandOutput } from "./commands/AssumeRoleWithWebIdentityCommand";
import { type AssumeRootCommandInput, type AssumeRootCommandOutput } from "./commands/AssumeRootCommand";
import { type DecodeAuthorizationMessageCommandInput, type DecodeAuthorizationMessageCommandOutput } from "./commands/DecodeAuthorizationMessageCommand";
import { type GetAccessKeyInfoCommandInput, type GetAccessKeyInfoCommandOutput } from "./commands/GetAccessKeyInfoCommand";
import { type GetCallerIdentityCommandInput, type GetCallerIdentityCommandOutput } from "./commands/GetCallerIdentityCommand";
import { type GetDelegatedAccessTokenCommandInput, type GetDelegatedAccessTokenCommandOutput } from "./commands/GetDelegatedAccessTokenCommand";
import { type GetFederationTokenCommandInput, type GetFederationTokenCommandOutput } from "./commands/GetFederationTokenCommand";
import { type GetSessionTokenCommandInput, type GetSessionTokenCommandOutput } from "./commands/GetSessionTokenCommand";
import { type GetWebIdentityTokenCommandInput, type GetWebIdentityTokenCommandOutput } from "./commands/GetWebIdentityTokenCommand";
import { STSClient } from "./STSClient";
export interface STS {
    /**
     * @see {@link AssumeRoleCommand}
     */
    assumeRole(args: AssumeRoleCommandInput, options?: __HttpHandlerOptions): Promise<AssumeRoleCommandOutput>;
    assumeRole(args: AssumeRoleCommandInput, cb: (err: any, data?: AssumeRoleCommandOutput) => void): void;
    assumeRole(args: AssumeRoleCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: AssumeRoleCommandOutput) => void): void;
    /**
     * @see {@link AssumeRoleWithSAMLCommand}
     */
    assumeRoleWithSAML(args: AssumeRoleWithSAMLCommandInput, options?: __HttpHandlerOptions): Promise<AssumeRoleWithSAMLCommandOutput>;
    assumeRoleWithSAML(args: AssumeRoleWithSAMLCommandInput, cb: (err: any, data?: AssumeRoleWithSAMLCommandOutput) => void): void;
    assumeRoleWithSAML(args: AssumeRoleWithSAMLCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: AssumeRoleWithSAMLCommandOutput) => void): void;
    /**
     * @see {@link AssumeRoleWithWebIdentityCommand}
     */
    assumeRoleWithWebIdentity(args: AssumeRoleWithWebIdentityCommandInput, options?: __HttpHandlerOptions): Promise<AssumeRoleWithWebIdentityCommandOutput>;
    assumeRoleWithWebIdentity(args: AssumeRoleWithWebIdentityCommandInput, cb: (err: any, data?: AssumeRoleWithWebIdentityCommandOutput) => void): void;
    assumeRoleWithWebIdentity(args: AssumeRoleWithWebIdentityCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: AssumeRoleWithWebIdentityCommandOutput) => void): void;
    /**
     * @see {@link AssumeRootCommand}
     */
    assumeRoot(args: AssumeRootCommandInput, options?: __HttpHandlerOptions): Promise<AssumeRootCommandOutput>;
    assumeRoot(args: AssumeRootCommandInput, cb: (err: any, data?: AssumeRootCommandOutput) => void): void;
    assumeRoot(args: AssumeRootCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: AssumeRootCommandOutput) => void): void;
    /**
     * @see {@link DecodeAuthorizationMessageCommand}
     */
    decodeAuthorizationMessage(args: DecodeAuthorizationMessageCommandInput, options?: __HttpHandlerOptions): Promise<DecodeAuthorizationMessageCommandOutput>;
    decodeAuthorizationMessage(args: DecodeAuthorizationMessageCommandInput, cb: (err: any, data?: DecodeAuthorizationMessageCommandOutput) => void): void;
    decodeAuthorizationMessage(args: DecodeAuthorizationMessageCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: DecodeAuthorizationMessageCommandOutput) => void): void;
    /**
     * @see {@link GetAccessKeyInfoCommand}
     */
    getAccessKeyInfo(args: GetAccessKeyInfoCommandInput, options?: __HttpHandlerOptions): Promise<GetAccessKeyInfoCommandOutput>;
    getAccessKeyInfo(args: GetAccessKeyInfoCommandInput, cb: (err: any, data?: GetAccessKeyInfoCommandOutput) => void): void;
    getAccessKeyInfo(args: GetAccessKeyInfoCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetAccessKeyInfoCommandOutput) => void): void;
    /**
     * @see {@link GetCallerIdentityCommand}
     */
    getCallerIdentity(): Promise<GetCallerIdentityCommandOutput>;
    getCallerIdentity(args: GetCallerIdentityCommandInput, options?: __HttpHandlerOptions): Promise<GetCallerIdentityCommandOutput>;
    getCallerIdentity(args: GetCallerIdentityCommandInput, cb: (err: any, data?: GetCallerIdentityCommandOutput) => void): void;
    getCallerIdentity(args: GetCallerIdentityCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetCallerIdentityCommandOutput) => void): void;
    /**
     * @see {@link GetDelegatedAccessTokenCommand}
     */
    getDelegatedAccessToken(args: GetDelegatedAccessTokenCommandInput, options?: __HttpHandlerOptions): Promise<GetDelegatedAccessTokenCommandOutput>;
    getDelegatedAccessToken(args: GetDelegatedAccessTokenCommandInput, cb: (err: any, data?: GetDelegatedAccessTokenCommandOutput) => void): void;
    getDelegatedAccessToken(args: GetDelegatedAccessTokenCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetDelegatedAccessTokenCommandOutput) => void): void;
    /**
     * @see {@link GetFederationTokenCommand}
     */
    getFederationToken(args: GetFederationTokenCommandInput, options?: __HttpHandlerOptions): Promise<GetFederationTokenCommandOutput>;
    getFederationToken(args: GetFederationTokenCommandInput, cb: (err: any, data?: GetFederationTokenCommandOutput) => void): void;
    getFederationToken(args: GetFederationTokenCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetFederationTokenCommandOutput) => void): void;
    /**
     * @see {@link GetSessionTokenCommand}
     */
    getSessionToken(): Promise<GetSessionTokenCommandOutput>;
    getSessionToken(args: GetSessionTokenCommandInput, options?: __HttpHandlerOptions): Promise<GetSessionTokenCommandOutput>;
    getSessionToken(args: GetSessionTokenCommandInput, cb: (err: any, data?: GetSessionTokenCommandOutput) => void): void;
    getSessionToken(args: GetSessionTokenCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetSessionTokenCommandOutput) => void): void;
    /**
     * @see {@link GetWebIdentityTokenCommand}
     */
    getWebIdentityToken(args: GetWebIdentityTokenCommandInput, options?: __HttpHandlerOptions): Promise<GetWebIdentityTokenCommandOutput>;
    getWebIdentityToken(args: GetWebIdentityTokenCommandInput, cb: (err: any, data?: GetWebIdentityTokenCommandOutput) => void): void;
    getWebIdentityToken(args: GetWebIdentityTokenCommandInput, options: __HttpHandlerOptions, cb: (err: any, data?: GetWebIdentityTokenCommandOutput) => void): void;
}
/**
 * <fullname>Security Token Service</fullname>
 *          <p>Security Token Service (STS) enables you to request temporary, limited-privilege
 *       credentials for users. This guide provides descriptions of the STS API. For
 *       more information about using this service, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp.html">Temporary Security Credentials</a>.</p>
 * @public
 */
export declare class STS extends STSClient implements STS {
}
