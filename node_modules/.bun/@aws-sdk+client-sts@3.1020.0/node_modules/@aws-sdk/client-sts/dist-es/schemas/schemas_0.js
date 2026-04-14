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
import { TypeRegistry } from "@smithy/core/schema";
import { ExpiredTokenException, ExpiredTradeInTokenException, IDPCommunicationErrorException, IDPRejectedClaimException, InvalidAuthorizationMessageException, InvalidIdentityTokenException, JWTPayloadSizeExceededException, MalformedPolicyDocumentException, OutboundWebIdentityFederationDisabledException, PackedPolicyTooLargeException, RegionDisabledException, SessionDurationEscalationException, } from "../models/errors";
import { STSServiceException } from "../models/STSServiceException";
const _s_registry = TypeRegistry.for(_s);
export var STSServiceException$ = [-3, _s, "STSServiceException", 0, [], []];
_s_registry.registerError(STSServiceException$, STSServiceException);
const n0_registry = TypeRegistry.for(n0);
export var ExpiredTokenException$ = [-3, n0, _ETE,
    { [_aQE]: [`ExpiredTokenException`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(ExpiredTokenException$, ExpiredTokenException);
export var ExpiredTradeInTokenException$ = [-3, n0, _ETITE,
    { [_aQE]: [`ExpiredTradeInTokenException`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(ExpiredTradeInTokenException$, ExpiredTradeInTokenException);
export var IDPCommunicationErrorException$ = [-3, n0, _IDPCEE,
    { [_aQE]: [`IDPCommunicationError`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(IDPCommunicationErrorException$, IDPCommunicationErrorException);
export var IDPRejectedClaimException$ = [-3, n0, _IDPRCE,
    { [_aQE]: [`IDPRejectedClaim`, 403], [_e]: _c, [_hE]: 403 },
    [_m],
    [0]
];
n0_registry.registerError(IDPRejectedClaimException$, IDPRejectedClaimException);
export var InvalidAuthorizationMessageException$ = [-3, n0, _IAME,
    { [_aQE]: [`InvalidAuthorizationMessageException`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(InvalidAuthorizationMessageException$, InvalidAuthorizationMessageException);
export var InvalidIdentityTokenException$ = [-3, n0, _IITE,
    { [_aQE]: [`InvalidIdentityToken`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(InvalidIdentityTokenException$, InvalidIdentityTokenException);
export var JWTPayloadSizeExceededException$ = [-3, n0, _JWTPSEE,
    { [_aQE]: [`JWTPayloadSizeExceededException`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(JWTPayloadSizeExceededException$, JWTPayloadSizeExceededException);
export var MalformedPolicyDocumentException$ = [-3, n0, _MPDE,
    { [_aQE]: [`MalformedPolicyDocument`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(MalformedPolicyDocumentException$, MalformedPolicyDocumentException);
export var OutboundWebIdentityFederationDisabledException$ = [-3, n0, _OWIFDE,
    { [_aQE]: [`OutboundWebIdentityFederationDisabledException`, 403], [_e]: _c, [_hE]: 403 },
    [_m],
    [0]
];
n0_registry.registerError(OutboundWebIdentityFederationDisabledException$, OutboundWebIdentityFederationDisabledException);
export var PackedPolicyTooLargeException$ = [-3, n0, _PPTLE,
    { [_aQE]: [`PackedPolicyTooLarge`, 400], [_e]: _c, [_hE]: 400 },
    [_m],
    [0]
];
n0_registry.registerError(PackedPolicyTooLargeException$, PackedPolicyTooLargeException);
export var RegionDisabledException$ = [-3, n0, _RDE,
    { [_aQE]: [`RegionDisabledException`, 403], [_e]: _c, [_hE]: 403 },
    [_m],
    [0]
];
n0_registry.registerError(RegionDisabledException$, RegionDisabledException);
export var SessionDurationEscalationException$ = [-3, n0, _SDEE,
    { [_aQE]: [`SessionDurationEscalationException`, 403], [_e]: _c, [_hE]: 403 },
    [_m],
    [0]
];
n0_registry.registerError(SessionDurationEscalationException$, SessionDurationEscalationException);
export const errorTypeRegistries = [
    _s_registry,
    n0_registry,
];
var accessKeySecretType = [0, n0, _aKST, 8, 0];
var clientTokenType = [0, n0, _cTT, 8, 0];
var SAMLAssertionType = [0, n0, _SAMLAT, 8, 0];
var tradeInTokenType = [0, n0, _tITT, 8, 0];
var webIdentityTokenType = [0, n0, _wITT, 8, 0];
export var AssumedRoleUser$ = [3, n0, _ARU,
    0,
    [_ARI, _A],
    [0, 0], 2
];
export var AssumeRoleRequest$ = [3, n0, _ARR,
    0,
    [_RA, _RSN, _PA, _P, _DS, _T, _TTK, _EI, _SN, _TC, _SI, _PC],
    [0, 0, () => policyDescriptorListType, 0, 1, () => tagListType, 64 | 0, 0, 0, 0, 0, () => ProvidedContextsListType], 2
];
export var AssumeRoleResponse$ = [3, n0, _ARRs,
    0,
    [_C, _ARU, _PPS, _SI],
    [[() => Credentials$, 0], () => AssumedRoleUser$, 1, 0]
];
export var AssumeRoleWithSAMLRequest$ = [3, n0, _ARWSAMLR,
    0,
    [_RA, _PAr, _SAMLA, _PA, _P, _DS],
    [0, 0, [() => SAMLAssertionType, 0], () => policyDescriptorListType, 0, 1], 3
];
export var AssumeRoleWithSAMLResponse$ = [3, n0, _ARWSAMLRs,
    0,
    [_C, _ARU, _PPS, _S, _ST, _I, _Au, _NQ, _SI],
    [[() => Credentials$, 0], () => AssumedRoleUser$, 1, 0, 0, 0, 0, 0, 0]
];
export var AssumeRoleWithWebIdentityRequest$ = [3, n0, _ARWWIR,
    0,
    [_RA, _RSN, _WIT, _PI, _PA, _P, _DS],
    [0, 0, [() => clientTokenType, 0], 0, () => policyDescriptorListType, 0, 1], 3
];
export var AssumeRoleWithWebIdentityResponse$ = [3, n0, _ARWWIRs,
    0,
    [_C, _SFWIT, _ARU, _PPS, _Pr, _Au, _SI],
    [[() => Credentials$, 0], 0, () => AssumedRoleUser$, 1, 0, 0, 0]
];
export var AssumeRootRequest$ = [3, n0, _ARRss,
    0,
    [_TP, _TPA, _DS],
    [0, () => PolicyDescriptorType$, 1], 2
];
export var AssumeRootResponse$ = [3, n0, _ARRssu,
    0,
    [_C, _SI],
    [[() => Credentials$, 0], 0]
];
export var Credentials$ = [3, n0, _C,
    0,
    [_AKI, _SAK, _STe, _E],
    [0, [() => accessKeySecretType, 0], 0, 4], 4
];
export var DecodeAuthorizationMessageRequest$ = [3, n0, _DAMR,
    0,
    [_EM],
    [0], 1
];
export var DecodeAuthorizationMessageResponse$ = [3, n0, _DAMRe,
    0,
    [_DM],
    [0]
];
export var FederatedUser$ = [3, n0, _FU,
    0,
    [_FUI, _A],
    [0, 0], 2
];
export var GetAccessKeyInfoRequest$ = [3, n0, _GAKIR,
    0,
    [_AKI],
    [0], 1
];
export var GetAccessKeyInfoResponse$ = [3, n0, _GAKIRe,
    0,
    [_Ac],
    [0]
];
export var GetCallerIdentityRequest$ = [3, n0, _GCIR,
    0,
    [],
    []
];
export var GetCallerIdentityResponse$ = [3, n0, _GCIRe,
    0,
    [_UI, _Ac, _A],
    [0, 0, 0]
];
export var GetDelegatedAccessTokenRequest$ = [3, n0, _GDATR,
    0,
    [_TIT],
    [[() => tradeInTokenType, 0]], 1
];
export var GetDelegatedAccessTokenResponse$ = [3, n0, _GDATRe,
    0,
    [_C, _PPS, _AP],
    [[() => Credentials$, 0], 1, 0]
];
export var GetFederationTokenRequest$ = [3, n0, _GFTR,
    0,
    [_N, _P, _PA, _DS, _T],
    [0, 0, () => policyDescriptorListType, 1, () => tagListType], 1
];
export var GetFederationTokenResponse$ = [3, n0, _GFTRe,
    0,
    [_C, _FU, _PPS],
    [[() => Credentials$, 0], () => FederatedUser$, 1]
];
export var GetSessionTokenRequest$ = [3, n0, _GSTR,
    0,
    [_DS, _SN, _TC],
    [1, 0, 0]
];
export var GetSessionTokenResponse$ = [3, n0, _GSTRe,
    0,
    [_C],
    [[() => Credentials$, 0]]
];
export var GetWebIdentityTokenRequest$ = [3, n0, _GWITR,
    0,
    [_Au, _SA, _DS, _T],
    [64 | 0, 0, 1, () => tagListType], 2
];
export var GetWebIdentityTokenResponse$ = [3, n0, _GWITRe,
    0,
    [_WIT, _E],
    [[() => webIdentityTokenType, 0], 4]
];
export var PolicyDescriptorType$ = [3, n0, _PDT,
    0,
    [_a],
    [0]
];
export var ProvidedContext$ = [3, n0, _PCr,
    0,
    [_PAro, _CA],
    [0, 0]
];
export var Tag$ = [3, n0, _Ta,
    0,
    [_K, _V],
    [0, 0], 2
];
var policyDescriptorListType = [1, n0, _pDLT,
    0, () => PolicyDescriptorType$
];
var ProvidedContextsListType = [1, n0, _PCLT,
    0, () => ProvidedContext$
];
var tagKeyListType = 64 | 0;
var tagListType = [1, n0, _tLT,
    0, () => Tag$
];
var webIdentityTokenAudienceListType = 64 | 0;
export var AssumeRole$ = [9, n0, _AR,
    0, () => AssumeRoleRequest$, () => AssumeRoleResponse$
];
export var AssumeRoleWithSAML$ = [9, n0, _ARWSAML,
    0, () => AssumeRoleWithSAMLRequest$, () => AssumeRoleWithSAMLResponse$
];
export var AssumeRoleWithWebIdentity$ = [9, n0, _ARWWI,
    0, () => AssumeRoleWithWebIdentityRequest$, () => AssumeRoleWithWebIdentityResponse$
];
export var AssumeRoot$ = [9, n0, _ARs,
    0, () => AssumeRootRequest$, () => AssumeRootResponse$
];
export var DecodeAuthorizationMessage$ = [9, n0, _DAM,
    0, () => DecodeAuthorizationMessageRequest$, () => DecodeAuthorizationMessageResponse$
];
export var GetAccessKeyInfo$ = [9, n0, _GAKI,
    0, () => GetAccessKeyInfoRequest$, () => GetAccessKeyInfoResponse$
];
export var GetCallerIdentity$ = [9, n0, _GCI,
    0, () => GetCallerIdentityRequest$, () => GetCallerIdentityResponse$
];
export var GetDelegatedAccessToken$ = [9, n0, _GDAT,
    0, () => GetDelegatedAccessTokenRequest$, () => GetDelegatedAccessTokenResponse$
];
export var GetFederationToken$ = [9, n0, _GFT,
    0, () => GetFederationTokenRequest$, () => GetFederationTokenResponse$
];
export var GetSessionToken$ = [9, n0, _GST,
    0, () => GetSessionTokenRequest$, () => GetSessionTokenResponse$
];
export var GetWebIdentityToken$ = [9, n0, _GWIT,
    0, () => GetWebIdentityTokenRequest$, () => GetWebIdentityTokenResponse$
];
