import * as React from 'react';
import { resetCostState } from '../../bootstrap/state.js';
import { clearTrustedDeviceToken, enrollTrustedDevice } from '../../bridge/trustedDevice.js';
import { installOAuthTokens } from '../../cli/handlers/auth.js';
import { ConfigurableShortcutHint } from '../../components/ConfigurableShortcutHint.js';
import { ConsoleOAuthFlow } from '../../components/ConsoleOAuthFlow.js';
import { Dialog } from '@anthropic/ink';
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js';
import { Text } from '@anthropic/ink';
import { refreshGrowthBookAfterAuthChange } from '../../services/analytics/growthbook.js';
import { OAuthService } from '../../services/oauth/index.js';
import { refreshPolicyLimits } from '../../services/policyLimits/index.js';
import { refreshRemoteManagedSettings } from '../../services/remoteManagedSettings/index.js';
import type { LocalJSXCommandOnDone, LocalJSXCommandContext as CommandContext } from '../../types/command.js';
import { validateForceLoginOrg } from '../../utils/auth.js';
import { logError } from '../../utils/log.js';
import { stripSignatureBlocks } from '../../utils/messages.js';
import {
  checkAndDisableAutoModeIfNeeded,
  resetAutoModeGateCheck,
} from '../../utils/permissions/bypassPermissionsKillswitch.js';
import { updateSettingsForSource } from '../../utils/settings/settings.js';
import { resetUserCache } from '../../utils/user.js';

export async function call(
  onDone: LocalJSXCommandOnDone,
  context: CommandContext,
  args = '',
): Promise<React.ReactNode> {
  if (context.elicit) {
    await runAcpLogin(onDone, context, args);
    return null;
  }

  const requestedMethod = parseLoginMethodArg(args);
  return (
    <Login
      onDone={async success => completeLogin(onDone, context, success)}
      forceLoginMethod={requestedMethod === 'claudeai' || requestedMethod === 'console' ? requestedMethod : undefined}
    />
  );
}

type AcpLoginMethod = 'claudeai' | 'console' | 'custom_platform' | 'openai_chat_api' | 'gemini_api' | 'platform';

type ProviderModelType = 'anthropic' | 'openai' | 'gemini';

type ProviderConfig = {
  title: string;
  description: string;
  modelType: ProviderModelType;
  baseUrlEnv: string;
  apiKeyEnv: string;
  haikuModelEnv: string;
  sonnetModelEnv: string;
  opusModelEnv: string;
  requireModels?: boolean;
};

type ProviderValues = {
  baseUrl: string;
  apiKey: string;
  haikuModel: string;
  sonnetModel: string;
  opusModel: string;
};

const LOGIN_METHOD_OPTIONS = [
  {
    const: 'claudeai',
    title: 'Claude account - Browser/manual OAuth for Pro, Max, Team, and Enterprise',
  },
  {
    const: 'console',
    title: 'Anthropic Console - Browser/manual OAuth for Console API usage',
  },
  {
    const: 'custom_platform',
    title: 'Anthropic-compatible API - Custom base URL, auth token, and model aliases',
  },
  {
    const: 'openai_chat_api',
    title: 'OpenAI Compatible - Ollama, DeepSeek, vLLM, One API, and similar endpoints',
  },
  {
    const: 'gemini_api',
    title: 'Gemini API - Google Gemini native REST/SSE endpoint',
  },
  {
    const: 'platform',
    title: 'Other platform - Bedrock, Vertex, Foundry, or externally managed credentials',
  },
] satisfies Array<{ const: AcpLoginMethod; title: string }>;

