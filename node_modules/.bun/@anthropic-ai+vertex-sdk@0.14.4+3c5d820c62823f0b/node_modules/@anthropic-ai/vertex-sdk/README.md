# <img src=".github/logo.svg" alt="" width="32"> Claude SDK for Google Vertex

[![NPM version](https://img.shields.io/npm/v/@anthropic-ai/vertex-sdk.svg?color=blue)](https://npmjs.org/package/@anthropic-ai/vertex-sdk)

This library provides convenient access to the Claude API via Google Vertex AI. See the [documentation](https://platform.claude.com/docs/en/build-with-claude/claude-on-vertex-ai) for more details.

For the direct Claude API at api.anthropic.com, see [`@anthropic-ai/sdk`](https://github.com/anthropics/anthropic-sdk-typescript).

## Installation

```sh
npm install @anthropic-ai/vertex-sdk
```

## Usage

<!-- prettier-ignore -->
```js
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

// Reads from the `CLOUD_ML_REGION` & `ANTHROPIC_VERTEX_PROJECT_ID` environment variables.
// Additionally goes through the standard `google-auth-library` flow.
const client = new AnthropicVertex();

async function main() {
  const result = await client.messages.create({
    messages: [
      {
        role: 'user',
        content: 'Hey Claude!',
      },
    ],
    model: 'claude-3-5-sonnet-v2@20241022',
    max_tokens: 300,
  });
  console.log(JSON.stringify(result, null, 2));
}

main();
```

For more details on how to use the SDK, see the [README.md for the main Claude SDK](https://github.com/anthropics/anthropic-sdk-typescript/tree/main#readme) which this library extends.

## Authentication

This library supports multiple authentication methods:

### Default authentication

The client automatically uses the default [Google Cloud authentication flow](https://cloud.google.com/docs/authentication):

```js
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';

// Uses default authentication and environment variables
const client = new AnthropicVertex({
  region: 'us-central1',
  projectId: 'my-project-id',
});
```

### Custom GoogleAuth configuration

You can customize the authentication using the `googleAuth` option:

```js
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { GoogleAuth } from 'google-auth-library';

const client = new AnthropicVertex({
  googleAuth: new GoogleAuth({
    scopes: 'https://www.googleapis.com/auth/cloud-platform',
    keyFile: '/path/to/service-account.json',
  }),
  region: 'us-central1',
  projectId: 'my-project-id',
});
```

### Pre-configured AuthClient

For advanced use cases [like impersonation](https://cloud.google.com/docs/authentication/use-service-account-impersonation), you can provide a pre-configured `AuthClient`:

```js
import { AnthropicVertex } from '@anthropic-ai/vertex-sdk';
import { GoogleAuth, Impersonated } from 'google-auth-library';

// Create an impersonated credential
const authClient = new Impersonated({
  sourceClient: await new GoogleAuth().getClient(),
  targetPrincipal: 'impersonated-account@projectID.iam.gserviceaccount.com',
  lifetime: 30,
  delegates: [],
  targetScopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

const client = new AnthropicVertex({
  authClient,
  region: 'us-central1',
  projectId: 'my-project-id',
});
```

## Requirements

TypeScript >= 4.5 is supported.

The following runtimes are supported:

- Node.js 18 LTS or later ([non-EOL](https://endoflife.date/nodejs)) versions.
- Deno v1.28.0 or higher, using `import { AnthropicVertex } from "npm:@anthropic-ai/vertex-sdk"`.
- Bun 1.0 or later.
- Cloudflare Workers.
- Vercel Edge Runtime.
- Jest 28 or greater with the `"node"` environment (`"jsdom"` is not supported at this time).
- Nitro v2.6 or greater.

Note that React Native is not supported at this time.

If you are interested in other runtime environments, please open or upvote an issue on GitHub.
