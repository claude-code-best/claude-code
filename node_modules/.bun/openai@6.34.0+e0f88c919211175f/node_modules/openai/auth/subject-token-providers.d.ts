import type { SubjectTokenProvider } from "./types.js";
import type { Fetch } from "../internal/builtin-types.js";
type ReadFile = (path: string) => Promise<string>;
export declare function k8sServiceAccountTokenProvider(tokenPath?: string, config?: {
    readFile?: ReadFile;
}): SubjectTokenProvider;
export declare function azureManagedIdentityTokenProvider(resource?: string, config?: {
    objectId?: string;
    clientId?: string;
    msiResId?: string;
    apiVersion?: string;
    timeout?: number;
    fetch?: Fetch;
}): SubjectTokenProvider;
export declare function gcpIDTokenProvider(audience?: string, config?: {
    timeout?: number;
    fetch?: Fetch;
}): SubjectTokenProvider;
export {};
//# sourceMappingURL=subject-token-providers.d.ts.map