const PROVIDERS: Record<'custom_platform' | 'openai_chat_api' | 'gemini_api', ProviderConfig> = {
  custom_platform: {
    title: 'Anthropic-compatible API',
    description:
      'Configure an Anthropic-compatible endpoint. Leave optional fields blank to keep relying on existing environment configuration.',
    modelType: 'anthropic',
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    apiKeyEnv: 'ANTHROPIC_AUTH_TOKEN',
    haikuModelEnv: 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
    sonnetModelEnv: 'ANTHROPIC_DEFAULT_SONNET_MODEL',
    opusModelEnv: 'ANTHROPIC_DEFAULT_OPUS_MODEL',
  },
  openai_chat_api: {
    title: 'OpenAI Compatible API',
    description: 'Configure an OpenAI Chat Completions compatible endpoint such as Ollama, DeepSeek, vLLM, or One API.',
    modelType: 'openai',
    baseUrlEnv: 'OPENAI_BASE_URL',
    apiKeyEnv: 'OPENAI_API_KEY',
    haikuModelEnv: 'OPENAI_DEFAULT_HAIKU_MODEL',
    sonnetModelEnv: 'OPENAI_DEFAULT_SONNET_MODEL',
    opusModelEnv: 'OPENAI_DEFAULT_OPUS_MODEL',
  },
  gemini_api: {
    title: 'Gemini API',
    description:
      'Configure Gemini Generate Content API. Model names are required so Claude model aliases can resolve correctly.',
    modelType: 'gemini',
    baseUrlEnv: 'GEMINI_BASE_URL',
    apiKeyEnv: 'GEMINI_API_KEY',
    haikuModelEnv: 'GEMINI_DEFAULT_HAIKU_MODEL',
    sonnetModelEnv: 'GEMINI_DEFAULT_SONNET_MODEL',
    opusModelEnv: 'GEMINI_DEFAULT_OPUS_MODEL',
    requireModels: true,
  },
};

async function runAcpLogin(onDone: LocalJSXCommandOnDone, context: CommandContext, args: string): Promise<void> {
  try {
    const requestedMethod = parseLoginMethodArg(args);
    if (args.trim() && !requestedMethod) {
      onDone(
        `Unsupported /login option: ${args.trim()}. Expected one of: ${LOGIN_METHOD_OPTIONS.map(option => option.const).join(', ')}`,
        { display: 'system' },
      );
      return;
    }

    const method = requestedMethod ?? (await elicitLoginMethod(context));
    if (!method) {
      completeLogin(onDone, context, false);
      return;
    }

    if (method === 'platform') {
      onDone(
        'Third-party platform login is configured through provider-specific environment variables. Use /login and choose Anthropic-compatible, OpenAI Compatible, or Gemini in VS Code, or configure Bedrock/Vertex/Foundry credentials externally.',
        { display: 'system' },
      );
      return;
    }

    if (method === 'custom_platform' || method === 'openai_chat_api' || method === 'gemini_api') {
      const configured = await elicitProviderSettings(context, PROVIDERS[method]);
      if (!configured) {
        completeLogin(onDone, context, false);
        return;
      }
      completeLogin(onDone, context, true, `${PROVIDERS[method].title} configured`);
      return;
    }

    const success = await runManualOAuthLogin(context, method === 'claudeai');
    completeLogin(onDone, context, success);
  } catch (error) {
    logError(error);
    onDone(`Login failed: ${error instanceof Error ? error.message : String(error)}`, {
      display: 'system',
    });
  }
}

function completeLogin(
  onDone: LocalJSXCommandOnDone,
  context: CommandContext,
  success: boolean,
  message?: string,
): void {
  context.onChangeAPIKey();
  // Signature-bearing blocks (thinking, connector_text) are bound to the API key —
  // strip them so the new key doesn't reject stale signatures.
  context.setMessages(stripSignatureBlocks);
  if (success) {
    runPostLoginRefresh(context);
  }
  onDone(message ?? (success ? 'Login successful' : 'Login interrupted'));
}

