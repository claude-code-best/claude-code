# <img src=".github/logo.svg" alt="" width="32"> Claude SDK for Microsoft Foundry

[![NPM version](https://img.shields.io/npm/v/@anthropic-ai/foundry-sdk.svg?color=blue)](https://npmjs.org/package/@anthropic-ai/foundry-sdk)

This library provides convenient access to the Claude API via Microsoft Azure AI Foundry. See the [documentation](https://platform.claude.com/docs/en/build-with-claude/claude-in-microsoft-foundry) for more details.

For the direct Claude API at api.anthropic.com, see [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript).

## Installation

```bash
npm install @anthropic-ai/foundry-sdk
```

## Usage

### Basic Usage with API Key

```ts
import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';

const client = new AnthropicFoundry({
  apiKey: process.env.ANTHROPIC_FOUNDRY_API_KEY, // defaults to process.env.ANTHROPIC_FOUNDRY_API_KEY
  resource: 'example-resource.azure.anthropic.com', // your Azure resource
});

const message = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude!' }],
});

console.log(message.content);
```

### Using Azure AD Token Provider

For enhanced security, you can use Azure AD (Microsoft Entra) authentication instead of an API key:

```ts
import { AnthropicFoundry } from '@anthropic-ai/foundry-sdk';
import { getBearerTokenProvider, DefaultAzureCredential } from '@azure/identity';

const credential = new DefaultAzureCredential();
const scope = 'https://ai.azure.com/.default';
const azureADTokenProvider = getBearerTokenProvider(credential, scope);

const client = new AnthropicFoundry({
  azureADTokenProvider,
  resource: 'example-resource.azure.anthropic.com', // your Azure resource
});

const message = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude!' }],
});

console.log(message.content);
```

### Using Model Deployments

If you have a model deployment configured, you can specify it to have the SDK automatically construct the correct URL path:

```ts
const client = new AnthropicFoundry({
  apiKey: process.env.ANTHROPIC_FOUNDRY_API_KEY,
  resource: 'example-resource.azure.anthropic.com',
});

// The SDK will automatically use /deployments/my-claude-deployment/messages
const message = await client.messages.create({
  model: 'claude-3-5-sonnet-20241022',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello!' }],
});
```
