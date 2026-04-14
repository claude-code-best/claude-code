import { ExceptionOptionType as __ExceptionOptionType } from "@smithy/smithy-client";
import { STSServiceException as __BaseException } from "./STSServiceException";
export declare class ExpiredTokenException extends __BaseException {
  readonly name: "ExpiredTokenException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<ExpiredTokenException, __BaseException>
  );
}
export declare class MalformedPolicyDocumentException extends __BaseException {
  readonly name: "MalformedPolicyDocumentException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<
      MalformedPolicyDocumentException,
      __BaseException
    >
  );
}
export declare class PackedPolicyTooLargeException extends __BaseException {
  readonly name: "PackedPolicyTooLargeException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<PackedPolicyTooLargeException, __BaseException>
  );
}
export declare class RegionDisabledException extends __BaseException {
  readonly name: "RegionDisabledException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<RegionDisabledException, __BaseException>
  );
}
export declare class IDPRejectedClaimException extends __BaseException {
  readonly name: "IDPRejectedClaimException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<IDPRejectedClaimException, __BaseException>
  );
}
export declare class InvalidIdentityTokenException extends __BaseException {
  readonly name: "InvalidIdentityTokenException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<InvalidIdentityTokenException, __BaseException>
  );
}
export declare class IDPCommunicationErrorException extends __BaseException {
  readonly name: "IDPCommunicationErrorException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<IDPCommunicationErrorException, __BaseException>
  );
}
export declare class InvalidAuthorizationMessageException extends __BaseException {
  readonly name: "InvalidAuthorizationMessageException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<
      InvalidAuthorizationMessageException,
      __BaseException
    >
  );
}
export declare class ExpiredTradeInTokenException extends __BaseException {
  readonly name: "ExpiredTradeInTokenException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<ExpiredTradeInTokenException, __BaseException>
  );
}
export declare class JWTPayloadSizeExceededException extends __BaseException {
  readonly name: "JWTPayloadSizeExceededException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<
      JWTPayloadSizeExceededException,
      __BaseException
    >
  );
}
export declare class OutboundWebIdentityFederationDisabledException extends __BaseException {
  readonly name: "OutboundWebIdentityFederationDisabledException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<
      OutboundWebIdentityFederationDisabledException,
      __BaseException
    >
  );
}
export declare class SessionDurationEscalationException extends __BaseException {
  readonly name: "SessionDurationEscalationException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<
      SessionDurationEscalationException,
      __BaseException
    >
  );
}
