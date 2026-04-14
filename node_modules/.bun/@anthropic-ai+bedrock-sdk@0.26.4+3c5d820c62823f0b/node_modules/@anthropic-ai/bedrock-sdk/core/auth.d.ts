import { AwsCredentialIdentityProvider } from '@smithy/types';
import { MergedRequestInit } from "../internal/types.js";
type AuthProps = {
    url: string;
    regionName: string;
    awsAccessKey: string | null | undefined;
    awsSecretKey: string | null | undefined;
    awsSessionToken: string | null | undefined;
    fetchOptions?: MergedRequestInit | undefined;
    providerChainResolver?: (() => Promise<AwsCredentialIdentityProvider>) | null;
};
export declare const getAuthHeaders: (req: RequestInit, props: AuthProps) => Promise<Record<string, string>>;
export {};
//# sourceMappingURL=auth.d.ts.map