function runPostLoginRefresh(context: CommandContext): void {
  // Post-login refresh logic. Keep in sync with onboarding in src/interactiveHelpers.tsx
  resetCostState();
  void refreshRemoteManagedSettings();
  void refreshPolicyLimits();
  resetUserCache();
  refreshGrowthBookAfterAuthChange();
  clearTrustedDeviceToken();
  void enrollTrustedDevice();
  resetAutoModeGateCheck();
  const appState = context.getAppState();
  void checkAndDisableAutoModeIfNeeded(appState.toolPermissionContext, context.setAppState, appState.fastMode);
  context.setAppState(prev => ({
    ...prev,
    authVersion: prev.authVersion + 1,
  }));
}

async function elicitLoginMethod(context: CommandContext): Promise<AcpLoginMethod | null> {
  const response = await context.elicit?.('Choose how Claude Code should authenticate.', {
    type: 'object',
    title: 'Login',
    properties: {
      method: {
        type: 'string',
        title: 'Login method',
        oneOf: LOGIN_METHOD_OPTIONS,
        default: 'claudeai',
      },
    },
    required: ['method'],
  });

  if (!response || response.action !== 'accept') return null;
  const method = stringContent(response.content, 'method');
  return isAcpLoginMethod(method) ? method : null;
}

async function elicitProviderSettings(context: CommandContext, config: ProviderConfig): Promise<boolean> {
  const response = await context.elicit?.(
    `${config.description}\n\nBase URL must include the protocol, for example https://api.example.com.`,
    {
      type: 'object',
      title: config.title,
      properties: {
        base_url: {
          type: 'string',
          title: 'Base URL',
          default: process.env[config.baseUrlEnv] ?? '',
        },
        api_key: {
          type: 'string',
          title: 'API key / token',
          default: process.env[config.apiKeyEnv] ?? '',
        },
        haiku_model: {
          type: 'string',
          title: 'Haiku model',
          default: process.env[config.haikuModelEnv] ?? '',
        },
        sonnet_model: {
          type: 'string',
          title: 'Sonnet model',
          default: process.env[config.sonnetModelEnv] ?? '',
        },
        opus_model: {
          type: 'string',
          title: 'Opus model',
          default: process.env[config.opusModelEnv] ?? '',
        },
      },
      required: config.requireModels ? ['haiku_model', 'sonnet_model', 'opus_model'] : [],
    },
  );

  if (!response || response.action !== 'accept') return false;

  const values: ProviderValues = {
    baseUrl: stringContent(response.content, 'base_url'),
    apiKey: stringContent(response.content, 'api_key'),
    haikuModel: stringContent(response.content, 'haiku_model'),
    sonnetModel: stringContent(response.content, 'sonnet_model'),
    opusModel: stringContent(response.content, 'opus_model'),
  };

  saveProviderSettings(config, values);
  return true;
}

function saveProviderSettings(config: ProviderConfig, values: ProviderValues): void {
  if (values.baseUrl) {
    try {
      new URL(values.baseUrl);
    } catch {
      throw new Error('Invalid base URL. Enter a full URL including protocol, for example https://api.example.com.');
    }
  }

  if (config.requireModels && (!values.haikuModel || !values.sonnetModel || !values.opusModel)) {
    throw new Error(`${config.title} setup requires Haiku, Sonnet, and Opus model names.`);
  }

  const env: Record<string, string> = {};
  if (values.baseUrl) env[config.baseUrlEnv] = values.baseUrl;
  if (values.apiKey) env[config.apiKeyEnv] = values.apiKey;
  if (values.haikuModel) env[config.haikuModelEnv] = values.haikuModel;
  if (values.sonnetModel) env[config.sonnetModelEnv] = values.sonnetModel;
  if (values.opusModel) env[config.opusModelEnv] = values.opusModel;

  const { error } = updateSettingsForSource('userSettings', {
    modelType: config.modelType,
    env,
  });
  if (error) {
    throw error;
  }

  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
}

