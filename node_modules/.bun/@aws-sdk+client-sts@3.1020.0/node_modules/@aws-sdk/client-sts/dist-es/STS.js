import { createAggregatedClient } from "@smithy/smithy-client";
import { AssumeRoleCommand, } from "./commands/AssumeRoleCommand";
import { AssumeRoleWithSAMLCommand, } from "./commands/AssumeRoleWithSAMLCommand";
import { AssumeRoleWithWebIdentityCommand, } from "./commands/AssumeRoleWithWebIdentityCommand";
import { AssumeRootCommand, } from "./commands/AssumeRootCommand";
import { DecodeAuthorizationMessageCommand, } from "./commands/DecodeAuthorizationMessageCommand";
import { GetAccessKeyInfoCommand, } from "./commands/GetAccessKeyInfoCommand";
import { GetCallerIdentityCommand, } from "./commands/GetCallerIdentityCommand";
import { GetDelegatedAccessTokenCommand, } from "./commands/GetDelegatedAccessTokenCommand";
import { GetFederationTokenCommand, } from "./commands/GetFederationTokenCommand";
import { GetSessionTokenCommand, } from "./commands/GetSessionTokenCommand";
import { GetWebIdentityTokenCommand, } from "./commands/GetWebIdentityTokenCommand";
import { STSClient } from "./STSClient";
const commands = {
    AssumeRoleCommand,
    AssumeRoleWithSAMLCommand,
    AssumeRoleWithWebIdentityCommand,
    AssumeRootCommand,
    DecodeAuthorizationMessageCommand,
    GetAccessKeyInfoCommand,
    GetCallerIdentityCommand,
    GetDelegatedAccessTokenCommand,
    GetFederationTokenCommand,
    GetSessionTokenCommand,
    GetWebIdentityTokenCommand,
};
export class STS extends STSClient {
}
createAggregatedClient(commands, STS);
