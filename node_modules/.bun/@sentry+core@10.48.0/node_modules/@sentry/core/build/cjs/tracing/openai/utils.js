Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const genAiAttributes = require('../ai/gen-ai-attributes.js');

/**
 * Check if streaming event is from the Responses API
 */
function isResponsesApiStreamEvent(event) {
  return (
    event !== null &&
    typeof event === 'object' &&
    'type' in event &&
    typeof (event ).type === 'string' &&
    ((event ).type ).startsWith('response.')
  );
}

/**
 * Check if streaming event is a chat completion chunk
 */
function isChatCompletionChunk(event) {
  return (
    event !== null &&
    typeof event === 'object' &&
    'object' in event &&
    (event ).object === 'chat.completion.chunk'
  );
}

/**
 * Add response attributes to a span using duck-typing.
 * Works for Chat Completions, Responses API, Embeddings, and Conversations API responses.
 */
function addResponseAttributes(span, result, recordOutputs) {
  if (!result || typeof result !== 'object') return;

  const response = result ;
  const attrs = {};

  // Response ID
  if (typeof response.id === 'string') {
    attrs[genAiAttributes.GEN_AI_RESPONSE_ID_ATTRIBUTE] = response.id;
  }

  // Response model
  if (typeof response.model === 'string') {
    attrs[genAiAttributes.GEN_AI_RESPONSE_MODEL_ATTRIBUTE] = response.model;
  }

  // Conversation ID (conversation objects use id as conversation link)
  if (response.object === 'conversation' && typeof response.id === 'string') {
    attrs[genAiAttributes.GEN_AI_CONVERSATION_ID_ATTRIBUTE] = response.id;
  }

  // Token usage — supports both naming conventions (chat: prompt_tokens/completion_tokens, responses: input_tokens/output_tokens)
  if (response.usage && typeof response.usage === 'object') {
    const usage = response.usage ;

    const inputTokens = usage.prompt_tokens ?? usage.input_tokens;
    if (typeof inputTokens === 'number') {
      attrs[genAiAttributes.GEN_AI_USAGE_INPUT_TOKENS_ATTRIBUTE] = inputTokens;
    }

    const outputTokens = usage.completion_tokens ?? usage.output_tokens;
    if (typeof outputTokens === 'number') {
      attrs[genAiAttributes.GEN_AI_USAGE_OUTPUT_TOKENS_ATTRIBUTE] = outputTokens;
    }

    if (typeof usage.total_tokens === 'number') {
      attrs[genAiAttributes.GEN_AI_USAGE_TOTAL_TOKENS_ATTRIBUTE] = usage.total_tokens;
    }
  }

  // Finish reasons from choices (chat completions)
  if (Array.isArray(response.choices)) {
    const choices = response.choices ;
    const finishReasons = choices
      .map(choice => choice.finish_reason)
      .filter((reason) => typeof reason === 'string');
    if (finishReasons.length > 0) {
      attrs[genAiAttributes.GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE] = JSON.stringify(finishReasons);
    }

    if (recordOutputs) {
      // Response text from choices
      const responseTexts = choices.map(choice => {
        const message = choice.message ;
        return (message?.content ) || '';
      });
      attrs[genAiAttributes.GEN_AI_RESPONSE_TEXT_ATTRIBUTE] = JSON.stringify(responseTexts);

      // Tool calls from choices
      const toolCalls = choices
        .map(choice => {
          const message = choice.message ;
          return message?.tool_calls;
        })
        .filter(calls => Array.isArray(calls) && calls.length > 0)
        .flat();

      if (toolCalls.length > 0) {
        attrs[genAiAttributes.GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE] = JSON.stringify(toolCalls);
      }
    }
  }

  // Finish reason from status (responses API)
  if (typeof response.status === 'string') {
    // Only set if not already set from choices
    if (!attrs[genAiAttributes.GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE]) {
      attrs[genAiAttributes.GEN_AI_RESPONSE_FINISH_REASONS_ATTRIBUTE] = JSON.stringify([response.status]);
    }
  }

  if (recordOutputs) {
    // Response text from output_text (responses API)
    if (typeof response.output_text === 'string' && !attrs[genAiAttributes.GEN_AI_RESPONSE_TEXT_ATTRIBUTE]) {
      attrs[genAiAttributes.GEN_AI_RESPONSE_TEXT_ATTRIBUTE] = response.output_text;
    }

    // Tool calls from output array (responses API)
    if (Array.isArray(response.output) && response.output.length > 0 && !attrs[genAiAttributes.GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE]) {
      const functionCalls = (response.output ).filter(
        item => item?.type === 'function_call',
      );
      if (functionCalls.length > 0) {
        attrs[genAiAttributes.GEN_AI_RESPONSE_TOOL_CALLS_ATTRIBUTE] = JSON.stringify(functionCalls);
      }
    }
  }

  span.setAttributes(attrs);
}

/**
 * Extract conversation ID from request parameters
 * Supports both Conversations API and previous_response_id chaining
 * @see https://platform.openai.com/docs/guides/conversation-state
 */
function extractConversationId(params) {
  // Conversations API: conversation parameter (e.g., "conv_...")
  if ('conversation' in params && typeof params.conversation === 'string') {
    return params.conversation;
  }
  // Responses chaining: previous_response_id links to parent response
  if ('previous_response_id' in params && typeof params.previous_response_id === 'string') {
    return params.previous_response_id;
  }
  return undefined;
}

/**
 * Extract request parameters including model settings and conversation context
 */
function extractRequestParameters(params) {
  const attributes = {
    [genAiAttributes.GEN_AI_REQUEST_MODEL_ATTRIBUTE]: params.model ?? 'unknown',
  };

  if ('temperature' in params) attributes[genAiAttributes.GEN_AI_REQUEST_TEMPERATURE_ATTRIBUTE] = params.temperature;
  if ('top_p' in params) attributes[genAiAttributes.GEN_AI_REQUEST_TOP_P_ATTRIBUTE] = params.top_p;
  if ('frequency_penalty' in params) attributes[genAiAttributes.GEN_AI_REQUEST_FREQUENCY_PENALTY_ATTRIBUTE] = params.frequency_penalty;
  if ('presence_penalty' in params) attributes[genAiAttributes.GEN_AI_REQUEST_PRESENCE_PENALTY_ATTRIBUTE] = params.presence_penalty;
  if ('stream' in params) attributes[genAiAttributes.GEN_AI_REQUEST_STREAM_ATTRIBUTE] = params.stream;
  if ('encoding_format' in params) attributes[genAiAttributes.GEN_AI_REQUEST_ENCODING_FORMAT_ATTRIBUTE] = params.encoding_format;
  if ('dimensions' in params) attributes[genAiAttributes.GEN_AI_REQUEST_DIMENSIONS_ATTRIBUTE] = params.dimensions;

  // Capture conversation ID for linking messages across API calls
  const conversationId = extractConversationId(params);
  if (conversationId) {
    attributes[genAiAttributes.GEN_AI_CONVERSATION_ID_ATTRIBUTE] = conversationId;
  }

  return attributes;
}

exports.addResponseAttributes = addResponseAttributes;
exports.extractRequestParameters = extractRequestParameters;
exports.isChatCompletionChunk = isChatCompletionChunk;
exports.isResponsesApiStreamEvent = isResponsesApiStreamEvent;
//# sourceMappingURL=utils.js.map
