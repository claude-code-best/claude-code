import { ExceptionOptionType as __ExceptionOptionType } from "@smithy/smithy-client";
import { BedrockServiceException as __BaseException } from "./BedrockServiceException";
export declare class AccessDeniedException extends __BaseException {
  readonly name: "AccessDeniedException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<AccessDeniedException, __BaseException>
  );
}
export declare class InternalServerException extends __BaseException {
  readonly name: "InternalServerException";
  readonly $fault: "server";
  constructor(
    opts: __ExceptionOptionType<InternalServerException, __BaseException>
  );
}
export declare class ResourceNotFoundException extends __BaseException {
  readonly name: "ResourceNotFoundException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<ResourceNotFoundException, __BaseException>
  );
}
export declare class ThrottlingException extends __BaseException {
  readonly name: "ThrottlingException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<ThrottlingException, __BaseException>
  );
}
export declare class ValidationException extends __BaseException {
  readonly name: "ValidationException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<ValidationException, __BaseException>
  );
}
export declare class ConflictException extends __BaseException {
  readonly name: "ConflictException";
  readonly $fault: "client";
  constructor(opts: __ExceptionOptionType<ConflictException, __BaseException>);
}
export declare class ServiceQuotaExceededException extends __BaseException {
  readonly name: "ServiceQuotaExceededException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<ServiceQuotaExceededException, __BaseException>
  );
}
export declare class TooManyTagsException extends __BaseException {
  readonly name: "TooManyTagsException";
  readonly $fault: "client";
  resourceName?: string | undefined;
  constructor(
    opts: __ExceptionOptionType<TooManyTagsException, __BaseException>
  );
}
export declare class ResourceInUseException extends __BaseException {
  readonly name: "ResourceInUseException";
  readonly $fault: "client";
  constructor(
    opts: __ExceptionOptionType<ResourceInUseException, __BaseException>
  );
}
export declare class ServiceUnavailableException extends __BaseException {
  readonly name: "ServiceUnavailableException";
  readonly $fault: "server";
  constructor(
    opts: __ExceptionOptionType<ServiceUnavailableException, __BaseException>
  );
}
