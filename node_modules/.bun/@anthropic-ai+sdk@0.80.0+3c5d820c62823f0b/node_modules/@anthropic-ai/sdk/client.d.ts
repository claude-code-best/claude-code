import type { RequestInit, RequestInfo } from "./internal/builtin-types.js";
import type { PromiseOrValue, MergedRequestInit, FinalizedRequestInit } from "./internal/types.js";
export type { Logger, LogLevel } from "./internal/utils/log.js";
import * as Opts from "./internal/request-options.js";
import * as Errors from "./core/error.js";
import * as Pagination from "./core/pagination.js";
import { type PageParams, PageResponse, type PageCursorParams, PageCursorResponse, type TokenPageParams, TokenPageResponse } from "./core/pagination.js";
import * as Uploads from "./core/uploads.js";
import * as API from "./resources/index.js";
import { APIPromise } from "./core/api-promise.js";
import { Completion, CompletionCreateParams, CompletionCreateParamsNonStreaming, CompletionCreateParamsStreaming, Completions } from "./resources/completions.js";
import { CapabilitySupport, ContextManagementCapability, EffortCapability, ModelCapabilities, ModelInfo, ModelInfosPage, ModelListParams, ModelRetrieveParams, Models, ThinkingCapability, ThinkingTypes } from "./resources/models.js";
import { AnthropicBeta, Beta, BetaAPIError, BetaAuthenticationError, BetaBillingError, BetaError, BetaErrorResponse, BetaGatewayTimeoutError, BetaInvalidRequestError, BetaNotFoundError, BetaOverloadedError, BetaPermissionError, BetaRateLimitError } from "./resources/beta/beta.js";
import { Base64ImageSource, Base64PDFSource, BashCodeExecutionOutputBlock, BashCodeExecutionOutputBlockParam, BashCodeExecutionResultBlock, BashCodeExecutionResultBlockParam, BashCodeExecutionToolResultBlock, BashCodeExecutionToolResultBlockParam, BashCodeExecutionToolResultError, BashCodeExecutionToolResultErrorCode, BashCodeExecutionToolResultErrorParam, CacheControlEphemeral, CacheCreation, CitationCharLocation, CitationCharLocationParam, CitationContentBlockLocation, CitationContentBlockLocationParam, CitationPageLocation, CitationPageLocationParam, CitationSearchResultLocationParam, CitationWebSearchResultLocationParam, CitationsConfig, CitationsConfigParam, CitationsDelta, CitationsSearchResultLocation, CitationsWebSearchResultLocation, CodeExecutionOutputBlock, CodeExecutionOutputBlockParam, CodeExecutionResultBlock, CodeExecutionResultBlockParam, CodeExecutionTool20250522, CodeExecutionTool20250825, CodeExecutionTool20260120, CodeExecutionToolResultBlock, CodeExecutionToolResultBlockContent, CodeExecutionToolResultBlockParam, CodeExecutionToolResultBlockParamContent, CodeExecutionToolResultError, CodeExecutionToolResultErrorCode, CodeExecutionToolResultErrorParam, Container, ContainerUploadBlock, ContainerUploadBlockParam, ContentBlock, ContentBlockDeltaEvent, ContentBlockParam, ContentBlockStartEvent, ContentBlockStopEvent, ContentBlockSource, ContentBlockSourceContent, DirectCaller, DocumentBlock, DocumentBlockParam, EncryptedCodeExecutionResultBlock, EncryptedCodeExecutionResultBlockParam, ImageBlockParam, InputJSONDelta, JSONOutputFormat, MemoryTool20250818, Message, MessageStreamParams, MessageCountTokensParams, MessageCountTokensTool, MessageCreateParams, MessageCreateParamsNonStreaming, MessageCreateParamsStreaming, MessageDeltaEvent, MessageDeltaUsage, MessageParam, MessageStartEvent, MessageStopEvent, MessageStreamEvent, MessageTokensCount, Messages, Metadata, Model, OutputConfig, PlainTextSource, RawContentBlockDelta, RawContentBlockDeltaEvent, RawContentBlockStartEvent, RawContentBlockStopEvent, RawMessageDeltaEvent, RawMessageStartEvent, RawMessageStopEvent, RawMessageStreamEvent, RedactedThinkingBlock, RedactedThinkingBlockParam, SearchResultBlockParam, ServerToolCaller, ServerToolCaller20260120, ServerToolUsage, ServerToolUseBlock, ServerToolUseBlockParam, SignatureDelta, StopReason, TextBlock, TextBlockParam, TextCitation, TextCitationParam, TextDelta, TextEditorCodeExecutionCreateResultBlock, TextEditorCodeExecutionCreateResultBlockParam, TextEditorCodeExecutionStrReplaceResultBlock, TextEditorCodeExecutionStrReplaceResultBlockParam, TextEditorCodeExecutionToolResultBlock, TextEditorCodeExecutionToolResultBlockParam, TextEditorCodeExecutionToolResultError, TextEditorCodeExecutionToolResultErrorCode, TextEditorCodeExecutionToolResultErrorParam, TextEditorCodeExecutionViewResultBlock, TextEditorCodeExecutionViewResultBlockParam, ThinkingBlock, ThinkingBlockParam, ThinkingConfigAdaptive, ThinkingConfigDisabled, ThinkingConfigEnabled, ThinkingConfigParam, ThinkingDelta, Tool, ToolBash20250124, ToolChoice, ToolChoiceAny, ToolChoiceAuto, ToolChoiceNone, ToolChoiceTool, ToolReferenceBlock, ToolReferenceBlockParam, ToolResultBlockParam, ToolSearchToolBm25_20251119, ToolSearchToolRegex20251119, ToolSearchToolResultBlock, ToolSearchToolResultBlockParam, ToolSearchToolResultError, ToolSearchToolResultErrorCode, ToolSearchToolResultErrorParam, ToolSearchToolSearchResultBlock, ToolSearchToolSearchResultBlockParam, ToolTextEditor20250124, ToolTextEditor20250429, ToolTextEditor20250728, ToolUnion, ToolUseBlock, ToolUseBlockParam, URLImageSource, URLPDFSource, Usage, UserLocation, WebFetchBlock, WebFetchBlockParam, WebFetchTool20250910, WebFetchTool20260209, WebFetchTool20260309, WebFetchToolResultBlock, WebFetchToolResultBlockParam, WebFetchToolResultErrorBlock, WebFetchToolResultErrorBlockParam, WebFetchToolResultErrorCode, WebSearchResultBlock, WebSearchResultBlockParam, WebSearchTool20250305, WebSearchTool20260209, WebSearchToolRequestError, WebSearchToolResultBlock, WebSearchToolResultBlockContent, WebSearchToolResultBlockParam, WebSearchToolResultBlockParamContent, WebSearchToolResultError, WebSearchToolResultErrorCode } from "./resources/messages/messages.js";
import { type Fetch } from "./internal/builtin-types.js";
import { HeadersLike, NullableHeaders } from "./internal/headers.js";
import { FinalRequestOptions, RequestOptions } from "./internal/request-options.js";
import { type LogLevel, type Logger } from "./internal/utils/log.js";
export type ApiKeySetter = () => Promise<string>;
export interface ClientOptions {
    /**
     * API key used for authentication.
     *
     * - Accepts either a static string or an async function that resolves to a string.
     * - Defaults to process.env['ANTHROPIC_API_KEY'].
     * - When a function is provided, it is invoked before each request so you can rotate
     *   or refresh credentials at runtime.
     * - The function must return a non-empty string; otherwise an AnthropicError is thrown.
     * - If the function throws, the error is wrapped in an AnthropicError with the original
     *   error available as `cause`.
     */
    apiKey?: string | ApiKeySetter | null | undefined;
    /**
     * Defaults to process.env['ANTHROPIC_AUTH_TOKEN'].
     */
    authToken?: string | null | undefined;
    /**
     * Override the default base URL for the API, e.g., "https://api.example.com/v2/"
     *
     * Defaults to process.env['ANTHROPIC_BASE_URL'].
     */
    baseURL?: string | null | undefined;
    /**
     * The maximum amount of time (in milliseconds) that the client should wait for a response
     * from the server before timing out a single request.
     *
     * Note that request timeouts are retried by default, so in a worst-case scenario you may wait
     * much longer than this timeout before the promise succeeds or fails.
     *
     * @unit milliseconds
     */
    timeout?: number | undefined;
    /**
     * Additional `RequestInit` options to be passed to `fetch` calls.
     * Properties will be overridden by per-request `fetchOptions`.
     */
    fetchOptions?: MergedRequestInit | undefined;
    /**
     * Specify a custom `fetch` function implementation.
     *
     * If not provided, we expect that `fetch` is defined globally.
     */
    fetch?: Fetch | undefined;
    /**
     * The maximum number of times that the client will retry a request in case of a
     * temporary failure, like a network error or a 5XX error from the server.
     *
     * @default 2
     */
    maxRetries?: number | undefined;
    /**
     * Default headers to include with every request to the API.
     *
     * These can be removed in individual requests by explicitly setting the
     * header to `null` in request options.
     */
    defaultHeaders?: HeadersLike | undefined;
    /**
     * Default query parameters to include with every request to the API.
     *
     * These can be removed in individual requests by explicitly setting the
     * param to `undefined` in request options.
     */
    defaultQuery?: Record<string, string | undefined> | undefined;
    /**
     * By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
     * Only set this option to `true` if you understand the risks and have appropriate mitigations in place.
     */
    dangerouslyAllowBrowser?: boolean | undefined;
    /**
     * Set the log level.
     *
     * Defaults to process.env['ANTHROPIC_LOG'] or 'warn' if it isn't set.
     */
    logLevel?: LogLevel | undefined;
    /**
     * Set the logger.
     *
     * Defaults to globalThis.console.
     */
    logger?: Logger | undefined;
}
export declare const HUMAN_PROMPT = "\\n\\nHuman:";
export declare const AI_PROMPT = "\\n\\nAssistant:";
/**
 * Base class for Anthropic API clients.
 */
