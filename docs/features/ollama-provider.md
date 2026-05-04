# Ollama Native Provider

Claude Code Best supports Ollama through the native Ollama API, not the
OpenAI-compatible endpoint. This lets Cloud and local Ollama use the same
request shape for chat, tool calling, thinking, model discovery, and web
utilities.

## Configure

Use `/login` and choose `Ollama`, or configure these environment variables:

```bash
CLAUDE_CODE_USE_OLLAMA=1
OLLAMA_API_KEY=ollama_api_key
OLLAMA_BASE_URL=https://ollama.com/api
OLLAMA_DEFAULT_HAIKU_MODEL=qwen3:cloud
OLLAMA_DEFAULT_SONNET_MODEL=qwen3-coder
OLLAMA_DEFAULT_OPUS_MODEL=glm-4.7:cloud
```

`OLLAMA_API_KEY` is required for direct Ollama Cloud API access. It is not
required for local Ollama. For local Ollama, set:

```bash
OLLAMA_BASE_URL=http://localhost:11434/api
```

If `OLLAMA_BASE_URL` is omitted, Claude Code Best uses
`https://ollama.com/api`.

## Model Mapping

Ollama model routing uses the same three Claude model families shown by
`/model`:

- `OLLAMA_DEFAULT_HAIKU_MODEL`
- `OLLAMA_DEFAULT_SONNET_MODEL`
- `OLLAMA_DEFAULT_OPUS_MODEL`

There is no global `OLLAMA_MODEL` override. This keeps Ollama behavior aligned
with other third-party providers, where Haiku/Sonnet/Opus can map to different
backend models.

When a direct Ollama model name is selected from `/model` or `--model`, it is
sent to Ollama unchanged. When a Claude family model is selected, Claude Code
Best maps it through the matching `OLLAMA_DEFAULT_*_MODEL` variable. If no
family mapping is configured, the fallback is `qwen3-coder`.

## Supported Features

- Native `POST /api/chat` streaming
- Ollama tool calling through `tools`
- Ollama thinking through `think`
- Native `POST /api/web_search`
- Native `POST /api/web_fetch`
- Dynamic context length discovery through `POST /api/show`
- Local Ollama and Ollama Cloud through the same provider

The provider reads model context length from `model_info.*.context_length` or
the `num_ctx` parameter returned by `/api/show`, then uses that value to choose
the request output limit.

## Known Limits

Ollama does not expose an official Cloud quota or remaining-balance API in the
documented native API. Claude Code Best therefore does not show Ollama Cloud
remaining quota.

Anthropic-only server tools are not sent directly to Ollama. Web search and web
fetch are handled client-side through Ollama's native web APIs when the Ollama
provider is active.
