Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });

const GOOGLE_GENAI_INTEGRATION_NAME = 'Google_GenAI';

// https://ai.google.dev/api/rest/v1/models/generateContent
// https://ai.google.dev/api/rest/v1/chats/sendMessage
// https://googleapis.github.io/js-genai/release_docs/classes/models.Models.html#generatecontentstream
// https://googleapis.github.io/js-genai/release_docs/classes/chats.Chat.html#sendmessagestream
const GOOGLE_GENAI_METHOD_REGISTRY = {
  'models.generateContent': { operation: 'generate_content' },
  'models.generateContentStream': { operation: 'generate_content', streaming: true },
  'models.embedContent': { operation: 'embeddings' },
  'chats.create': { operation: 'chat' },
  // chat.* paths are built by createDeepProxy when it proxies the chat instance with CHAT_PATH as base
  'chat.sendMessage': { operation: 'chat' },
  'chat.sendMessageStream': { operation: 'chat', streaming: true },
} ;

// Constants for internal use
const GOOGLE_GENAI_SYSTEM_NAME = 'google_genai';
const CHATS_CREATE_METHOD = 'chats.create';
const CHAT_PATH = 'chat';

exports.CHATS_CREATE_METHOD = CHATS_CREATE_METHOD;
exports.CHAT_PATH = CHAT_PATH;
exports.GOOGLE_GENAI_INTEGRATION_NAME = GOOGLE_GENAI_INTEGRATION_NAME;
exports.GOOGLE_GENAI_METHOD_REGISTRY = GOOGLE_GENAI_METHOD_REGISTRY;
exports.GOOGLE_GENAI_SYSTEM_NAME = GOOGLE_GENAI_SYSTEM_NAME;
//# sourceMappingURL=constants.js.map