export declare class BaseAnthropic {
    #private;
    apiKey: string | null;
    authToken: string | null;
    baseURL: string;
    maxRetries: number;
    timeout: number;
    logger: Logger;
    logLevel: LogLevel | undefined;
    fetchOptions: MergedRequestInit | undefined;
    private fetch;
    protected idempotencyHeader?: string;
    protected _options: ClientOptions;
    /**
     * API Client for interfacing with the Anthropic API.
     *
     * @param {string | null | undefined} [opts.apiKey=process.env['ANTHROPIC_API_KEY'] ?? null]
     * @param {string | null | undefined} [opts.authToken=process.env['ANTHROPIC_AUTH_TOKEN'] ?? null]
     * @param {string} [opts.baseURL=process.env['ANTHROPIC_BASE_URL'] ?? https://api.anthropic.com] - Override the default base URL for the API.
     * @param {number} [opts.timeout=10 minutes] - The maximum amount of time (in milliseconds) the client will wait for a response before timing out.
     * @param {MergedRequestInit} [opts.fetchOptions] - Additional `RequestInit` options to be passed to `fetch` calls.
     * @param {Fetch} [opts.fetch] - Specify a custom `fetch` function implementation.
     * @param {number} [opts.maxRetries=2] - The maximum number of times the client will retry a request.
     * @param {HeadersLike} opts.defaultHeaders - Default headers to include with every request to the API.
     * @param {Record<string, string | undefined>} opts.defaultQuery - Default query parameters to include with every request to the API.
     * @param {boolean} [opts.dangerouslyAllowBrowser=false] - By default, client-side use of this library is not allowed, as it risks exposing your secret API credentials to attackers.
     */
    constructor({ baseURL, apiKey, authToken, ...opts }?: ClientOptions);
    /**
     * Create a new client instance re-using the same options given to the current client with optional overriding.
     */
    withOptions(options: Partial<ClientOptions>): this;
    protected defaultQuery(): Record<string, string | undefined> | undefined;
    protected validateHeaders({ values, nulls }: NullableHeaders): void;
    protected authHeaders(opts: FinalRequestOptions): Promise<NullableHeaders | undefined>;
    protected apiKeyAuth(opts: FinalRequestOptions): Promise<NullableHeaders | undefined>;
    protected bearerAuth(opts: FinalRequestOptions): Promise<NullableHeaders | undefined>;
    /**
     * Basic re-implementation of `qs.stringify` for primitive types.
     */
    protected stringifyQuery(query: object | Record<string, unknown>): string;
    private getUserAgent;
    protected defaultIdempotencyKey(): string;
    protected makeStatusError(status: number, error: Object, message: string | undefined, headers: Headers): Errors.APIError;
    buildURL(path: string, query: Record<string, unknown> | null | undefined, defaultBaseURL?: string | undefined): string;
    _calculateNonstreamingTimeout(maxTokens: number): number;
    /**
     * Used as a callback for mutating the given `FinalRequestOptions` object.
     */
    protected prepareOptions(options: FinalRequestOptions): Promise<void>;
    /**
     * Used as a callback for mutating the given `RequestInit` object.
     *
     * This is useful for cases where you want to add certain headers based off of
     * the request properties, e.g. `method` or `url`.
     */
    protected prepareRequest(request: RequestInit, { url, options }: {
        url: string;
        options: FinalRequestOptions;
    }): Promise<void>;
    get<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    post<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    patch<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    put<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    delete<Rsp>(path: string, opts?: PromiseOrValue<RequestOptions>): APIPromise<Rsp>;
    private methodRequest;
    request<Rsp>(options: PromiseOrValue<FinalRequestOptions>, remainingRetries?: number | null): APIPromise<Rsp>;
    private makeRequest;
    getAPIList<Item, PageClass extends Pagination.AbstractPage<Item> = Pagination.AbstractPage<Item>>(path: string, Page: new (...args: any[]) => PageClass, opts?: PromiseOrValue<RequestOptions>): Pagination.PagePromise<PageClass, Item>;
    requestAPIList<Item = unknown, PageClass extends Pagination.AbstractPage<Item> = Pagination.AbstractPage<Item>>(Page: new (...args: ConstructorParameters<typeof Pagination.AbstractPage>) => PageClass, options: PromiseOrValue<FinalRequestOptions>): Pagination.PagePromise<PageClass, Item>;
    fetchWithTimeout(url: RequestInfo, init: RequestInit | undefined, ms: number, controller: AbortController): Promise<Response>;
    private shouldRetry;
    private retryRequest;
    private calculateDefaultRetryTimeoutMillis;
    calculateNonstreamingTimeout(maxTokens: number, maxNonstreamingTokens?: number): number;
    buildRequest(inputOptions: FinalRequestOptions, { retryCount }?: {
        retryCount?: number;
    }): Promise<{
        req: FinalizedRequestInit;
        url: string;
        timeout: number;
    }>;
    private buildHeaders;
    private _makeAbort;
    private buildBody;
    static Anthropic: typeof BaseAnthropic;
    static HUMAN_PROMPT: string;
    static AI_PROMPT: string;
    static DEFAULT_TIMEOUT: number;
    static AnthropicError: typeof Errors.AnthropicError;
    static APIError: typeof Errors.APIError;
    static APIConnectionError: typeof Errors.APIConnectionError;
    static APIConnectionTimeoutError: typeof Errors.APIConnectionTimeoutError;
    static APIUserAbortError: typeof Errors.APIUserAbortError;
    static NotFoundError: typeof Errors.NotFoundError;
    static ConflictError: typeof Errors.ConflictError;
    static RateLimitError: typeof Errors.RateLimitError;
    static BadRequestError: typeof Errors.BadRequestError;
    static AuthenticationError: typeof Errors.AuthenticationError;
    static InternalServerError: typeof Errors.InternalServerError;
    static PermissionDeniedError: typeof Errors.PermissionDeniedError;
    static UnprocessableEntityError: typeof Errors.UnprocessableEntityError;
    static toFile: typeof Uploads.toFile;
}
/**
 * API Client for interfacing with the Anthropic API.
 */
