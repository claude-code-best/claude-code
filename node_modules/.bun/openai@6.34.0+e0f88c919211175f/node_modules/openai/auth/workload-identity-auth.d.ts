import type { WorkloadIdentity } from "./types.js";
import type { Fetch } from "../internal/builtin-types.js";
export declare class WorkloadIdentityAuth {
    private cachedToken;
    private refreshPromise;
    private readonly config;
    private readonly tokenExchangeUrl;
    private readonly fetch;
    constructor(config: WorkloadIdentity, fetch?: Fetch);
    getToken(): Promise<string>;
    private refreshToken;
    private isTokenExpired;
    private needsRefresh;
    invalidateToken(): void;
}
//# sourceMappingURL=workload-identity-auth.d.ts.map