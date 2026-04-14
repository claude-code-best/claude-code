export interface APIErrorObject {
    message: string;
    type: 'api_error';
}
export interface AuthenticationError {
    message: string;
    type: 'authentication_error';
}
export interface BillingError {
    message: string;
    type: 'billing_error';
}
export type ErrorObject = InvalidRequestError | AuthenticationError | BillingError | PermissionError | NotFoundError | RateLimitError | GatewayTimeoutError | APIErrorObject | OverloadedError;
export interface ErrorResponse {
    error: ErrorObject;
    request_id: string | null;
    type: 'error';
}
export type ErrorType = 'invalid_request_error' | 'authentication_error' | 'permission_error' | 'not_found_error' | 'rate_limit_error' | 'timeout_error' | 'overloaded_error' | 'api_error' | 'billing_error';
export interface GatewayTimeoutError {
    message: string;
    type: 'timeout_error';
}
export interface InvalidRequestError {
    message: string;
    type: 'invalid_request_error';
}
export interface NotFoundError {
    message: string;
    type: 'not_found_error';
}
export interface OverloadedError {
    message: string;
    type: 'overloaded_error';
}
export interface PermissionError {
    message: string;
    type: 'permission_error';
}
export interface RateLimitError {
    message: string;
    type: 'rate_limit_error';
}
//# sourceMappingURL=shared.d.ts.map