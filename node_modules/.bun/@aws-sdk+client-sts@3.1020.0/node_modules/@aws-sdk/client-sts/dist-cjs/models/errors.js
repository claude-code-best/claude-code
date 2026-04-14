"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionDurationEscalationException = exports.OutboundWebIdentityFederationDisabledException = exports.JWTPayloadSizeExceededException = exports.ExpiredTradeInTokenException = exports.InvalidAuthorizationMessageException = exports.IDPCommunicationErrorException = exports.InvalidIdentityTokenException = exports.IDPRejectedClaimException = exports.RegionDisabledException = exports.PackedPolicyTooLargeException = exports.MalformedPolicyDocumentException = exports.ExpiredTokenException = void 0;
const STSServiceException_1 = require("./STSServiceException");
class ExpiredTokenException extends STSServiceException_1.STSServiceException {
    name = "ExpiredTokenException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ExpiredTokenException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ExpiredTokenException.prototype);
    }
}
exports.ExpiredTokenException = ExpiredTokenException;
class MalformedPolicyDocumentException extends STSServiceException_1.STSServiceException {
    name = "MalformedPolicyDocumentException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "MalformedPolicyDocumentException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, MalformedPolicyDocumentException.prototype);
    }
}
exports.MalformedPolicyDocumentException = MalformedPolicyDocumentException;
class PackedPolicyTooLargeException extends STSServiceException_1.STSServiceException {
    name = "PackedPolicyTooLargeException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "PackedPolicyTooLargeException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, PackedPolicyTooLargeException.prototype);
    }
}
exports.PackedPolicyTooLargeException = PackedPolicyTooLargeException;
class RegionDisabledException extends STSServiceException_1.STSServiceException {
    name = "RegionDisabledException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "RegionDisabledException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, RegionDisabledException.prototype);
    }
}
exports.RegionDisabledException = RegionDisabledException;
class IDPRejectedClaimException extends STSServiceException_1.STSServiceException {
    name = "IDPRejectedClaimException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "IDPRejectedClaimException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, IDPRejectedClaimException.prototype);
    }
}
exports.IDPRejectedClaimException = IDPRejectedClaimException;
class InvalidIdentityTokenException extends STSServiceException_1.STSServiceException {
    name = "InvalidIdentityTokenException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "InvalidIdentityTokenException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, InvalidIdentityTokenException.prototype);
    }
}
exports.InvalidIdentityTokenException = InvalidIdentityTokenException;
class IDPCommunicationErrorException extends STSServiceException_1.STSServiceException {
    name = "IDPCommunicationErrorException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "IDPCommunicationErrorException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, IDPCommunicationErrorException.prototype);
    }
}
exports.IDPCommunicationErrorException = IDPCommunicationErrorException;
class InvalidAuthorizationMessageException extends STSServiceException_1.STSServiceException {
    name = "InvalidAuthorizationMessageException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "InvalidAuthorizationMessageException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, InvalidAuthorizationMessageException.prototype);
    }
}
exports.InvalidAuthorizationMessageException = InvalidAuthorizationMessageException;
class ExpiredTradeInTokenException extends STSServiceException_1.STSServiceException {
    name = "ExpiredTradeInTokenException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "ExpiredTradeInTokenException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, ExpiredTradeInTokenException.prototype);
    }
}
exports.ExpiredTradeInTokenException = ExpiredTradeInTokenException;
class JWTPayloadSizeExceededException extends STSServiceException_1.STSServiceException {
    name = "JWTPayloadSizeExceededException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "JWTPayloadSizeExceededException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, JWTPayloadSizeExceededException.prototype);
    }
}
exports.JWTPayloadSizeExceededException = JWTPayloadSizeExceededException;
class OutboundWebIdentityFederationDisabledException extends STSServiceException_1.STSServiceException {
    name = "OutboundWebIdentityFederationDisabledException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "OutboundWebIdentityFederationDisabledException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, OutboundWebIdentityFederationDisabledException.prototype);
    }
}
exports.OutboundWebIdentityFederationDisabledException = OutboundWebIdentityFederationDisabledException;
class SessionDurationEscalationException extends STSServiceException_1.STSServiceException {
    name = "SessionDurationEscalationException";
    $fault = "client";
    constructor(opts) {
        super({
            name: "SessionDurationEscalationException",
            $fault: "client",
            ...opts,
        });
        Object.setPrototypeOf(this, SessionDurationEscalationException.prototype);
    }
}
exports.SessionDurationEscalationException = SessionDurationEscalationException;
