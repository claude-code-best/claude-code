"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetDelegatedAccessToken$ = exports.GetCallerIdentity$ = exports.GetAccessKeyInfo$ = exports.DecodeAuthorizationMessage$ = exports.AssumeRoot$ = exports.AssumeRoleWithWebIdentity$ = exports.AssumeRoleWithSAML$ = exports.AssumeRole$ = exports.Tag$ = exports.ProvidedContext$ = exports.PolicyDescriptorType$ = exports.GetWebIdentityTokenResponse$ = exports.GetWebIdentityTokenRequest$ = exports.GetSessionTokenResponse$ = exports.GetSessionTokenRequest$ = exports.GetFederationTokenResponse$ = exports.GetFederationTokenRequest$ = exports.GetDelegatedAccessTokenResponse$ = exports.GetDelegatedAccessTokenRequest$ = exports.GetCallerIdentityResponse$ = exports.GetCallerIdentityRequest$ = exports.GetAccessKeyInfoResponse$ = exports.GetAccessKeyInfoRequest$ = exports.FederatedUser$ = exports.DecodeAuthorizationMessageResponse$ = exports.DecodeAuthorizationMessageRequest$ = exports.Credentials$ = exports.AssumeRootResponse$ = exports.AssumeRootRequest$ = exports.AssumeRoleWithWebIdentityResponse$ = exports.AssumeRoleWithWebIdentityRequest$ = exports.AssumeRoleWithSAMLResponse$ = exports.AssumeRoleWithSAMLRequest$ = exports.AssumeRoleResponse$ = exports.AssumeRoleRequest$ = exports.AssumedRoleUser$ = exports.errorTypeRegistries = exports.SessionDurationEscalationException$ = exports.RegionDisabledException$ = exports.PackedPolicyTooLargeException$ = exports.OutboundWebIdentityFederationDisabledException$ = exports.MalformedPolicyDocumentException$ = exports.JWTPayloadSizeExceededException$ = exports.InvalidIdentityTokenException$ = exports.InvalidAuthorizationMessageException$ = exports.IDPRejectedClaimException$ = exports.IDPCommunicationErrorException$ = exports.ExpiredTradeInTokenException$ = exports.ExpiredTokenException$ = exports.STSServiceException$ = void 0;
exports.GetWebIdentityToken$ = exports.GetSessionToken$ = exports.GetFederationToken$ = void 0;
const _A = "Arn";
const _AKI = "AccessKeyId";
const _AP = "AssumedPrincipal";
const _AR = "AssumeRole";
const _ARI = "AssumedRoleId";
const _ARR = "AssumeRoleRequest";
const _ARRs = "AssumeRoleResponse";
const _ARRss = "AssumeRootRequest";
const _ARRssu = "AssumeRootResponse";
const _ARU = "AssumedRoleUser";
const _ARWSAML = "AssumeRoleWithSAML";
const _ARWSAMLR = "AssumeRoleWithSAMLRequest";
const _ARWSAMLRs = "AssumeRoleWithSAMLResponse";
const _ARWWI = "AssumeRoleWithWebIdentity";
const _ARWWIR = "AssumeRoleWithWebIdentityRequest";
const _ARWWIRs = "AssumeRoleWithWebIdentityResponse";
const _ARs = "AssumeRoot";
const _Ac = "Account";
const _Au = "Audience";
const _C = "Credentials";
const _CA = "ContextAssertion";
const _DAM = "DecodeAuthorizationMessage";
const _DAMR = "DecodeAuthorizationMessageRequest";
const _DAMRe = "DecodeAuthorizationMessageResponse";
const _DM = "DecodedMessage";
const _DS = "DurationSeconds";
const _E = "Expiration";
const _EI = "ExternalId";
const _EM = "EncodedMessage";
const _ETE = "ExpiredTokenException";
const _ETITE = "ExpiredTradeInTokenException";
const _FU = "FederatedUser";
const _FUI = "FederatedUserId";
const _GAKI = "GetAccessKeyInfo";
const _GAKIR = "GetAccessKeyInfoRequest";
const _GAKIRe = "GetAccessKeyInfoResponse";
const _GCI = "GetCallerIdentity";
const _GCIR = "GetCallerIdentityRequest";
const _GCIRe = "GetCallerIdentityResponse";
const _GDAT = "GetDelegatedAccessToken";
const _GDATR = "GetDelegatedAccessTokenRequest";
const _GDATRe = "GetDelegatedAccessTokenResponse";
const _GFT = "GetFederationToken";
const _GFTR = "GetFederationTokenRequest";
const _GFTRe = "GetFederationTokenResponse";
const _GST = "GetSessionToken";
const _GSTR = "GetSessionTokenRequest";
const _GSTRe = "GetSessionTokenResponse";
const _GWIT = "GetWebIdentityToken";
const _GWITR = "GetWebIdentityTokenRequest";
const _GWITRe = "GetWebIdentityTokenResponse";
const _I = "Issuer";
const _IAME = "InvalidAuthorizationMessageException";
const _IDPCEE = "IDPCommunicationErrorException";
const _IDPRCE = "IDPRejectedClaimException";
const _IITE = "InvalidIdentityTokenException";
const _JWTPSEE = "JWTPayloadSizeExceededException";
const _K = "Key";
const _MPDE = "MalformedPolicyDocumentException";
const _N = "Name";
const _NQ = "NameQualifier";
const _OWIFDE = "OutboundWebIdentityFederationDisabledException";
const _P = "Policy";
const _PA = "PolicyArns";
const _PAr = "PrincipalArn";
const _PAro = "ProviderArn";
const _PC = "ProvidedContexts";
const _PCLT = "ProvidedContextsListType";
const _PCr = "ProvidedContext";
const _PDT = "PolicyDescriptorType";
const _PI = "ProviderId";
const _PPS = "PackedPolicySize";
const _PPTLE = "PackedPolicyTooLargeException";
const _Pr = "Provider";
const _RA = "RoleArn";
const _RDE = "RegionDisabledException";
const _RSN = "RoleSessionName";
const _S = "Subject";
const _SA = "SigningAlgorithm";
const _SAK = "SecretAccessKey";
const _SAMLA = "SAMLAssertion";
const _SAMLAT = "SAMLAssertionType";
const _SDEE = "SessionDurationEscalationException";
const _SFWIT = "SubjectFromWebIdentityToken";
const _SI = "SourceIdentity";
const _SN = "SerialNumber";
const _ST = "SubjectType";
const _STe = "SessionToken";
const _T = "Tags";
const _TC = "TokenCode";
const _TIT = "TradeInToken";
const _TP = "TargetPrincipal";
const _TPA = "TaskPolicyArn";
const _TTK = "TransitiveTagKeys";
const _Ta = "Tag";
const _UI = "UserId";
const _V = "Value";
const _WIT = "WebIdentityToken";
const _a = "arn";
const _aKST = "accessKeySecretType";
const _aQE = "awsQueryError";
const _c = "client";
const _cTT = "clientTokenType";
const _e = "error";
const _hE = "httpError";
const _m = "message";
const _pDLT = "policyDescriptorListType";
const _s = "smithy.ts.sdk.synthetic.com.amazonaws.sts";
const _tITT = "tradeInTokenType";
const _tLT = "tagListType";
const _wITT = "webIdentityTokenType";
const n0 = "com.amazonaws.sts";
const schema_1 = require("@smithy/core/schema");
const errors_1 = require("../models/errors");
const STSServiceException_1 = require("../models/STSServiceException");
const _s_registry = schema_1.TypeRegistry.for(_s);
exports.STSServiceException$ = [-3, _s, "STSServiceException", 0, [], []];
_s_registry.registerError(exports.STSServiceException$, STSServiceException_1.STSServiceException);
const n0_registry = schema_1.TypeRegistry.for(n0);
exports.ExpiredTokenException$ = [-3, n0, _ETE,
    { [_aQE]: [`ExpiredTokenException`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.ExpiredTokenException$, errors_1.ExpiredTokenException);
exports.ExpiredTradeInTokenException$ = [-3, n0, _ETITE,
    { [_aQE]: [`ExpiredTradeInTokenException`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.ExpiredTradeInTokenException$, errors_1.ExpiredTradeInTokenException);
exports.IDPCommunicationErrorException$ = [-3, n0, _IDPCEE,
    { [_aQE]: [`IDPCommunicationError`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.IDPCommunicationErrorException$, errors_1.IDPCommunicationErrorException);
exports.IDPRejectedClaimException$ = [-3, n0, _IDPRCE,
    { [_aQE]: [`IDPRejectedClaim`, 403], [_e]: _c, [_hE]: 403 },
    [_m],
    [0]
];
n0_registry.registerError(exports.IDPRejectedClaimException$, errors_1.IDPRejectedClaimException);
exports.InvalidAuthorizationMessageException$ = [-3, n0, _IAME,
    { [_aQE]: [`InvalidAuthorizationMessageException`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.InvalidAuthorizationMessageException$, errors_1.InvalidAuthorizationMessageException);
exports.InvalidIdentityTokenException$ = [-3, n0, _IITE,
    { [_aQE]: [`InvalidIdentityToken`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.InvalidIdentityTokenException$, errors_1.InvalidIdentityTokenException);
exports.JWTPayloadSizeExceededException$ = [-3, n0, _JWTPSEE,
    { [_aQE]: [`JWTPayloadSizeExceededException`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.JWTPayloadSizeExceededException$, errors_1.JWTPayloadSizeExceededException);
exports.MalformedPolicyDocumentException$ = [-3, n0, _MPDE,
    { [_aQE]: [`MalformedPolicyDocument`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.MalformedPolicyDocumentException$, errors_1.MalformedPolicyDocumentException);
exports.OutboundWebIdentityFederationDisabledException$ = [-3, n0, _OWIFDE,
    { [_aQE]: [`OutboundWebIdentityFederationDisabledException`, 403], [_e]: _c, [_hE]: 403 },
    [_m],
    [0]
];
n0_registry.registerError(exports.OutboundWebIdentityFederationDisabledException$, errors_1.OutboundWebIdentityFederationDisabledException);
exports.PackedPolicyTooLargeException$ = [-3, n0, _PPTLE,
    { [_aQE]: [`PackedPolicyTooLarge`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(exports.PackedPolicyTooLargeException$, errors_1.PackedPolicyTooLargeException);
exports.RegionDisabledException$ = [-3, n0, _RDE,
    { [_aQE]: [`RegionDisabledException`, 403], [_e]: _c, [_hE]: 403 },
    [_m],
    [0]
];
n0_registry.registerError(exports.RegionDisabledException$, errors_1.RegionDisabledException);
exports.SessionDurationEscalationException$ = [-3, n0, _SDEE,
    { [_aQE]: [`SessionDurationEscalationException`, 403], [_e]: _c, [_hE]: 403 },
    [_m],
    [0]
];
n0_registry.registerError(exports.SessionDurationEscalationException$, errors_1.SessionDurationEscalationException);
exports.errorTypeRegistries = [
    _s_registry,
    n0_registry,
];
var accessKeySecretType = [0, n0, _aKST, 8, 0];
var clientTokenType = [0, n0, _cTT, 8, 0];
var SAMLAssertionType = [0, n0, _SAMLAT, 8, 0];
var tradeInTokenType = [0, n0, _tITT, 8, 0];
var webIdentityTokenType = [0, n0, _wITT, 8, 0];
exports.AssumedRoleUser$ = [3, n0, _ARU,
    0,
    [_ARI, _A],
    [0, 0], 2
];
exports.AssumeRoleRequest$ = [3, n0, _ARR,
    0,
    [_RA, _RSN, _PA, _P, _DS, _T, _TTK, _EI, _SN, _TC, _SI, _PC],
    [0, 0, () => policyDescriptorListType, 0, 1, () => tagListType, 64 | 0, 0, 0, 0, 0, () => ProvidedContextsListType], 2
];
exports.AssumeRoleResponse$ = [3, n0, _ARRs,
    0,
    [_C, _ARU, _PPS, _SI],
    [[() => exports.Credentials$, 0], () => exports.AssumedRoleUser$, 1, 0]
];
exports.AssumeRoleWithSAMLRequest$ = [3, n0, _ARWSAMLR,
    0,
    [_RA, _PAr, _SAMLA, _PA, _P, _DS],
    [0, 0, [() => SAMLAssertionType, 0], () => policyDescriptorListType, 0, 1], 3
];
exports.AssumeRoleWithSAMLResponse$ = [3, n0, _ARWSAMLRs,
    0,
    [_C, _ARU, _PPS, _S, _ST, _I, _Au, _NQ, _SI],
    [[() => exports.Credentials$, 0], () => exports.AssumedRoleUser$, 1, 0, 0, 0, 0, 0, 0]
];
exports.AssumeRoleWithWebIdentityRequest$ = [3, n0, _ARWWIR,
    0,
    [_RA, _RSN, _WIT, _PI, _PA, _P, _DS],
    [0, 0, [() => clientTokenType, 0], 0, () => policyDescriptorListType, 0, 1], 3
];
exports.AssumeRoleWithWebIdentityResponse$ = [3, n0, _ARWWIRs,
    0,
    [_C, _SFWIT, _ARU, _PPS, _Pr, _Au, _SI],
    [[() => exports.Credentials$, 0], 0, () => exports.AssumedRoleUser$, 1, 0, 0, 0]
];
exports.AssumeRootRequest$ = [3, n0, _ARRss,
    0,
    [_TP, _TPA, _DS],
    [0, () => exports.PolicyDescriptorType$, 1], 2
];
exports.AssumeRootResponse$ = [3, n0, _ARRssu,
    0,
    [_C, _SI],
    [[() => exports.Credentials$, 0], 0]
];
exports.Credentials$ = [3, n0, _C,
    0,
    [_AKI, _SAK, _STe, _E],
    [0, [() => accessKeySecretType, 0], 0, 4], 4
];
exports.DecodeAuthorizationMessageRequest$ = [3, n0, _DAMR,
    0,
    [_EM],
    [0], 1
];
exports.DecodeAuthorizationMessageResponse$ = [3, n0, _DAMRe,
    0,
    [_DM],
    [0]
];
exports.FederatedUser$ = [3, n0, _FU,
    0,
    [_FUI, _A],
    [0, 0], 2
];
exports.GetAccessKeyInfoRequest$ = [3, n0, _GAKIR,
    0,
    [_AKI],
    [0], 1
];
exports.GetAccessKeyInfoResponse$ = [3, n0, _GAKIRe,
    0,
    [_Ac],
    [0]
];
exports.GetCallerIdentityRequest$ = [3, n0, _GCIR,
    0,
    [],
    []
];
exports.GetCallerIdentityResponse$ = [3, n0, _GCIRe,
    0,
    [_UI, _Ac, _A],
    [0, 0, 0]
];
exports.GetDelegatedAccessTokenRequest$ = [3, n0, _GDATR,
    0,
    [_TIT],
    [[() => tradeInTokenType, 0]], 1
];
exports.GetDelegatedAccessTokenResponse$ = [3, n0, _GDATRe,
    0,
    [_C, _PPS, _AP],
    [[() => exports.Credentials$, 0], 1, 0]
];
exports.GetFederationTokenRequest$ = [3, n0, _GFTR,
    0,
    [_N, _P, _PA, _DS, _T],
    [0, 0, () => policyDescriptorListType, 1, () => tagListType], 1
];
exports.GetFederationTokenResponse$ = [3, n0, _GFTRe,
    0,
    [_C, _FU, _PPS],
    [[() => exports.Credentials$, 0], () => exports.FederatedUser$, 1]
];
exports.GetSessionTokenRequest$ = [3, n0, _GSTR,
    0,
    [_DS, _SN, _TC],
    [1, 0, 0]
];
exports.GetSessionTokenResponse$ = [3, n0, _GSTRe,
    0,
    [_C],
    [[() => exports.Credentials$, 0]]
];
exports.GetWebIdentityTokenRequest$ = [3, n0, _GWITR,
    0,
    [_Au, _SA, _DS, _T],
    [64 | 0, 0, 1, () => tagListType], 2
];
exports.GetWebIdentityTokenResponse$ = [3, n0, _GWITRe,
    0,
    [_WIT, _E],
    [[() => webIdentityTokenType, 0], 4]
];
exports.PolicyDescriptorType$ = [3, n0, _PDT,
    0,
    [_a],
    [0]
];
exports.ProvidedContext$ = [3, n0, _PCr,
    0,
    [_PAro, _CA],
    [0, 0]
];
exports.Tag$ = [3, n0, _Ta,
    0,
    [_K, _V],
    [0, 0], 2
];
var policyDescriptorListType = [1, n0, _pDLT,
    0, () => exports.PolicyDescriptorType$
];
var ProvidedContextsListType = [1, n0, _PCLT,
    0, () => exports.ProvidedContext$
];
var tagKeyListType = 64 | 0;
var tagListType = [1, n0, _tLT,
    0, () => exports.Tag$
];
var webIdentityTokenAudienceListType = 64 | 0;
exports.AssumeRole$ = [9, n0, _AR,
    0, () => exports.AssumeRoleRequest$, () => exports.AssumeRoleResponse$
];
exports.AssumeRoleWithSAML$ = [9, n0, _ARWSAML,
    0, () => exports.AssumeRoleWithSAMLRequest$, () => exports.AssumeRoleWithSAMLResponse$
];
exports.AssumeRoleWithWebIdentity$ = [9, n0, _ARWWI,
    0, () => exports.AssumeRoleWithWebIdentityRequest$, () => exports.AssumeRoleWithWebIdentityResponse$
];
exports.AssumeRoot$ = [9, n0, _ARs,
    0, () => exports.AssumeRootRequest$, () => exports.AssumeRootResponse$
];
exports.DecodeAuthorizationMessage$ = [9, n0, _DAM,
    0, () => exports.DecodeAuthorizationMessageRequest$, () => exports.DecodeAuthorizationMessageResponse$
];
exports.GetAccessKeyInfo$ = [9, n0, _GAKI,
    0, () => exports.GetAccessKeyInfoRequest$, () => exports.GetAccessKeyInfoResponse$
];
exports.GetCallerIdentity$ = [9, n0, _GCI,
    0, () => exports.GetCallerIdentityRequest$, () => exports.GetCallerIdentityResponse$
];
exports.GetDelegatedAccessToken$ = [9, n0, _GDAT,
    0, () => exports.GetDelegatedAccessTokenRequest$, () => exports.GetDelegatedAccessTokenResponse$
];
exports.GetFederationToken$ = [9, n0, _GFT,
    0, () => exports.GetFederationTokenRequest$, () => exports.GetFederationTokenResponse$
];
exports.GetSessionToken$ = [9, n0, _GST,
    0, () => exports.GetSessionTokenRequest$, () => exports.GetSessionTokenResponse$
];
exports.GetWebIdentityToken$ = [9, n0, _GWIT,
    0, () => exports.GetWebIdentityTokenRequest$, () => exports.GetWebIdentityTokenResponse$
];