async function runManualOAuthLogin(context: CommandContext, loginWithClaudeAi: boolean): Promise<boolean> {
  const oauthService = new OAuthService();
  try {
    let resolveAuthUrl!: (url: string) => void;
    const authUrlPromise = new Promise<string>(resolve => {
      resolveAuthUrl = resolve;
    });
    const oauthPromise = oauthService.startOAuthFlow(
      async url => {
        resolveAuthUrl(url);
      },
      {
        loginWithClaudeAi,
        skipBrowserOpen: true,
      },
    );
    void oauthPromise.catch(() => {
      // The user can cancel while the OAuth flow is waiting for manual input.
      // Keep that abandoned promise from becoming an unhandled rejection.
    });

    const authUrl = await Promise.race([authUrlPromise, oauthPromise.then(() => '')]);
    if (!authUrl) {
      throw new Error('OAuth finished before the manual login URL was available.');
    }

    const codeResponse = await context.elicit?.(
      `Open this URL in your browser, complete authentication, then paste the full manual code here.\n\n${authUrl}\n\nExpected format: authorizationCode#state`,
      {
        type: 'object',
        title: loginWithClaudeAi ? 'Claude Account Login' : 'Anthropic Console Login',
        properties: {
          code: {
            type: 'string',
            title: 'Authorization code',
          },
        },
        required: ['code'],
      },
    );

    if (!codeResponse || codeResponse.action !== 'accept') {
      return false;
    }

    const parsed = parseManualOAuthCode(stringContent(codeResponse.content, 'code'));
    if (!parsed) {
      throw new Error('Invalid authorization code. Paste the full code in authorizationCode#state format.');
    }

    oauthService.handleManualAuthCodeInput(parsed);
    const tokens = await oauthPromise;
    await installOAuthTokens(tokens);

    const orgResult = await validateForceLoginOrg();
    if (!orgResult.valid) {
      throw new Error((orgResult as { valid: false; message: string }).message);
    }

    const { error } = updateSettingsForSource('userSettings', {
      modelType: 'anthropic',
    });
    if (error) {
      throw error;
    }

    return true;
  } finally {
    oauthService.cleanup();
  }
}

function parseManualOAuthCode(value: string): { authorizationCode: string; state: string } | null {
  const [authorizationCode, state] = value.trim().split('#');
  if (!authorizationCode || !state) return null;
  return { authorizationCode, state };
}

function stringContent(content: Record<string, unknown> | null | undefined, key: string): string {
  const value = content?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isAcpLoginMethod(value: string): value is AcpLoginMethod {
  return (
    value === 'claudeai' ||
    value === 'console' ||
    value === 'custom_platform' ||
    value === 'openai_chat_api' ||
    value === 'gemini_api' ||
    value === 'platform'
  );
}

function parseLoginMethodArg(args: string): AcpLoginMethod | null {
  const value = args.trim().split(/\s+/)[0]?.toLowerCase();
  if (!value) return null;
  if (isAcpLoginMethod(value)) return value;
  if (value === 'claude' || value === 'claude-ai') return 'claudeai';
  if (value === 'anthropic') return 'console';
  if (value === 'custom' || value === 'anthropic-compatible') {
    return 'custom_platform';
  }
  if (value === 'openai' || value === 'openai-compatible') {
    return 'openai_chat_api';
  }
  if (value === 'gemini') return 'gemini_api';
  return null;
}

export function Login(props: {
  onDone: (success: boolean, mainLoopModel: string) => void;
  startingMessage?: string;
  forceLoginMethod?: 'claudeai' | 'console';
}): React.ReactNode {
  const mainLoopModel = useMainLoopModel();

  return (
    <Dialog
      title="Login"
      onCancel={() => props.onDone(false, mainLoopModel)}
      color="permission"
      inputGuide={exitState =>
        exitState.pending ? (
          <Text>Press {exitState.keyName} again to exit</Text>
        ) : (
          <ConfigurableShortcutHint action="confirm:no" context="Confirmation" fallback="Esc" description="cancel" />
        )
      }
    >
      <ConsoleOAuthFlow
        onDone={() => props.onDone(true, mainLoopModel)}
        startingMessage={props.startingMessage}
        forceLoginMethod={props.forceLoginMethod}
      />
    </Dialog>
  );
}