export declare class Anthropic extends BaseAnthropic {
    completions: API.Completions;
    messages: API.Messages;
    models: API.Models;
    beta: API.Beta;
}
export declare namespace Anthropic {
    export type RequestOptions = Opts.RequestOptions;
    export type { ApiKeySetter };
    export import Page = Pagination.Page;
    export { type PageParams as PageParams, type PageResponse as PageResponse };
    export import TokenPage = Pagination.TokenPage;
    export { type TokenPageParams as TokenPageParams, type TokenPageResponse as TokenPageResponse };
    export import PageCursor = Pagination.PageCursor;
    export { type PageCursorParams as PageCursorParams, type PageCursorResponse as PageCursorResponse };
    export { Completions as Completions, type Completion as Completion, type CompletionCreateParams as CompletionCreateParams, type CompletionCreateParamsNonStreaming as CompletionCreateParamsNonStreaming, type CompletionCreateParamsStreaming as CompletionCreateParamsStreaming, };
    export { Messages as Messages, type Base64ImageSource as Base64ImageSource, type Base64PDFSource as Base64PDFSource, type BashCodeExecutionOutputBlock as BashCodeExecutionOutputBlock, type BashCodeExecutionOutputBlockParam as BashCodeExecutionOutputBlockParam, type BashCodeExecutionResultBlock as BashCodeExecutionResultBlock, type BashCodeExecutionResultBlockParam as BashCodeExecutionResultBlockParam, type BashCodeExecutionToolResultBlock as BashCodeExecutionToolResultBlock, type BashCodeExecutionToolResultBlockParam as BashCodeExecutionToolResultBlockParam, type BashCodeExecutionToolResultError as BashCodeExecutionToolResultError, type BashCodeExecutionToolResultErrorCode as BashCodeExecutionToolResultErrorCode, type BashCodeExecutionToolResultErrorParam as BashCodeExecutionToolResultErrorParam, type CacheControlEphemeral as CacheControlEphemeral, type CacheCreation as CacheCreation, type CitationCharLocation as CitationCharLocation, type CitationCharLocationParam as CitationCharLocationParam, type CitationContentBlockLocation as CitationContentBlockLocation, type CitationContentBlockLocationParam as CitationContentBlockLocationParam, type CitationPageLocation as CitationPageLocation, type CitationPageLocationParam as CitationPageLocationParam, type CitationSearchResultLocationParam as CitationSearchResultLocationParam, type CitationWebSearchResultLocationParam as CitationWebSearchResultLocationParam, type CitationsConfig as CitationsConfig, type CitationsConfigParam as CitationsConfigParam, type CitationsDelta as CitationsDelta, type CitationsSearchResultLocation as CitationsSearchResultLocation, type CitationsWebSearchResultLocation as CitationsWebSearchResultLocation, type CodeExecutionOutputBlock as CodeExecutionOutputBlock, type CodeExecutionOutputBlockParam as CodeExecutionOutputBlockParam, type CodeExecutionResultBlock as CodeExecutionResultBlock, type CodeExecutionResultBlockParam as CodeExecutionResultBlockParam, type CodeExecutionTool20250522 as CodeExecutionTool20250522, type CodeExecutionTool20250825 as CodeExecutionTool20250825, type CodeExecutionTool20260120 as CodeExecutionTool20260120, type CodeExecutionToolResultBlock as CodeExecutionToolResultBlock, type CodeExecutionToolResultBlockContent as CodeExecutionToolResultBlockContent, type CodeExecutionToolResultBlockParam as CodeExecutionToolResultBlockParam, type CodeExecutionToolResultBlockParamContent as CodeExecutionToolResultBlockParamContent, type CodeExecutionToolResultError as CodeExecutionToolResultError, type CodeExecutionToolResultErrorCode as CodeExecutionToolResultErrorCode, type CodeExecutionToolResultErrorParam as CodeExecutionToolResultErrorParam, type Container as Container, type ContainerUploadBlock as ContainerUploadBlock, type ContainerUploadBlockParam as ContainerUploadBlockParam, type ContentBlock as ContentBlock, type ContentBlockDeltaEvent as ContentBlockDeltaEvent, type ContentBlockParam as ContentBlockParam, type ContentBlockStartEvent as ContentBlockStartEvent, type ContentBlockStopEvent as ContentBlockStopEvent, type ContentBlockSource as ContentBlockSource, type ContentBlockSourceContent as ContentBlockSourceContent, type DirectCaller as DirectCaller, type DocumentBlock as DocumentBlock, type DocumentBlockParam as DocumentBlockParam, type EncryptedCodeExecutionResultBlock as EncryptedCodeExecutionResultBlock, type EncryptedCodeExecutionResultBlockParam as EncryptedCodeExecutionResultBlockParam, type ImageBlockParam as ImageBlockParam, type InputJSONDelta as InputJSONDelta, type JSONOutputFormat as JSONOutputFormat, type MemoryTool20250818 as MemoryTool20250818, type Message as Message, type MessageCountTokensTool as MessageCountTokensTool, type MessageDeltaEvent as MessageDeltaEvent, type MessageDeltaUsage as MessageDeltaUsage, type MessageParam as MessageParam, type MessageStartEvent as MessageStartEvent, type MessageStopEvent as MessageStopEvent, type MessageStreamEvent as MessageStreamEvent, type MessageTokensCount as MessageTokensCount, type Metadata as Metadata, type Model as Model, type OutputConfig as OutputConfig, type PlainTextSource as PlainTextSource, type RawContentBlockDelta as RawContentBlockDelta, type RawContentBlockDeltaEvent as RawContentBlockDeltaEvent, type RawContentBlockStartEvent as RawContentBlockStartEvent, type RawContentBlockStopEvent as RawContentBlockStopEvent, type RawMessageDeltaEvent as RawMessageDeltaEvent, type RawMessageStartEvent as RawMessageStartEvent, type RawMessageStopEvent as RawMessageStopEvent, type RawMessageStreamEvent as RawMessageStreamEvent, type RedactedThinkingBlock as RedactedThinkingBlock, type RedactedThinkingBlockParam as RedactedThinkingBlockParam, type SearchResultBlockParam as SearchResultBlockParam, type ServerToolCaller as ServerToolCaller, type ServerToolCaller20260120 as ServerToolCaller20260120, type ServerToolUsage as ServerToolUsage, type ServerToolUseBlock as ServerToolUseBlock, type ServerToolUseBlockParam as ServerToolUseBlockParam, type SignatureDelta as SignatureDelta, type StopReason as StopReason, type TextBlock as TextBlock, type TextBlockParam as TextBlockParam, type TextCitation as TextCitation, type TextCitationParam as TextCitationParam, type TextDelta as TextDelta, type TextEditorCodeExecutionCreateResultBlock as TextEditorCodeExecutionCreateResultBlock, type TextEditorCodeExecutionCreateResultBlockParam as TextEditorCodeExecutionCreateResultBlockParam, type TextEditorCodeExecutionStrReplaceResultBlock as TextEditorCodeExecutionStrReplaceResultBlock, type TextEditorCodeExecutionStrReplaceResultBlockParam as TextEditorCodeExecutionStrReplaceResultBlockParam, type TextEditorCodeExecutionToolResultBlock as TextEditorCodeExecutionToolResultBlock, type TextEditorCodeExecutionToolResultBlockParam as TextEditorCodeExecutionToolResultBlockParam, type TextEditorCodeExecutionToolResultError as TextEditorCodeExecutionToolResultError, type TextEditorCodeExecutionToolResultErrorCode as TextEditorCodeExecutionToolResultErrorCode, type TextEditorCodeExecutionToolResultErrorParam as TextEditorCodeExecutionToolResultErrorParam, type TextEditorCodeExecutionViewResultBlock as TextEditorCodeExecutionViewResultBlock, type TextEditorCodeExecutionViewResultBlockParam as TextEditorCodeExecutionViewResultBlockParam, type ThinkingBlock as ThinkingBlock, type ThinkingBlockParam as ThinkingBlockParam, type ThinkingConfigAdaptive as ThinkingConfigAdaptive, type ThinkingConfigDisabled as ThinkingConfigDisabled, type ThinkingConfigEnabled as ThinkingConfigEnabled, type ThinkingConfigParam as ThinkingConfigParam, type ThinkingDelta as ThinkingDelta, type Tool as Tool, type ToolBash20250124 as ToolBash20250124, type ToolChoice as ToolChoice, type ToolChoiceAny as ToolChoiceAny, type ToolChoiceAuto as ToolChoiceAuto, type ToolChoiceNone as ToolChoiceNone, type ToolChoiceTool as ToolChoiceTool, type ToolReferenceBlock as ToolReferenceBlock, type ToolReferenceBlockParam as ToolReferenceBlockParam, type ToolResultBlockParam as ToolResultBlockParam, type ToolSearchToolBm25_20251119 as ToolSearchToolBm25_20251119, type ToolSearchToolRegex20251119 as ToolSearchToolRegex20251119, type ToolSearchToolResultBlock as ToolSearchToolResultBlock, type ToolSearchToolResultBlockParam as ToolSearchToolResultBlockParam, type ToolSearchToolResultError as ToolSearchToolResultError, type ToolSearchToolResultErrorCode as ToolSearchToolResultErrorCode, type ToolSearchToolResultErrorParam as ToolSearchToolResultErrorParam, type ToolSearchToolSearchResultBlock as ToolSearchToolSearchResultBlock, type ToolSearchToolSearchResultBlockParam as ToolSearchToolSearchResultBlockParam, type ToolTextEditor20250124 as ToolTextEditor20250124, type ToolTextEditor20250429 as ToolTextEditor20250429, type ToolTextEditor20250728 as ToolTextEditor20250728, type ToolUnion as ToolUnion, type ToolUseBlock as ToolUseBlock, type ToolUseBlockParam as ToolUseBlockParam, type URLImageSource as URLImageSource, type URLPDFSource as URLPDFSource, type Usage as Usage, type UserLocation as UserLocation, type WebFetchBlock as WebFetchBlock, type WebFetchBlockParam as WebFetchBlockParam, type WebFetchTool20250910 as WebFetchTool20250910, type WebFetchTool20260209 as WebFetchTool20260209, type WebFetchTool20260309 as WebFetchTool20260309, type WebFetchToolResultBlock as WebFetchToolResultBlock, type WebFetchToolResultBlockParam as WebFetchToolResultBlockParam, type WebFetchToolResultErrorBlock as WebFetchToolResultErrorBlock, type WebFetchToolResultErrorBlockParam as WebFetchToolResultErrorBlockParam, type WebFetchToolResultErrorCode as WebFetchToolResultErrorCode, type WebSearchResultBlock as WebSearchResultBlock, type WebSearchResultBlockParam as WebSearchResultBlockParam, type WebSearchTool20250305 as WebSearchTool20250305, type WebSearchTool20260209 as WebSearchTool20260209, type WebSearchToolRequestError as WebSearchToolRequestError, type WebSearchToolResultBlock as WebSearchToolResultBlock, type WebSearchToolResultBlockContent as WebSearchToolResultBlockContent, type WebSearchToolResultBlockParam as WebSearchToolResultBlockParam, type WebSearchToolResultBlockParamContent as WebSearchToolResultBlockParamContent, type WebSearchToolResultError as WebSearchToolResultError, type WebSearchToolResultErrorCode as WebSearchToolResultErrorCode, type MessageCreateParams as MessageCreateParams, type MessageCreateParamsNonStreaming as MessageCreateParamsNonStreaming, type MessageCreateParamsStreaming as MessageCreateParamsStreaming, type MessageStreamParams as MessageStreamParams, type MessageCountTokensParams as MessageCountTokensParams, };
    export { Models as Models, type CapabilitySupport as CapabilitySupport, type ContextManagementCapability as ContextManagementCapability, type EffortCapability as EffortCapability, type ModelCapabilities as ModelCapabilities, type ModelInfo as ModelInfo, type ThinkingCapability as ThinkingCapability, type ThinkingTypes as ThinkingTypes, type ModelInfosPage as ModelInfosPage, type ModelRetrieveParams as ModelRetrieveParams, type ModelListParams as ModelListParams, };
    export { Beta as Beta, type AnthropicBeta as AnthropicBeta, type BetaAPIError as BetaAPIError, type BetaAuthenticationError as BetaAuthenticationError, type BetaBillingError as BetaBillingError, type BetaError as BetaError, type BetaErrorResponse as BetaErrorResponse, type BetaGatewayTimeoutError as BetaGatewayTimeoutError, type BetaInvalidRequestError as BetaInvalidRequestError, type BetaNotFoundError as BetaNotFoundError, type BetaOverloadedError as BetaOverloadedError, type BetaPermissionError as BetaPermissionError, type BetaRateLimitError as BetaRateLimitError, };
    export type APIErrorObject = API.APIErrorObject;
    export type AuthenticationError = API.AuthenticationError;
    export type BillingError = API.BillingError;
    export type ErrorObject = API.ErrorObject;
    export type ErrorResponse = API.ErrorResponse;
    export type ErrorType = API.ErrorType;
    export type GatewayTimeoutError = API.GatewayTimeoutError;
    export type InvalidRequestError = API.InvalidRequestError;
    export type NotFoundError = API.NotFoundError;
    export type OverloadedError = API.OverloadedError;
    export type PermissionError = API.PermissionError;
    export type RateLimitError = API.RateLimitError;
}
//# sourceMappingURL=client.d.ts.map