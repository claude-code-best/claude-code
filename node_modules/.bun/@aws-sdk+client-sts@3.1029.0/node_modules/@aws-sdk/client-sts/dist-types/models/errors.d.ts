import type { ExceptionOptionType as __ExceptionOptionType } from "@smithy/smithy-client";
import { STSServiceException as __BaseException } from "./STSServiceException";
/**
 * <p>The web identity token that was passed is expired or is not valid. Get a new identity
 *             token from the identity provider and then retry the request.</p>
 * @public
 */
export declare class ExpiredTokenException extends __BaseException {
    readonly name: "ExpiredTokenException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ExpiredTokenException, __BaseException>);
}
/**
 * <p>The request was rejected because the policy document was malformed. The error message
 *             describes the specific error.</p>
 * @public
 */
export declare class MalformedPolicyDocumentException extends __BaseException {
    readonly name: "MalformedPolicyDocumentException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<MalformedPolicyDocumentException, __BaseException>);
}
/**
 * <p>The request was rejected because the total packed size of the session policies and
 *             session tags combined was too large. An Amazon Web Services conversion compresses the session policy
 *             document, session policy ARNs, and session tags into a packed binary format that has a
 *             separate limit. The error message indicates by percentage how close the policies and
 *             tags are to the upper size limit. For more information, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_session-tags.html">Passing Session Tags in STS</a> in
 *             the <i>IAM User Guide</i>.</p>
 *          <p>You could receive this error even though you meet other defined session policy and
 *             session tag limits. For more information, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_iam-quotas.html#reference_iam-limits-entity-length">IAM and STS Entity Character Limits</a> in the <i>IAM User
 *                 Guide</i>.</p>
 * @public
 */
export declare class PackedPolicyTooLargeException extends __BaseException {
    readonly name: "PackedPolicyTooLargeException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<PackedPolicyTooLargeException, __BaseException>);
}
/**
 * <p>STS is not activated in the requested region for the account that is being asked to
 *             generate credentials. The account administrator must use the IAM console to activate
 *             STS in that region. For more information, see <a href="https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_enable-regions.html#sts-regions-activate-deactivate">Activating and Deactivating STS in an Amazon Web Services Region</a> in the <i>IAM
 *                 User Guide</i>.</p>
 * @public
 */
export declare class RegionDisabledException extends __BaseException {
    readonly name: "RegionDisabledException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<RegionDisabledException, __BaseException>);
}
/**
 * <p>The identity provider (IdP) reported that authentication failed. This might be because
 *             the claim is invalid.</p>
 *          <p>If this error is returned for the <code>AssumeRoleWithWebIdentity</code> operation, it
 *             can also mean that the claim has expired or has been explicitly revoked. </p>
 * @public
 */
export declare class IDPRejectedClaimException extends __BaseException {
    readonly name: "IDPRejectedClaimException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<IDPRejectedClaimException, __BaseException>);
}
/**
 * <p>The web identity token that was passed could not be validated by Amazon Web Services. Get a new
 *             identity token from the identity provider and then retry the request.</p>
 * @public
 */
export declare class InvalidIdentityTokenException extends __BaseException {
    readonly name: "InvalidIdentityTokenException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<InvalidIdentityTokenException, __BaseException>);
}
/**
 * <p>The request could not be fulfilled because the identity provider (IDP) that was asked
 *             to verify the incoming identity token could not be reached. This is often a transient
 *             error caused by network conditions. Retry the request a limited number of times so that
 *             you don't exceed the request rate. If the error persists, the identity provider might be
 *             down or not responding.</p>
 * @public
 */
export declare class IDPCommunicationErrorException extends __BaseException {
    readonly name: "IDPCommunicationErrorException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<IDPCommunicationErrorException, __BaseException>);
}
/**
 * <p>The error returned if the message passed to <code>DecodeAuthorizationMessage</code>
 *             was invalid. This can happen if the token contains invalid characters, such as line
 *             breaks, or if the message has expired.</p>
 * @public
 */
export declare class InvalidAuthorizationMessageException extends __BaseException {
    readonly name: "InvalidAuthorizationMessageException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<InvalidAuthorizationMessageException, __BaseException>);
}
/**
 * <p>The trade-in token provided in the request has expired and can no longer be exchanged
 *             for credentials. Request a new token and retry the operation.</p>
 * @public
 */
export declare class ExpiredTradeInTokenException extends __BaseException {
    readonly name: "ExpiredTradeInTokenException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<ExpiredTradeInTokenException, __BaseException>);
}
/**
 * <p>The requested token payload size exceeds the maximum allowed size. Reduce the number of request tags included in the <code>GetWebIdentityToken</code> API call to reduce the token payload size.</p>
 * @public
 */
export declare class JWTPayloadSizeExceededException extends __BaseException {
    readonly name: "JWTPayloadSizeExceededException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<JWTPayloadSizeExceededException, __BaseException>);
}
/**
 * <p>The outbound web identity federation feature is not enabled for this account. To use
 *             this feature, you must first enable it through the Amazon Web Services Management Console or API.</p>
 * @public
 */
export declare class OutboundWebIdentityFederationDisabledException extends __BaseException {
    readonly name: "OutboundWebIdentityFederationDisabledException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<OutboundWebIdentityFederationDisabledException, __BaseException>);
}
/**
 * <p>The requested token duration would extend the session beyond its original expiration time.
 *             You cannot use this operation to extend the lifetime of a session beyond what was granted when the session was originally created.</p>
 * @public
 */
export declare class SessionDurationEscalationException extends __BaseException {
    readonly name: "SessionDurationEscalationException";
    readonly $fault: "client";
    /**
     * @internal
     */
    constructor(opts: __ExceptionOptionType<SessionDurationEscalationException, __BaseException>);
}
