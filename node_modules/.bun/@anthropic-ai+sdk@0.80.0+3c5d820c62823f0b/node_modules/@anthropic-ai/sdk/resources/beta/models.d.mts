import { APIResource } from "../../core/resource.mjs";
import * as BetaAPI from "./beta.mjs";
import { APIPromise } from "../../core/api-promise.mjs";
import { Page, type PageParams, PagePromise } from "../../core/pagination.mjs";
import { RequestOptions } from "../../internal/request-options.mjs";
export declare class Models extends APIResource {
    /**
     * Get a specific model.
     *
     * The Models API response can be used to determine information about a specific
     * model or resolve a model alias to a model ID.
     *
     * @example
     * ```ts
     * const betaModelInfo = await client.beta.models.retrieve(
     *   'model_id',
     * );
     * ```
     */
    retrieve(modelID: string, params?: ModelRetrieveParams | null | undefined, options?: RequestOptions): APIPromise<BetaModelInfo>;
    /**
     * List available models.
     *
     * The Models API response can be used to determine which models are available for
     * use in the API. More recently released models are listed first.
     *
     * @example
     * ```ts
     * // Automatically fetches more pages as needed.
     * for await (const betaModelInfo of client.beta.models.list()) {
     *   // ...
     * }
     * ```
     */
    list(params?: ModelListParams | null | undefined, options?: RequestOptions): PagePromise<BetaModelInfosPage, BetaModelInfo>;
}
export type BetaModelInfosPage = Page<BetaModelInfo>;
/**
 * Indicates whether a capability is supported.
 */
export interface BetaCapabilitySupport {
    /**
     * Whether this capability is supported by the model.
     */
    supported: boolean;
}
/**
 * Context management capability details.
 */
export interface BetaContextManagementCapability {
    /**
     * Indicates whether a capability is supported.
     */
    clear_thinking_20251015: BetaCapabilitySupport | null;
    /**
     * Indicates whether a capability is supported.
     */
    clear_tool_uses_20250919: BetaCapabilitySupport | null;
    /**
     * Indicates whether a capability is supported.
     */
    compact_20260112: BetaCapabilitySupport | null;
    /**
     * Whether this capability is supported by the model.
     */
    supported: boolean;
}
/**
 * Effort (reasoning_effort) capability details.
 */
export interface BetaEffortCapability {
    /**
     * Whether the model supports high effort level.
     */
    high: BetaCapabilitySupport;
    /**
     * Whether the model supports low effort level.
     */
    low: BetaCapabilitySupport;
    /**
     * Whether the model supports max effort level.
     */
    max: BetaCapabilitySupport;
    /**
     * Whether the model supports medium effort level.
     */
    medium: BetaCapabilitySupport;
    /**
     * Whether this capability is supported by the model.
     */
    supported: boolean;
}
/**
 * Model capability information.
 */
export interface BetaModelCapabilities {
    /**
     * Whether the model supports the Batch API.
     */
    batch: BetaCapabilitySupport;
    /**
     * Whether the model supports citation generation.
     */
    citations: BetaCapabilitySupport;
    /**
     * Whether the model supports code execution tools.
     */
    code_execution: BetaCapabilitySupport;
    /**
     * Context management support and available strategies.
     */
    context_management: BetaContextManagementCapability;
    /**
     * Effort (reasoning_effort) support and available levels.
     */
    effort: BetaEffortCapability;
    /**
     * Whether the model accepts image content blocks.
     */
    image_input: BetaCapabilitySupport;
    /**
     * Whether the model accepts PDF content blocks.
     */
    pdf_input: BetaCapabilitySupport;
    /**
     * Whether the model supports structured output / JSON mode / strict tool schemas.
     */
    structured_outputs: BetaCapabilitySupport;
    /**
     * Thinking capability and supported type configurations.
     */
    thinking: BetaThinkingCapability;
}
export interface BetaModelInfo {
    /**
     * Unique model identifier.
     */
    id: string;
    /**
     * Model capability information.
     */
    capabilities: BetaModelCapabilities | null;
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
export interface BetaThinkingCapability {
    /**
     * Whether this capability is supported by the model.
     */
    supported: boolean;
    /**
     * Supported thinking type configurations.
     */
    types: BetaThinkingTypes;
}
/**
 * Supported thinking type configurations.
 */
export interface BetaThinkingTypes {
    /**
     * Whether the model supports thinking with type 'adaptive' (auto).
     */
    adaptive: BetaCapabilitySupport;
    /**
     * Whether the model supports thinking with type 'enabled'.
     */
    enabled: BetaCapabilitySupport;
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
    export { type BetaCapabilitySupport as BetaCapabilitySupport, type BetaContextManagementCapability as BetaContextManagementCapability, type BetaEffortCapability as BetaEffortCapability, type BetaModelCapabilities as BetaModelCapabilities, type BetaModelInfo as BetaModelInfo, type BetaThinkingCapability as BetaThinkingCapability, type BetaThinkingTypes as BetaThinkingTypes, type BetaModelInfosPage as BetaModelInfosPage, type ModelRetrieveParams as ModelRetrieveParams, type ModelListParams as ModelListParams, };
}
//# sourceMappingURL=models.d.mts.map