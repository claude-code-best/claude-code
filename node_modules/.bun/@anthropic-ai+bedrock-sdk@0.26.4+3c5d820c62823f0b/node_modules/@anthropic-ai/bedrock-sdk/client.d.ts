import { BaseAnthropic, ClientOptions as CoreClientOptions } from '@anthropic-ai/sdk/client';
import * as Resources from '@anthropic-ai/sdk/resources/index';
import { AwsCredentialIdentityProvider } from '@smithy/types';
import { FinalRequestOptions } from "./internal/request-options.js";
import { FinalizedRequestInit } from "./internal/types.js";
export { BaseAnthropic } from '@anthropic-ai/sdk/client';
export type ClientOptions = Omit<CoreClientOptions, 'apiKey' | 'authToken'> & {
    awsSecretKey?: string | null | undefined;
    awsAccessKey?: string | null | undefined;
    /**
     * Defaults to process.env['AWS_REGION'].
     */
    awsRegion?: string | undefined;
    awsSessionToken?: string | null | undefined;
    skipAuth?: boolean;
    /** Custom provider chain resolver for AWS credentials. Useful for non-Node environments, like edge workers, where the default credential provider chain may not work. */
    providerChainResolver?: (() => Promise<AwsCredentialIdentityProvider>) | null;
};
type BothStaticCreds = {
    awsAccessKey: string;
    awsSecretKey: string;
    awsSessionToken?: string | null | undefined;
};
type NoStaticCreds = {
    awsAccessKey?: null | undefined;
    awsSecretKey?: null | undefined;
    awsSessionToken?: null | undefined;
};
type AccessOnly = {
    awsAccessKey: string;
    awsSecretKey?: null | undefined;
    awsSessionToken?: string | null | undefined;
};
type SecretOnly = {
    awsSecretKey: string;
    awsAccessKey?: null | undefined;
    awsSessionToken?: string | null | undefined;
};
/** API Client for interfacing with the Anthropic Bedrock API. */
export declare class AnthropicBedrock extends BaseAnthropic {
    awsSecretKey: string | null;
    awsAccessKey: string | null;
    awsRegion: string;
    awsSessionToken: string | null;
    skipAuth: boolean;
    providerChainResolver: (() => Promise<AwsCredentialIdentityProvider>) | null;
    constructor(opts: ClientOptions & BothStaticCreds);
    constructor(opts?: ClientOptions & NoStaticCreds);
    /**
     * @deprecated Passing only `awsAccessKey` without `awsSecretKey` is deprecated.
     * Provide both keys, or provide neither and rely on the AWS credential provider chain.
     */
    constructor(opts: ClientOptions & AccessOnly);
    /**
     * @deprecated Passing only `awsSecretKey` without `awsAccessKey` is deprecated.
     * Provide both keys, or provide neither and rely on the AWS credential provider chain.
     */
    constructor(opts: ClientOptions & SecretOnly);
    messages: MessagesResource;
    completions: Resources.Completions;
    beta: BetaResource;
    protected validateHeaders(): void;
    protected prepareRequest(request: FinalizedRequestInit, { url, options }: {
        url: string;
        options: FinalRequestOptions;
    }): Promise<void>;
    buildRequest(options: FinalRequestOptions): Promise<{
        req: FinalizedRequestInit;
        url: string;
        timeout: number;
    }>;
}
/**
 * The Bedrock API does not currently support token counting or the Batch API.
 */
type MessagesResource = Omit<Resources.Messages, 'batches' | 'countTokens'>;
/**
 * The Bedrock API does not currently support prompt caching, token counting or the Batch API.
 */
type BetaResource = Omit<Resources.Beta, 'promptCaching' | 'messages'> & {
    messages: Omit<Resources.Beta['messages'], 'batches' | 'countTokens'>;
};
//# sourceMappingURL=client.d.ts.map