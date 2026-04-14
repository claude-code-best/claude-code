"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubjectTokenProviderError = exports.OAuthError = exports.gcpIDTokenProvider = exports.azureManagedIdentityTokenProvider = exports.k8sServiceAccountTokenProvider = void 0;
var subject_token_providers_1 = require("./subject-token-providers.js");
Object.defineProperty(exports, "k8sServiceAccountTokenProvider", { enumerable: true, get: function () { return subject_token_providers_1.k8sServiceAccountTokenProvider; } });
Object.defineProperty(exports, "azureManagedIdentityTokenProvider", { enumerable: true, get: function () { return subject_token_providers_1.azureManagedIdentityTokenProvider; } });
Object.defineProperty(exports, "gcpIDTokenProvider", { enumerable: true, get: function () { return subject_token_providers_1.gcpIDTokenProvider; } });
var error_1 = require("../core/error.js");
Object.defineProperty(exports, "OAuthError", { enumerable: true, get: function () { return error_1.OAuthError; } });
Object.defineProperty(exports, "SubjectTokenProviderError", { enumerable: true, get: function () { return error_1.SubjectTokenProviderError; } });
//# sourceMappingURL=index.js.map