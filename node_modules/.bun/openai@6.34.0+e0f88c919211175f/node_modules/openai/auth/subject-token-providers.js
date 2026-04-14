"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.k8sServiceAccountTokenProvider = k8sServiceAccountTokenProvider;
exports.azureManagedIdentityTokenProvider = azureManagedIdentityTokenProvider;
exports.gcpIDTokenProvider = gcpIDTokenProvider;
const tslib_1 = require("../internal/tslib.js");
const Shims = tslib_1.__importStar(require("../internal/shims.js"));
const error_1 = require("../core/error.js");
const DEFAULT_RESOURCE = 'https://management.azure.com/';
const DEFAULT_AZURE_API_VERSION = '2018-02-01';
const AZURE_IMDS_BASE_URL = 'http://169.254.169.254/metadata/identity/oauth2/token';
let fsPromisesModule;
async function defaultReadFile(path) {
    fsPromisesModule ?? (fsPromisesModule = Promise.resolve().then(() => tslib_1.__importStar(require('fs/promises'))).catch((error) => {
        fsPromisesModule = undefined;
        throw error;
    }));
    const { readFile } = await fsPromisesModule;
    return readFile(path, 'utf8');
}
function k8sServiceAccountTokenProvider(tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token', config) {
    const readFile = config?.readFile ?? defaultReadFile;
    return {
        tokenType: 'jwt',
        getToken: async () => {
            let rawToken;
            try {
                rawToken = await readFile(tokenPath);
            }
            catch (error) {
                if (error instanceof error_1.SubjectTokenProviderError) {
                    throw error;
                }
                throw new error_1.SubjectTokenProviderError(`Failed to read Kubernetes service account token from ${tokenPath}: ${error instanceof Error ? error.message : String(error)}`, 'kubernetes', error instanceof Error ? error : undefined);
            }
            const token = rawToken.trim();
            if (token.length === 0) {
                throw new error_1.SubjectTokenProviderError(`The token file at ${tokenPath} is empty.`, 'kubernetes');
            }
            return token;
        },
    };
}
function azureManagedIdentityTokenProvider(resource = DEFAULT_RESOURCE, config) {
    const apiVersion = config?.apiVersion ?? DEFAULT_AZURE_API_VERSION;
    const timeout = config?.timeout ?? 10000;
    return {
        tokenType: 'jwt',
        getToken: async () => {
            const url = new URL(AZURE_IMDS_BASE_URL);
            url.searchParams.set('api-version', apiVersion);
            url.searchParams.set('resource', resource);
            if (config?.objectId) {
                url.searchParams.set('object_id', config.objectId);
            }
            if (config?.clientId) {
                url.searchParams.set('client_id', config.clientId);
            }
            if (config?.msiResId) {
                url.searchParams.set('msi_res_id', config.msiResId);
            }
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await (config?.fetch ?? Shims.getDefaultFetch())(url.toString(), {
                    headers: {
                        Metadata: 'true',
                    },
                    signal: controller.signal,
                });
                if (!response.ok) {
                    throw new error_1.SubjectTokenProviderError(`Failed to fetch token from Azure IMDS: status ${response.status}`, 'azure-imds');
                }
                const data = (await response.json());
                if (!data.access_token) {
                    throw new error_1.SubjectTokenProviderError("IMDS response missing 'access_token' field", 'azure-imds');
                }
                return data.access_token;
            }
            catch (error) {
                if (error instanceof error_1.SubjectTokenProviderError) {
                    throw error;
                }
                throw new error_1.SubjectTokenProviderError('failed to fetch token from IMDS', 'azure-imds', error instanceof Error ? error : undefined);
            }
            finally {
                clearTimeout(timeoutId);
            }
        },
    };
}
function gcpIDTokenProvider(audience = 'https://api.openai.com/v1', config) {
    const timeout = config?.timeout || 10000;
    return {
        tokenType: 'id',
        getToken: async () => {
            const url = new URL(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity`);
            url.searchParams.set('audience', audience);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await (config?.fetch ?? Shims.getDefaultFetch())(url.toString(), {
                    headers: {
                        'Metadata-Flavor': 'Google',
                    },
                    signal: controller.signal,
                });
                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`GCP Metadata Server returned ${response.status}: ${errorText}`);
                }
                const token = (await response.text()).trim();
                if (!token) {
                    throw new Error('GCP metadata server returned an empty token');
                }
                return token;
            }
            catch (error) {
                throw new error_1.SubjectTokenProviderError(`Failed to fetch token from GCP Metadata Server: ${error instanceof Error ? error.message : String(error)}`, 'gcp-metadata', error instanceof Error ? error : undefined);
            }
            finally {
                clearTimeout(timeoutId);
            }
        },
    };
}
//# sourceMappingURL=subject-token-providers.js.map