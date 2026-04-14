export declare const GOOGLE_GENAI_INTEGRATION_NAME = "Google_GenAI";
export declare const GOOGLE_GENAI_METHOD_REGISTRY: {
    readonly 'models.generateContent': {
        readonly operation: "generate_content";
    };
    readonly 'models.generateContentStream': {
        readonly operation: "generate_content";
        readonly streaming: true;
    };
    readonly 'models.embedContent': {
        readonly operation: "embeddings";
    };
    readonly 'chats.create': {
        readonly operation: "chat";
    };
    readonly 'chat.sendMessage': {
        readonly operation: "chat";
    };
    readonly 'chat.sendMessageStream': {
        readonly operation: "chat";
        readonly streaming: true;
    };
};
export declare const GOOGLE_GENAI_SYSTEM_NAME = "google_genai";
export declare const CHATS_CREATE_METHOD = "chats.create";
export declare const CHAT_PATH = "chat";
//# sourceMappingURL=constants.d.ts.map