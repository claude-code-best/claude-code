import { STSServiceException as __BaseException } from "./STSServiceException";
export class ExpiredTokenException extends __BaseException {
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
export class MalformedPolicyDocumentException extends __BaseException {
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
export class PackedPolicyTooLargeException extends __BaseException {
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
export class RegionDisabledException extends __BaseException {
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
export class IDPRejectedClaimException extends __BaseException {
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
export class InvalidIdentityTokenException extends __BaseException {
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
export class IDPCommunicationErrorException extends __BaseException {
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
export class InvalidAuthorizationMessageException extends __BaseException {
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
export class ExpiredTradeInTokenException extends __BaseException {
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
export class JWTPayloadSizeExceededException extends __BaseException {
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
export class OutboundWebIdentityFederationDisabledException extends __BaseException {
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
export class SessionDurationEscalationException extends __BaseException {
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
