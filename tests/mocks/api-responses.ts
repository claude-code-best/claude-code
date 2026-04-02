export const mockStreamResponse = {
  type: "message_start" as const,
  message: {
    id: "msg_mock_001",
    type: "message" as const,
    role: "assistant",
    content: [],
    model: "claude-sonnet-4-20250514",
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 100, output_tokens: 0 },
  },
};

export const mockTextBlock = {
  type: "content_block_start" as const,
  index: 0,
  content_block: { type: "text" as const, text: "Mock response" },
};

export const mockToolUseBlock = {
  type: "content_block_start" as const,
  index: 1,
  content_block: {
    type: "tool_use" as const,
    id: "toolu_mock_001",
    name: "Read",
    input: { file_path: "/tmp/test.txt" },
  },
};

export const mockEndEvent = {
  type: "message_stop" as const,
};
