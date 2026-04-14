import { Span } from '../../types-hoist/span';
import { ChatCompletionChunk, OpenAiChatCompletionObject, OpenAIConversationObject, OpenAICreateEmbeddingsObject, OpenAIResponseObject, ResponseStreamingEvent } from './types';
/**
 * Check if response is a Chat Completion object
 */
export declare function isChatCompletionResponse(response: unknown): response is OpenAiChatCompletionObject;
/**
 * Check if response is a Responses API object
 */
export declare function isResponsesApiResponse(response: unknown): response is OpenAIResponseObject;
/**
 * Check if response is an Embeddings API object
 */
export declare function isEmbeddingsResponse(response: unknown): response is OpenAICreateEmbeddingsObject;
/**
 * Check if response is a Conversations API object
 * @see https://platform.openai.com/docs/api-reference/conversations
 */
export declare function isConversationResponse(response: unknown): response is OpenAIConversationObject;
/**
 * Check if streaming event is from the Responses API
 */
export declare function isResponsesApiStreamEvent(event: unknown): event is ResponseStreamingEvent;
/**
 * Check if streaming event is a chat completion chunk
 */
export declare function isChatCompletionChunk(event: unknown): event is ChatCompletionChunk;
/**
 * Add attributes for Chat Completion responses
 */
export declare function addChatCompletionAttributes(span: Span, response: OpenAiChatCompletionObject, recordOutputs?: boolean): void;
/**
 * Add attributes for Responses API responses
 */
export declare function addResponsesApiAttributes(span: Span, response: OpenAIResponseObject, recordOutputs?: boolean): void;
/**
 * Add attributes for Embeddings API responses
 */
export declare function addEmbeddingsAttributes(span: Span, response: OpenAICreateEmbeddingsObject): void;
/**
 * Add attributes for Conversations API responses
 * @see https://platform.openai.com/docs/api-reference/conversations
 */
export declare function addConversationAttributes(span: Span, response: OpenAIConversationObject): void;
/**
 * Set token usage attributes
 * @param span - The span to add attributes to
 * @param promptTokens - The number of prompt tokens
 * @param completionTokens - The number of completion tokens
 * @param totalTokens - The number of total tokens
 */
export declare function setTokenUsageAttributes(span: Span, promptTokens?: number, completionTokens?: number, totalTokens?: number): void;
/**
 * Set common response attributes
 * @param span - The span to add attributes to
 * @param id - The response id
 * @param model - The response model
 * @param timestamp - The response timestamp
 */
export declare function setCommonResponseAttributes(span: Span, id: string, model: string, timestamp: number): void;
/**
 * Extract request parameters including model settings and conversation context
 */
export declare function extractRequestParameters(params: Record<string, unknown>): Record<string, unknown>;
//# sourceMappingURL=utils.d.ts.map
