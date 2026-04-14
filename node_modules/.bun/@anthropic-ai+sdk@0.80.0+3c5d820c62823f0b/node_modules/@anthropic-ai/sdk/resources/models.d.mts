import { APIResource } from "../core/resource.mjs";
import * as BetaAPI from "./beta/beta.mjs";
import { APIPromise } from "../core/api-promise.mjs";
import { Page, type PageParams, PagePromise } from "../core/pagination.mjs";
import { RequestOptions } from "../internal/request-options.mjs";
export declare class Models extends APIResource {
    /**
     * Get a specific model.
     *
     * The Models API response can be used to determine information about a specific
     * model or resolve a model alias to a model ID.
     */
    retrieve(modelID: string, params?: ModelRetrieveParams | null | undefined, options?: RequestOptions): APIPromise<ModelInfo>;
    /**
     * List available models.
     *
     * The Models API response can be used to determine which models are available for
     * use in the API. More recently released models are listed first.
     */
    list(params?: ModelListParams | null | undefined, options?: RequestOptions): PagePromise<ModelInfosPage, ModelInfo>;
}
export type ModelInfosPage = Page<ModelInfo>;
/**
 * Indicates whether a capability is supported.
 */
export interface CapabilitySupport {
    /**
     * Whether this capability is supported by the model.
     */
    supported: boolean;
}
/**
 * Context management capability details.
 */
export interface ContextManagementCapability {
    /**
     * Indicates whether a capability is supported.
     */
    clear_thinking_20251015: CapabilitySupport | null;
    /**
     * Indicates whether a capability is supported.
     */
    clear_tool_uses_20250919: CapabilitySupport | null;
    /**
     * Indicates whether a capability is supported.
     */
    compact_20260112: CapabilitySupport | null;
    /**
     * Whether this capability is supported by the model.
     */
    supported: boolean;
}
/**
 * Effort (reasoning_effort) capability details.
 */
export interface EffortCapability {
    /**
     * Whether the model supports high effort level.
     */
    high: CapabilitySupport;
    /**
     * Whether the model supports low effort level.
     */
    low: CapabilitySupport;
    /**
     * Whether the model supports max effort level.
     */
    max: CapabilitySupport;
    /**
     * Whether the model supports medium effort level.
     */
    medium: CapabilitySupport;
    /**
     * Whether this capability is supported by the model.
     */
    supported: boolean;
}
/**
 * Model capability information.
 */
export interface ModelCapabilities {
    /**
     * Whether the model supports the Batch API.
     */
    batch: CapabilitySupport;
    /**
     * Whether the model supports citation generation.
     */
    citations: CapabilitySupport;
    /**
     * Whether the model supports code execution tools.
     */
    code_execution: CapabilitySupport;
    /**
     * Context management support and available strategies.
     */
    context_management: ContextManagementCapability;
    /**
     * Effort (reasoning_effort) support and available levels.
     */
    effort: EffortCapability;
    /**
     * Whether the model accepts image content blocks.
     */
    image_input: CapabilitySupport;
    /**
     * Whether the model accepts PDF content blocks.
     */
    pdf_input: CapabilitySupport;
    /**
     * Whether the model supports structured output / JSON mode / strict tool schemas.
     */
    structured_outputs: CapabilitySupport;
    /**
     * Thinking capability and supported type configurations.
     */
    thinking: ThinkingCapability;
}
export interface ModelInfo {
    /**
     * Unique model identifier.
     */
    id: string;
    /**
     * Model capability information.
     */
    capabilities: ModelCapabilities | null;
    /**
     * RFC 3339 datetime string representing the time at which the model was released.
     * May be set to an epoch value if the release date is unknown.
     */
    created_at: string;
    /**
     * A human-readable name for the model.
     */
    display_name: string;
    /**
     * Maximum input context window size in tokens for this model.
     */
    max_input_tokens: number | null;
    /**
     * Maximum value for the `max_tokens` parameter when using this model.
     */
    max_tokens: number | null;
    /**
     * Object type.
     *
     * For Models, this is always `"model"`.
     */
    type: 'model';
}
/**
 * Thinking capability details.
 */
export interface ThinkingCapability {
    /**
     * Whether this capability is supported by the model.
     */
    supported: boolean;
    /**
     * Supported thinking type configurations.
     */
    types: ThinkingTypes;
}
/**
 * Supported thinking type configurations.
 */
export interface ThinkingTypes {
    /**
     * Whether the model supports thinking with type 'adaptive' (auto).
     */
    adaptive: CapabilitySupport;
    /**
     * Whether the model supports thinking with type 'enabled'.
     */
    enabled: CapabilitySupport;
}
export interface ModelRetrieveParams {
    /**
     * Optional header to specify the beta version(s) you want to use.
     */
    betas?: Array<BetaAPI.AnthropicBeta>;
}
export interface ModelListParams extends PageParams {
    /**
     * Header param: Optional header to specify the beta version(s) you want to use.
     */
    betas?: Array<BetaAPI.AnthropicBeta>;
}
export declare namespace Models {
    export { type CapabilitySupport as CapabilitySupport, type ContextManagementCapability as ContextManagementCapability, type EffortCapability as EffortCapability, type ModelCapabilities as ModelCapabilities, type ModelInfo as ModelInfo, type ThinkingCapability as ThinkingCapability, type ThinkingTypes as ThinkingTypes, type ModelInfosPage as ModelInfosPage, type ModelRetrieveParams as ModelRetrieveParams, type ModelListParams as ModelListParams, };
}
//# sourceMappingURL=models.d.mts.map