import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js';
import { installOAuthTokens } from '../cli/handlers/auth.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { setClipboard, useTerminalNotification, Box, Link, Text, KeyboardShortcutHint } from '@anthropic/ink';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { getSSLErrorHint } from '@ant/model-provider';
import { sendNotification } from '../services/notifier.js';
import {
  completeChatGPTDeviceLogin,
  requestChatGPTDeviceCode,
  type ChatGPTDeviceCode,
} from '../services/api/openai/chatgptAuth.js';
import { OAuthService } from '../services/oauth/index.js';
import { getOauthAccountInfo, validateForceLoginOrg } from '../utils/auth.js';
import { openBrowser } from '../utils/browser.js';
import { logError } from '../utils/log.js';
import { getSettings_DEPRECATED, updateSettingsForSource } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/select.js';
import { Spinner } from './Spinner.js';
import TextInput from './TextInput.js';
import { checkOllamaStatus, listOllamaModels, pullOllamaModel, pingUrl } from '../utils/localLlm.js';

type Props = {
  onDone(): void;
  startingMessage?: string;
  mode?: 'login' | 'setup-token';
  forceLoginMethod?: 'claudeai' | 'console';
};

type OAuthStatus =
  | { state: 'idle' } // Initial state, waiting to select login method
  | { state: 'platform_setup' } // Show platform setup info (Bedrock/Vertex/Foundry)
  | {
      state: 'custom_platform';
      baseUrl: string;
      apiKey: string;
      haikuModel: string;
      sonnetModel: string;
      opusModel: string;
      activeField: 'base_url' | 'api_key' | 'haiku_model' | 'sonnet_model' | 'opus_model';
    } // Custom platform: configure API endpoint and model names
  | {
      state: 'openai_chat_api';
      baseUrl: string;
      apiKey: string;
      haikuModel: string;
      sonnetModel: string;
      opusModel: string;
      activeField: 'base_url' | 'api_key' | 'haiku_model' | 'sonnet_model' | 'opus_model';
    } // OpenAI Chat Completions API platform
  | {
      state: 'chatgpt_subscription';
      phase: 'requesting' | 'waiting';
      deviceCode?: ChatGPTDeviceCode;
    } // ChatGPT account subscription via Codex OAuth device flow
  | {
      state: 'gemini_api';
      apiKey: string;
      haikuModel: string;
      sonnetModel: string;
      opusModel: string;
      activeField:
        | 'api_key'
        | 'haiku_model'
        | 'sonnet_model'
        | 'opus_model'
        | 'custom_haiku_model'
        | 'custom_sonnet_model'
        | 'custom_opus_model';
      availableModels: string[];
      isLoadingModels: boolean;
      statusMessage?: string;
    } // Gemini Generate Content API platform
  | {
      state: 'local_llm_setup';
      runnerType: 'ollama' | 'lmstudio' | 'jan' | 'localai' | 'custom';
      baseUrl: string;
      apiKey?: string;
      modelName: string;
      activeField: 'runner_type' | 'base_url' | 'api_key' | 'model_name' | 'custom_model_name';
      availableModels: string[];
      isLoadingModels: boolean;
      statusMessage?: string;
    }
  | {
      state: 'local_llm_pulling';
      baseUrl: string;
      modelName: string;
      status: string;
      percentage?: number;
    }
  | { state: 'ready_to_start' } // Flow started, waiting for browser to open
  | { state: 'waiting_for_login'; url?: string } // Browser opened, waiting for user to login
  | { state: 'creating_api_key' } // Got access token, creating API key
  | { state: 'about_to_retry'; nextState: OAuthStatus }
  | { state: 'success'; token?: string }
  | {
      state: 'error';
      message: string;
      toRetry?: OAuthStatus;
    };

type LocalLlmSetupState = Extract<OAuthStatus, { state: 'local_llm_setup' }>;

const PASTE_HERE_MSG = 'Paste code here if prompted > ';
const POPULAR_MODELS = ['llama3.1', 'mistral', 'phi3', 'qwen2', 'gemma2', 'codellama'];
export function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode = 'login',
  forceLoginMethod: forceLoginMethodProp,
}: Props): React.ReactNode {
  const settings = getSettings_DEPRECATED() || {};
  const forceLoginMethod = forceLoginMethodProp ?? settings.forceLoginMethod;
  const orgUUID = settings.forceLoginOrgUUID;
  const forcedMethodMessage =
    forceLoginMethod === 'claudeai'
      ? 'Login method pre-selected: Subscription Plan (Claude Pro/Max)'
      : forceLoginMethod === 'console'
        ? 'Login method pre-selected: API Usage Billing (Anthropic Console)'
        : null;

  const terminal = useTerminalNotification();

  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>(() => {
    if (mode === 'setup-token') {
      return { state: 'ready_to_start' };
    }
    if (forceLoginMethod === 'claudeai' || forceLoginMethod === 'console') {
      return { state: 'ready_to_start' };
    }
    return { state: 'idle' };
  });

  const [pastedCode, setPastedCode] = useState('');
  const [cursorOffset, setCursorOffset] = useState(0);
  const [oauthService] = useState(() => new OAuthService());
  const [loginWithClaudeAi, setLoginWithClaudeAi] = useState(() => {
    // Use Claude AI auth for setup-token mode to support user:inference scope
    return mode === 'setup-token' || forceLoginMethod === 'claudeai';
  });
  // After a few seconds we suggest the user to copy/paste url if the
  // browser did not open automatically. In this flow we expect the user to
  // copy the code from the browser and paste it in the terminal
  const [showPastePrompt, setShowPastePrompt] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);

  const textInputColumns = useTerminalSize().columns - PASTE_HERE_MSG.length - 1;

  // Log forced login method on mount
  useEffect(() => {
    if (forceLoginMethod === 'claudeai') {
      logEvent('tengu_oauth_claudeai_forced', {});
    } else if (forceLoginMethod === 'console') {
      logEvent('tengu_oauth_console_forced', {});
    }
  }, [forceLoginMethod]);

  // Retry logic
  useEffect(() => {
    if (oauthStatus.state === 'about_to_retry') {
      const timer = setTimeout(setOAuthStatus, 1000, oauthStatus.nextState);
      return () => clearTimeout(timer);
    }
  }, [oauthStatus]);

  // Handle Ollama model listing
  useEffect(() => {
    if (
      oauthStatus.state === 'local_llm_setup' &&
      oauthStatus.runnerType === 'ollama' &&
      oauthStatus.availableModels.length === 0 &&
      !oauthStatus.isLoadingModels &&
      !oauthStatus.statusMessage
    ) {
      setOAuthStatus(prev => (prev.state === 'local_llm_setup' ? { ...prev, isLoadingModels: true } : prev));
      listOllamaModels(oauthStatus.baseUrl)
        .then(models => {
          setOAuthStatus(prev =>
            prev.state === 'local_llm_setup'
              ? {
                  ...prev,
                  availableModels: models,
                  isLoadingModels: false,
                  statusMessage: models.length === 0 ? 'No models found. You can download one below.' : undefined,
                }
              : prev,
          );
        })
        .catch(err => {
          setOAuthStatus(prev =>
            prev.state === 'local_llm_setup'
              ? {
                  ...prev,
                  isLoadingModels: false,
                  statusMessage: `Error: ${err.message}`,
                }
              : prev,
          );
        });
    }
  }, [oauthStatus]);

  // Handle Ollama model pulling
  useEffect(() => {
    if (oauthStatus.state === 'local_llm_pulling') {
      const abortController = new AbortController();
      const { baseUrl, modelName } = oauthStatus;
      (async () => {
        try {
          for await (const progress of pullOllamaModel(modelName, baseUrl, abortController.signal)) {
            setOAuthStatus(prev =>
              prev.state === 'local_llm_pulling'
                ? {
                    ...prev,
                    status: progress.status,
                    percentage: progress.percentage,
                  }
                : prev,
            );
          }
          // Success! Reload models
          setOAuthStatus({
            state: 'local_llm_setup',
            runnerType: 'ollama',
            baseUrl,
            modelName,
            activeField: 'model_name',
            availableModels: [],
            isLoadingModels: false,
          });
        } catch (err) {
          if (abortController.signal.aborted) return;
          setOAuthStatus({
            state: 'error',
            message: `Failed to pull model: ${err instanceof Error ? err.message : String(err)}`,
            toRetry: {
              state: 'local_llm_setup',
              runnerType: 'ollama',
              baseUrl: 'http://localhost:11434',
              modelName: oauthStatus.modelName,
              activeField: 'model_name',
              availableModels: [],
              isLoadingModels: false,
            },
          });
        }
      })();
      return () => abortController.abort();
    }
  }, [oauthStatus.state]);

  // Handle Enter to continue on success state
  useKeybinding(
    'confirm:yes',
    () => {
      logEvent('tengu_oauth_success', { loginWithClaudeAi });
      onDone();
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus.state === 'success' && mode !== 'setup-token',
    },
  );

  // Handle Enter to continue from platform setup
  useKeybinding(
    'confirm:yes',
    () => {
      setOAuthStatus({ state: 'idle' });
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus.state === 'platform_setup',
    },
  );

  // Handle Enter to retry on error state
  useKeybinding(
    'confirm:yes',
    () => {
      if (oauthStatus.state === 'error' && oauthStatus.toRetry) {
        setPastedCode('');
        setOAuthStatus({
          state: 'about_to_retry',
          nextState: oauthStatus.toRetry,
        });
      }
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus.state === 'error' && !!oauthStatus.toRetry,
    },
  );

  useEffect(() => {
    if (pastedCode === 'c' && oauthStatus.state === 'waiting_for_login' && showPastePrompt && !urlCopied) {
      void setClipboard(oauthStatus.url || '').then(raw => {
        if (raw) process.stdout.write(raw);
        setUrlCopied(true);
        setTimeout(setUrlCopied, 2000, false);
      });
      setPastedCode('');
    }
  }, [pastedCode, oauthStatus, showPastePrompt, urlCopied]);

  async function handleSubmitCode(value: string, url: string) {
    try {
      // Expecting format "authorizationCode#state" from the authorization callback URL
      const [authorizationCode, state] = value.split('#');

      if (!authorizationCode || !state) {
        setOAuthStatus({
          state: 'error',
          message: 'Invalid code. Please make sure the full code was copied',
          toRetry: { state: 'waiting_for_login', url },
        });
        return;
      }

      // Track which path the user is taking (manual code entry)
      logEvent('tengu_oauth_manual_entry', {});
      oauthService.handleManualAuthCodeInput({
        authorizationCode,
        state,
      });
    } catch (err: unknown) {
      logError(err);
      setOAuthStatus({
        state: 'error',
        message: (err as Error).message,
        toRetry: { state: 'waiting_for_login', url },
      });
    }
  }

  const startOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_flow_start', { loginWithClaudeAi });

      const result = await oauthService
        .startOAuthFlow(
          async url => {
            setOAuthStatus({ state: 'waiting_for_login', url });
            setTimeout(setShowPastePrompt, 3000, true);
          },
          {
            loginWithClaudeAi,
            inferenceOnly: mode === 'setup-token',
            expiresIn: mode === 'setup-token' ? 365 * 24 * 60 * 60 : undefined, // 1 year for setup-token
            orgUUID,
          },
        )
        .catch(err => {
          const isTokenExchangeError = err.message.includes('Token exchange failed');
          // Enterprise TLS proxies (Zscaler et al.) intercept the token
          // exchange POST and cause cryptic SSL errors. Surface an
          // actionable hint so the user isn't stuck in a login loop.
          const sslHint = getSSLErrorHint(err);
          setOAuthStatus({
            state: 'error',
            message:
              sslHint ??
              (isTokenExchangeError
                ? 'Failed to exchange authorization code for access token. Please try again.'
                : err.message),
            toRetry: mode === 'setup-token' ? { state: 'ready_to_start' } : { state: 'idle' },
          });
          logEvent('tengu_oauth_token_exchange_error', {
            error: err.message,
            ssl_error: sslHint !== null,
          });
          throw err;
        });

      if (mode === 'setup-token') {
        // For setup-token mode, return the OAuth access token directly (it can be used as an API key)
        // Don't save to keychain - the token is displayed for manual use with CLAUDE_CODE_OAUTH_TOKEN
        setOAuthStatus({ state: 'success', token: result.accessToken });
      } else {
        await installOAuthTokens(result);

        const orgResult = await validateForceLoginOrg();
        if (!orgResult.valid) {
          throw new Error((orgResult as { valid: false; message: string }).message);
        }
        // Reset modelType to anthropic when using OAuth login
        updateSettingsForSource('userSettings', { modelType: 'anthropic' } as any);

        setOAuthStatus({ state: 'success' });
        void sendNotification(
          {
            message: 'Claude Code login successful',
            notificationType: 'auth_success',
          },
          terminal,
        );
      }
    } catch (err) {
      const errorMessage = (err as Error).message;
      const sslHint = getSSLErrorHint(err);
      setOAuthStatus({
        state: 'error',
        message: sslHint ?? errorMessage,
        toRetry: {
          state: mode === 'setup-token' ? 'ready_to_start' : 'idle',
        },
      });
      logEvent('tengu_oauth_error', {
        error: errorMessage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ssl_error: sslHint !== null,
      });
    }
  }, [oauthService, setShowPastePrompt, loginWithClaudeAi, mode, orgUUID]);

  const pendingOAuthStartRef = useRef(false);

  useEffect(() => {
    if (oauthStatus.state === 'ready_to_start' && !pendingOAuthStartRef.current) {
      pendingOAuthStartRef.current = true;
      // Start OAuth flow and reset the pending flag when complete
      void startOAuth().finally(() => {
        pendingOAuthStartRef.current = false;
      });
    }
  }, [oauthStatus.state, startOAuth]);

  // Auto-exit for setup-token mode
  useEffect(() => {
    if (mode === 'setup-token' && oauthStatus.state === 'success') {
      // Delay to ensure static content is fully rendered before exiting
      const timer = setTimeout(
        (loginWithClaudeAi, onDone) => {
          logEvent('tengu_oauth_success', { loginWithClaudeAi });
          // Don't clear terminal so the token remains visible
          onDone();
        },
        500,
        loginWithClaudeAi,
        onDone,
      );
      return () => clearTimeout(timer);
    }
  }, [mode, oauthStatus, loginWithClaudeAi, onDone]);

  // Cleanup OAuth service when component unmounts
  useEffect(() => {
    return () => {
      oauthService.cleanup();
    };
  }, [oauthService]);

  return (
    <Box flexDirection="column" gap={1}>
      {oauthStatus.state === 'waiting_for_login' && showPastePrompt && (
        <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
          <Box paddingX={1}>
            <Text dimColor>Browser didn&apos;t open? Use the url below to sign in </Text>
            {urlCopied ? (
              <Text color="success">(Copied!)</Text>
            ) : (
              <Text dimColor>
                <KeyboardShortcutHint shortcut="c" action="copy" parens />
              </Text>
            )}
          </Box>
          <Link url={oauthStatus.url || ''}>
            <Text dimColor>{oauthStatus.url}</Text>
          </Link>
        </Box>
      )}
      {mode === 'setup-token' && oauthStatus.state === 'success' && oauthStatus.token && (
        <Box key="tokenOutput" flexDirection="column" gap={1} paddingTop={1}>
          <Text color="success">✓ Long-lived authentication token created successfully!</Text>
          <Box flexDirection="column" gap={1}>
            <Text>Your OAuth token (valid for 1 year):</Text>
            <Text color="warning">{oauthStatus.token}</Text>
            <Text dimColor>Store this token securely. You won&apos;t be able to see it again.</Text>
            <Text dimColor>Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=&lt;token&gt;</Text>
          </Box>
        </Box>
      )}
      <Box paddingLeft={1} flexDirection="column" gap={1}>
        <OAuthStatusMessage
          oauthStatus={oauthStatus}
          mode={mode}
          startingMessage={startingMessage}
          forcedMethodMessage={forcedMethodMessage}
          showPastePrompt={showPastePrompt}
          pastedCode={pastedCode}
          setPastedCode={setPastedCode}
          cursorOffset={cursorOffset}
          setCursorOffset={setCursorOffset}
          textInputColumns={textInputColumns}
          handleSubmitCode={handleSubmitCode}
          setOAuthStatus={setOAuthStatus}
          setLoginWithClaudeAi={setLoginWithClaudeAi}
          onDone={onDone}
        />
      </Box>
    </Box>
  );
}

type OAuthStatusMessageProps = {
  oauthStatus: OAuthStatus;
  mode: 'login' | 'setup-token';
  startingMessage: string | undefined;
  forcedMethodMessage: string | null;
  showPastePrompt: boolean;
  pastedCode: string;
  setPastedCode: (value: string) => void;
  cursorOffset: number;
  onDone: () => void;
  setCursorOffset: (offset: number) => void;
  textInputColumns: number;
  handleSubmitCode: (value: string, url: string) => void;
  setOAuthStatus: React.Dispatch<React.SetStateAction<OAuthStatus>>;
  setLoginWithClaudeAi: (value: boolean) => void;
};

function OAuthStatusMessage({
  oauthStatus,
  mode,
  startingMessage,
  forcedMethodMessage,
  showPastePrompt,
  pastedCode,
  setPastedCode,
  cursorOffset,
  setCursorOffset,
  textInputColumns,
  handleSubmitCode,
  setOAuthStatus,
  setLoginWithClaudeAi,
  onDone,
}: OAuthStatusMessageProps): React.ReactNode {
  switch (oauthStatus.state) {
    case 'idle':
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>
            {startingMessage
              ? startingMessage
              : `Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.`}
          </Text>

          <Text>Select login method:</Text>

          <Box>
            <Select
              options={[
                {
                  label: (
                    <Text>
                      Local LLM · <Text dimColor>Ollama, LM Studio, Jan.ai, LocalAI</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'local_llm',
                },
                {
                  label: (
                    <Text>
                      Anthropic Compatible · <Text dimColor>Configure your own API endpoint</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'custom_platform',
                },
                {
                  label: (
                    <Text>
                      OpenAI Compatible · <Text dimColor>Ollama, DeepSeek, vLLM, One API, etc.</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'openai_chat_api',
                },
                {
                  label: (
                    <Text>
                      ChatGPT account with subscription · <Text dimColor>Plus, Pro, Business, Edu, or Enterprise</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'chatgpt_subscription',
                },
                {
                  label: (
                    <Text>
                      Gemini API · <Text dimColor>Google Gemini native REST/SSE</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'gemini_api',
                },
                {
                  label: (
                    <Text>
                      Claude account with subscription · <Text dimColor>Pro, Max, Team, or Enterprise</Text>
                      {process.env.USER_TYPE === 'ant' && (
                        <Text>
                          {'\n'}
                          <Text color="warning">[ANT-ONLY]</Text>{' '}
                          <Text dimColor>
                            Please use this option unless you need to login to a special org for accessing sensitive
                            data (e.g. customer data, HIPI data) with the Console option
                          </Text>
                        </Text>
                      )}
                      {'\n'}
                    </Text>
                  ),
                  value: 'claudeai',
                },
                {
                  label: (
                    <Text>
                      Anthropic Console account · <Text dimColor>API usage billing</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'console',
                },
                {
                  label: (
                    <Text>
                      3rd-party platform · <Text dimColor>Amazon Bedrock, Microsoft Foundry, or Vertex AI</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'platform',
                },
              ]}
              onChange={value => {
                if (value === 'local_llm') {
                  logEvent('tengu_local_llm_selected', {});
                  setOAuthStatus({
                    state: 'local_llm_setup',
                    runnerType: 'ollama',
                    baseUrl: 'http://localhost:11434',
                    modelName: '',
                    activeField: 'runner_type',
                    availableModels: [],
                    isLoadingModels: false,
                  });
                  return;
                }
                if (value === 'custom_platform') {
                  logEvent('tengu_custom_platform_selected', {});
                  setOAuthStatus({
                    state: 'custom_platform',
                    baseUrl: process.env.ANTHROPIC_BASE_URL ?? '',
                    apiKey: process.env.ANTHROPIC_AUTH_TOKEN ?? '',
                    haikuModel: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? '',
                    sonnetModel: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? '',
                    opusModel: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? '',
                    activeField: 'base_url',
                  });
                } else if (value === 'openai_chat_api') {
                  logEvent('tengu_openai_chat_api_selected', {});
                  setOAuthStatus({
                    state: 'openai_chat_api',
                    baseUrl: process.env.OPENAI_BASE_URL ?? '',
                    apiKey: process.env.OPENAI_API_KEY ?? '',
                    haikuModel: process.env.OPENAI_DEFAULT_HAIKU_MODEL ?? '',
                    sonnetModel: process.env.OPENAI_DEFAULT_SONNET_MODEL ?? '',
                    opusModel: process.env.OPENAI_DEFAULT_OPUS_MODEL ?? '',
                    activeField: 'base_url',
                  });
                } else if (value === 'chatgpt_subscription') {
                  logEvent('tengu_chatgpt_subscription_selected', {});
                  setOAuthStatus({
                    state: 'chatgpt_subscription',
                    phase: 'requesting',
                  });
                } else if (value === 'gemini_api') {
                  logEvent('tengu_gemini_api_selected', {});
                  setOAuthStatus({
                    state: 'gemini_api',
                    apiKey: process.env.GEMINI_API_KEY ?? '',
                    haikuModel: process.env.GEMINI_DEFAULT_HAIKU_MODEL ?? '',
                    sonnetModel: process.env.GEMINI_DEFAULT_SONNET_MODEL ?? '',
                    opusModel: process.env.GEMINI_DEFAULT_OPUS_MODEL ?? '',
                    activeField: 'api_key',
                    availableModels: [],
                    isLoadingModels: false,
                  });
                } else if (value === 'platform') {
                  logEvent('tengu_oauth_platform_selected', {});
                  setOAuthStatus({ state: 'platform_setup' });
                } else {
                  setOAuthStatus({ state: 'ready_to_start' });
                  if (value === 'claudeai') {
                    logEvent('tengu_oauth_claudeai_selected', {});
                    setLoginWithClaudeAi(true);
                  } else {
                    logEvent('tengu_oauth_console_selected', {});
                    setLoginWithClaudeAi(false);
                  }
                }
              }}
            />
          </Box>
        </Box>
      );

    case 'local_llm_setup': {
      type LocalField = 'runner_type' | 'base_url' | 'api_key' | 'model_name' | 'custom_model_name';
      const LOCAL_FIELDS: LocalField[] = ['runner_type', 'base_url', 'api_key', 'model_name', 'custom_model_name'];
      const activeField = oauthStatus.activeField;

      const displayValues: Record<LocalField, string> = {
        runner_type: oauthStatus.runnerType,
        base_url: oauthStatus.baseUrl,
        api_key: oauthStatus.apiKey ?? '',
        model_name: oauthStatus.modelName,
        custom_model_name: oauthStatus.modelName,
      };

      const [localInputValue, setLocalInputValue] = useState(displayValues[activeField] ?? '');
      const [localInputCursorOffset, setLocalInputCursorOffset] = useState((displayValues[activeField] ?? '').length);

      const buildLocalState = useCallback(
        (field: LocalField, val: string, nextField?: LocalField): LocalLlmSetupState => {
          const newState = { ...oauthStatus };
          if (field === 'runner_type') {
            newState.runnerType = val as LocalLlmSetupState['runnerType'];
            if (val === 'ollama') newState.baseUrl = 'http://localhost:11434';
            else if (val === 'lmstudio') newState.baseUrl = 'http://localhost:1234/v1';
            else if (val === 'jan') newState.baseUrl = 'http://localhost:1337/v1';
            else if (val === 'localai') newState.baseUrl = 'http://localhost:8080/v1';
          } else if (field === 'base_url') {
            newState.baseUrl = val;
          } else if (field === 'api_key') {
            newState.apiKey = val;
          } else if (field === 'model_name' || field === 'custom_model_name') {
            newState.modelName = val;
          }
          if (nextField) newState.activeField = nextField;
          return newState;
        },
        [oauthStatus],
      );

      const doLocalSave = useCallback(
        async (stateToSave: LocalLlmSetupState) => {
          const { runnerType, baseUrl, modelName, apiKey } = stateToSave;
          const env: Record<string, string> = {
            LOCAL_BASE_URL: baseUrl,
            LOCAL_MODEL: modelName || 'llama3.1',
            LOCAL_RUNNER_TYPE: runnerType,
          };
          if (apiKey) env.LOCAL_API_KEY = apiKey;

          updateSettingsForSource('userSettings', {
            modelType: 'local',
            env,
          });

          updateSettingsForSource('userSettings', {
            model: modelName || 'llama3.1',
          });

          setOAuthStatus({ state: 'success' });
          void onDone();
        },
        [onDone, setOAuthStatus],
      );

      const handleLocalEnter = useCallback(() => {
        if (activeField === 'custom_model_name' && localInputValue) {
          if (oauthStatus.runnerType === 'ollama' && !oauthStatus.availableModels.includes(localInputValue)) {
            setOAuthStatus({
              state: 'local_llm_pulling',
              baseUrl: oauthStatus.baseUrl,
              modelName: localInputValue,
              status: 'Starting download...',
            });
            return;
          }
          const nextState = buildLocalState(activeField, localInputValue);
          setOAuthStatus(nextState);
          doLocalSave(nextState);
          return;
        }

        const idx = LOCAL_FIELDS.indexOf(activeField);
        if (idx === LOCAL_FIELDS.length - 1 || activeField === 'model_name') {
          const nextState = buildLocalState(activeField, localInputValue);
          setOAuthStatus(nextState);
          doLocalSave(nextState);
        } else {
          // find next interactive field (skip model_name if custom_model_name is next, but that's handled by onChange)
          const next = LOCAL_FIELDS[idx + 1]!;
          const nextState = buildLocalState(activeField, localInputValue, next);
          setOAuthStatus(nextState);
          const nextVal =
            nextState[
              next === 'runner_type'
                ? 'runnerType'
                : next === 'base_url'
                  ? 'baseUrl'
                  : next === 'api_key'
                    ? 'apiKey'
                    : 'modelName'
            ];
          setLocalInputValue(nextVal ?? '');
          setLocalInputCursorOffset((nextVal ?? '').length);
        }
      }, [activeField, localInputValue, oauthStatus, buildLocalState, doLocalSave, setOAuthStatus]);

      useKeybinding(
        'tabs:next',
        () => {
          if (activeField === 'runner_type' || activeField === 'model_name') return; // Handled by Select component natively
          const idx = LOCAL_FIELDS.indexOf(activeField);
          if (idx < LOCAL_FIELDS.length - 1) {
            const next = LOCAL_FIELDS[idx + 1]!;
            const nextState = buildLocalState(activeField, localInputValue, next);
            setOAuthStatus(nextState);
            const nextVal =
              nextState[
                next === 'runner_type'
                  ? 'runnerType'
                  : next === 'base_url'
                    ? 'baseUrl'
                    : next === 'api_key'
                      ? 'apiKey'
                      : 'modelName'
              ];
            setLocalInputValue(nextVal ?? '');
            setLocalInputCursorOffset((nextVal ?? '').length);
          }
        },
        { context: 'FormField' },
      );

      useKeybinding(
        'tabs:previous',
        () => {
          if (activeField === 'runner_type' || activeField === 'model_name') return; // Select components trap up/down
          const idx = LOCAL_FIELDS.indexOf(activeField);
          if (idx > 0) {
            const next = LOCAL_FIELDS[idx - 1]!;
            const nextState = buildLocalState(activeField, localInputValue, next);
            setOAuthStatus(nextState);
            const nextVal =
              nextState[
                next === 'runner_type'
                  ? 'runnerType'
                  : next === 'base_url'
                    ? 'baseUrl'
                    : next === 'api_key'
                      ? 'apiKey'
                      : 'modelName'
              ];
            setLocalInputValue(nextVal ?? '');
            setLocalInputCursorOffset((nextVal ?? '').length);
          }
        },
        { context: 'FormField' },
      );

      useKeybinding(
        'confirm:no',
        () => {
          setOAuthStatus({ state: 'idle' });
        },
        { context: 'Confirmation' },
      );

      const localColumns = useTerminalSize().columns - 20;

      const renderLocalTextInput = (field: LocalField, label: string, mask?: boolean) => {
        const active = activeField === field;
        const val = displayValues[field];
        return (
          <Box>
            <Text backgroundColor={active ? 'suggestion' : undefined} color={active ? 'inverseText' : undefined}>
              {` ${label} `}
            </Text>
            <Text> </Text>
            {active ? (
              <TextInput
                value={localInputValue}
                onChange={setLocalInputValue}
                onSubmit={handleLocalEnter}
                cursorOffset={localInputCursorOffset}
                onChangeCursorOffset={setLocalInputCursorOffset}
                columns={localColumns}
                mask={mask ? '*' : undefined}
                focus={true}
              />
            ) : val ? (
              <Text color="success">{mask ? val.slice(0, 8) + '\u00b7'.repeat(Math.max(0, val.length - 8)) : val}</Text>
            ) : null}
          </Box>
        );
      };

      const runnerTypeOptions = [
        { label: 'Ollama', value: 'ollama' },
        { label: 'LM Studio', value: 'lmstudio' },
        { label: 'Jan.ai', value: 'jan' },
        { label: 'LocalAI', value: 'localai' },
        { label: 'Custom', value: 'custom' },
      ];

      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Local LLM Setup</Text>
          <Text dimColor>Configure a local LLM runner. Ollama is recommended.</Text>

          <Box flexDirection="column" gap={1}>
            <Box>
              <Text
                backgroundColor={activeField === 'runner_type' ? 'suggestion' : undefined}
                color={activeField === 'runner_type' ? 'inverseText' : undefined}
              >
                {' Runner Type '}
              </Text>
              <Text> </Text>
              {activeField === 'runner_type' ? (
                <Select
                  options={runnerTypeOptions}
                  onChange={val => {
                    const nextState = buildLocalState('runner_type', val, 'base_url');
                    setOAuthStatus(nextState);
                    setLocalInputValue(nextState.baseUrl ?? '');
                    setLocalInputCursorOffset((nextState.baseUrl ?? '').length);
                  }}
                />
              ) : (
                <Text color="success">{displayValues.runner_type}</Text>
              )}
            </Box>

            {(activeField === 'base_url' || LOCAL_FIELDS.indexOf(activeField) > LOCAL_FIELDS.indexOf('base_url')) &&
              renderLocalTextInput('base_url', 'Base URL   ')}

            {(activeField === 'api_key' || LOCAL_FIELDS.indexOf(activeField) > LOCAL_FIELDS.indexOf('api_key')) &&
              renderLocalTextInput('api_key', 'API Key    ', true)}

            {(activeField === 'model_name' || activeField === 'custom_model_name') && (
              <Box flexDirection="column">
                <Box>
                  <Text
                    backgroundColor={activeField === 'model_name' ? 'suggestion' : undefined}
                    color={activeField === 'model_name' ? 'inverseText' : undefined}
                  >
                    {' Model Name '}
                  </Text>
                  <Text> </Text>
                  {activeField === 'model_name' ? (
                    oauthStatus.isLoadingModels ? (
                      <Box gap={1}>
                        <Spinner />
                        <Text>Loading installed models...</Text>
                      </Box>
                    ) : (
                      <Box flexDirection="column">
                        <Select
                          options={[
                            ...oauthStatus.availableModels.map(m => ({ label: m, value: m })),
                            ...POPULAR_MODELS.filter(m => !oauthStatus.availableModels.includes(m)).map(m => ({
                              label: `${m} (Download)`,
                              value: m,
                            })),
                            { label: 'Custom (Type your own)', value: '__custom__' },
                          ]}
                          onChange={val => {
                            if (val === '__custom__') {
                              const nextState = buildLocalState('model_name', '', 'custom_model_name');
                              setOAuthStatus(nextState);
                              setLocalInputValue('');
                              setLocalInputCursorOffset(0);
                            } else {
                              const nextState = buildLocalState('model_name', val);
                              if (oauthStatus.runnerType === 'ollama' && !oauthStatus.availableModels.includes(val)) {
                                setOAuthStatus({
                                  state: 'local_llm_pulling',
                                  baseUrl: oauthStatus.baseUrl,
                                  modelName: val,
                                  status: 'Starting download...',
                                });
                              } else {
                                setOAuthStatus(nextState);
                                doLocalSave(nextState);
                              }
                            }
                          }}
                        />
                      </Box>
                    )
                  ) : activeField === 'custom_model_name' ? (
                    <TextInput
                      value={localInputValue}
                      onChange={setLocalInputValue}
                      onSubmit={handleLocalEnter}
                      cursorOffset={localInputCursorOffset}
                      onChangeCursorOffset={setLocalInputCursorOffset}
                      columns={localColumns}
                      focus={true}
                    />
                  ) : (
                    <Text color="success">{displayValues.model_name}</Text>
                  )}
                </Box>
              </Box>
            )}
          </Box>

          <Text dimColor>↑↓ to select options · Enter to save · Esc to go back</Text>
        </Box>
      );
    }

    case 'local_llm_pulling': {
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>Downloading {oauthStatus.modelName}...</Text>
          <Box gap={1}>
            <Spinner />
            <Text>{oauthStatus.status}</Text>
            {oauthStatus.percentage !== undefined && <Text color="success">{oauthStatus.percentage}%</Text>}
          </Box>
          <Text dimColor>Please wait, this may take a few minutes depending on your internet speed.</Text>
        </Box>
      );
    }

    case 'custom_platform': {
      type Field = 'base_url' | 'api_key' | 'haiku_model' | 'sonnet_model' | 'opus_model';
      const FIELDS: Field[] = ['base_url', 'api_key', 'haiku_model', 'sonnet_model', 'opus_model'];
      const cp = oauthStatus as {
        state: 'custom_platform';
        activeField: Field;
        baseUrl: string;
        apiKey: string;
        haikuModel: string;
        sonnetModel: string;
        opusModel: string;
      };
      const { activeField, baseUrl, apiKey, haikuModel, sonnetModel, opusModel } = cp;
      const displayValues: Record<Field, string> = {
        base_url: baseUrl,
        api_key: apiKey,
        haiku_model: haikuModel,
        sonnet_model: sonnetModel,
        opus_model: opusModel,
      };

      const [inputValue, setInputValue] = useState(() => displayValues[activeField]);
      const [inputCursorOffset, setInputCursorOffset] = useState(() => displayValues[activeField].length);

      const buildState = useCallback(
        (field: Field, value: string, newActive?: Field) => {
          const s = {
            state: 'custom_platform' as const,
            activeField: newActive ?? activeField,
            baseUrl,
            apiKey,
            haikuModel,
            sonnetModel,
            opusModel,
          };
          switch (field) {
            case 'base_url':
              return { ...s, baseUrl: value };
            case 'api_key':
              return { ...s, apiKey: value };
            case 'haiku_model':
              return { ...s, haikuModel: value };
            case 'sonnet_model':
              return { ...s, sonnetModel: value };
            case 'opus_model':
              return { ...s, opusModel: value };
          }
        },
        [activeField, baseUrl, apiKey, haikuModel, sonnetModel, opusModel],
      );

      const _switchTo = useCallback(
        (target: Field) => {
          setOAuthStatus(buildState(activeField, inputValue, target));
          setInputValue(displayValues[target] ?? '');
          setInputCursorOffset((displayValues[target] ?? '').length);
        },
        [activeField, inputValue, displayValues, buildState, setOAuthStatus],
      );

      const doSave = useCallback(() => {
        const finalVals = { ...displayValues, [activeField]: inputValue };
        const env: Record<string, string> = {};

        // Validate base_url if provided
        if (finalVals.base_url) {
          try {
            new URL(finalVals.base_url);
          } catch {
            setOAuthStatus({
              state: 'error',
              message: 'Invalid base URL: please enter a full URL including protocol (e.g., https://api.example.com)',
              toRetry: {
                state: 'custom_platform',
                baseUrl: '',
                apiKey: '',
                haikuModel: '',
                sonnetModel: '',
                opusModel: '',
                activeField: 'base_url',
              },
            });
            return;
          }
          env.ANTHROPIC_BASE_URL = finalVals.base_url;
        }

        if (finalVals.api_key) env.ANTHROPIC_AUTH_TOKEN = finalVals.api_key;
        if (finalVals.haiku_model) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = finalVals.haiku_model;
        if (finalVals.sonnet_model) env.ANTHROPIC_DEFAULT_SONNET_MODEL = finalVals.sonnet_model;
        if (finalVals.opus_model) env.ANTHROPIC_DEFAULT_OPUS_MODEL = finalVals.opus_model;
        const { error } = updateSettingsForSource('userSettings', {
          modelType: 'anthropic' as any,
          env,
        } as any);
        if (error) {
          setOAuthStatus({
            state: 'error',
            message: 'Failed to save settings. Please try again.',
            toRetry: {
              state: 'custom_platform',
              baseUrl: finalVals.base_url ?? '',
              apiKey: finalVals.api_key ?? '',
              haikuModel: finalVals.haiku_model ?? '',
              sonnetModel: finalVals.sonnet_model ?? '',
              opusModel: finalVals.opus_model ?? '',
              activeField: 'base_url',
            },
          });
        } else {
          for (const [k, v] of Object.entries(env)) process.env[k] = v;
          setOAuthStatus({ state: 'success' });
          void onDone();
        }
      }, [activeField, inputValue, displayValues, setOAuthStatus, onDone]);

      const handleEnter = useCallback(() => {
        const idx = FIELDS.indexOf(activeField);
        if (idx === FIELDS.length - 1) {
          setOAuthStatus(buildState(activeField, inputValue));
          doSave();
        } else {
          const next = FIELDS[idx + 1]!;
          setOAuthStatus(buildState(activeField, inputValue, next));
          setInputValue(displayValues[next] ?? '');
          setInputCursorOffset((displayValues[next] ?? '').length);
        }
      }, [activeField, inputValue, buildState, doSave, displayValues, setOAuthStatus]);

      useKeybinding(
        'tabs:next',
        () => {
          const idx = FIELDS.indexOf(activeField);
          if (idx < FIELDS.length - 1) {
            setOAuthStatus(buildState(activeField, inputValue, FIELDS[idx + 1]));
            setInputValue(displayValues[FIELDS[idx + 1]!] ?? '');
            setInputCursorOffset((displayValues[FIELDS[idx + 1]!] ?? '').length);
          }
        },
        { context: 'FormField' },
      );
      useKeybinding(
        'tabs:previous',
        () => {
          const idx = FIELDS.indexOf(activeField);
          if (idx > 0) {
            setOAuthStatus(buildState(activeField, inputValue, FIELDS[idx - 1]));
            setInputValue(displayValues[FIELDS[idx - 1]!] ?? '');
            setInputCursorOffset((displayValues[FIELDS[idx - 1]!] ?? '').length);
          }
        },
        { context: 'FormField' },
      );
      useKeybinding(
        'confirm:no',
        () => {
          setOAuthStatus({ state: 'idle' });
        },
        { context: 'Confirmation' },
      );

      const columns = useTerminalSize().columns - 20;

      const renderRow = (field: Field, label: string, opts?: { mask?: boolean; placeholder?: string }) => {
        const active = activeField === field;
        const val = displayValues[field];
        return (
          <Box>
            <Text backgroundColor={active ? 'suggestion' : undefined} color={active ? 'inverseText' : undefined}>
              {` ${label} `}
            </Text>
            <Text> </Text>
            {active ? (
              <TextInput
                value={inputValue}
                onChange={setInputValue}
                onSubmit={handleEnter}
                cursorOffset={inputCursorOffset}
                onChangeCursorOffset={setInputCursorOffset}
                columns={columns}
                mask={opts?.mask ? '*' : undefined}
                focus={true}
              />
            ) : val ? (
              <Text color="success">
                {opts?.mask ? val.slice(0, 8) + '\u00b7'.repeat(Math.max(0, val.length - 8)) : val}
              </Text>
            ) : null}
          </Box>
        );
      };

      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Anthropic Compatible Setup</Text>
          <Box flexDirection="column" gap={1}>
            {renderRow('base_url', 'Base URL ')}
            {renderRow('api_key', 'API Key  ', { mask: true })}
            {renderRow('haiku_model', 'Haiku    ')}
            {renderRow('sonnet_model', 'Sonnet   ')}
            {renderRow('opus_model', 'Opus     ')}
          </Box>
          <Text dimColor>↑↓/Tab to switch · Enter on last field to save · Esc to go back</Text>
        </Box>
      );
    }

    case 'openai_chat_api': {
      type OpenAIField = 'base_url' | 'api_key' | 'haiku_model' | 'sonnet_model' | 'opus_model';
      const OPENAI_FIELDS: OpenAIField[] = ['base_url', 'api_key', 'haiku_model', 'sonnet_model', 'opus_model'];
      const op = oauthStatus as {
        state: 'openai_chat_api';
        activeField: OpenAIField;
        baseUrl: string;
        apiKey: string;
        haikuModel: string;
        sonnetModel: string;
        opusModel: string;
      };
      const { activeField, baseUrl, apiKey, haikuModel, sonnetModel, opusModel } = op;
      const openaiDisplayValues: Record<OpenAIField, string> = {
        base_url: baseUrl,
        api_key: apiKey,
        haiku_model: haikuModel,
        sonnet_model: sonnetModel,
        opus_model: opusModel,
      };

      const [openaiInputValue, setOpenaiInputValue] = useState(() => openaiDisplayValues[activeField]);
      const [openaiInputCursorOffset, setOpenaiInputCursorOffset] = useState(
        () => openaiDisplayValues[activeField].length,
      );

      const buildOpenAIState = useCallback(
        (field: OpenAIField, value: string, newActive?: OpenAIField) => {
          const s = {
            state: 'openai_chat_api' as const,
            activeField: newActive ?? activeField,
            baseUrl,
            apiKey,
            haikuModel,
            sonnetModel,
            opusModel,
          };
          switch (field) {
            case 'base_url':
              return { ...s, baseUrl: value };
            case 'api_key':
              return { ...s, apiKey: value };
            case 'haiku_model':
              return { ...s, haikuModel: value };
            case 'sonnet_model':
              return { ...s, sonnetModel: value };
            case 'opus_model':
              return { ...s, opusModel: value };
          }
        },
        [activeField, baseUrl, apiKey, haikuModel, sonnetModel, opusModel],
      );

      const doOpenAISave = useCallback(() => {
        const finalVals = { ...openaiDisplayValues, [activeField]: openaiInputValue };
        const env: Record<string, string | undefined> = {
          OPENAI_AUTH_MODE: undefined,
        };

        // Validate base_url if provided
        if (finalVals.base_url) {
          try {
            new URL(finalVals.base_url);
          } catch {
            setOAuthStatus({
              state: 'error',
              message: 'Invalid base URL: please enter a full URL including protocol (e.g., https://api.example.com)',
              toRetry: {
                state: 'openai_chat_api',
                baseUrl: '',
                apiKey: '',
                haikuModel: '',
                sonnetModel: '',
                opusModel: '',
                activeField: 'base_url',
              },
            });
            return;
          }
          env.OPENAI_BASE_URL = finalVals.base_url;
        }

        if (finalVals.api_key) env.OPENAI_API_KEY = finalVals.api_key;
        if (finalVals.haiku_model) env.OPENAI_DEFAULT_HAIKU_MODEL = finalVals.haiku_model;
        if (finalVals.sonnet_model) env.OPENAI_DEFAULT_SONNET_MODEL = finalVals.sonnet_model;
        if (finalVals.opus_model) env.OPENAI_DEFAULT_OPUS_MODEL = finalVals.opus_model;
        const settingsUpdate: Parameters<typeof updateSettingsForSource>[1] = {
          modelType: 'openai',
          env: env as unknown as Record<string, string>,
        };
        const { error } = updateSettingsForSource('userSettings', settingsUpdate);
        if (error) {
          setOAuthStatus({
            state: 'error',
            message: 'Failed to save settings. Please try again.',
            toRetry: {
              state: 'openai_chat_api',
              baseUrl: finalVals.base_url ?? '',
              apiKey: finalVals.api_key ?? '',
              haikuModel: finalVals.haiku_model ?? '',
              sonnetModel: finalVals.sonnet_model ?? '',
              opusModel: finalVals.opus_model ?? '',
              activeField: 'base_url',
            },
          });
        } else {
          for (const [k, v] of Object.entries(env)) {
            if (v === undefined) {
              delete process.env[k];
            } else {
              process.env[k] = v;
            }
          }
          setOAuthStatus({ state: 'success' });
          void onDone();
        }
      }, [activeField, openaiInputValue, openaiDisplayValues, setOAuthStatus, onDone]);

      const handleOpenAIEnter = useCallback(() => {
        const idx = OPENAI_FIELDS.indexOf(activeField);
        if (idx === OPENAI_FIELDS.length - 1) {
          setOAuthStatus(buildOpenAIState(activeField, openaiInputValue));
          doOpenAISave();
        } else {
          const next = OPENAI_FIELDS[idx + 1]!;
          setOAuthStatus(buildOpenAIState(activeField, openaiInputValue, next));
          setOpenaiInputValue(openaiDisplayValues[next] ?? '');
          setOpenaiInputCursorOffset((openaiDisplayValues[next] ?? '').length);
        }
      }, [activeField, openaiInputValue, buildOpenAIState, doOpenAISave, openaiDisplayValues, setOAuthStatus]);

      useKeybinding(
        'tabs:next',
        () => {
          const idx = OPENAI_FIELDS.indexOf(activeField);
          if (idx < OPENAI_FIELDS.length - 1) {
            setOAuthStatus(buildOpenAIState(activeField, openaiInputValue, OPENAI_FIELDS[idx + 1]));
            setOpenaiInputValue(openaiDisplayValues[OPENAI_FIELDS[idx + 1]!] ?? '');
            setOpenaiInputCursorOffset((openaiDisplayValues[OPENAI_FIELDS[idx + 1]!] ?? '').length);
          }
        },
        { context: 'FormField' },
      );
      useKeybinding(
        'tabs:previous',
        () => {
          const idx = OPENAI_FIELDS.indexOf(activeField);
          if (idx > 0) {
            setOAuthStatus(buildOpenAIState(activeField, openaiInputValue, OPENAI_FIELDS[idx - 1]));
            setOpenaiInputValue(openaiDisplayValues[OPENAI_FIELDS[idx - 1]!] ?? '');
            setOpenaiInputCursorOffset((openaiDisplayValues[OPENAI_FIELDS[idx - 1]!] ?? '').length);
          }
        },
        { context: 'FormField' },
      );
      useKeybinding(
        'confirm:no',
        () => {
          setOAuthStatus({ state: 'idle' });
        },
        { context: 'Confirmation' },
      );

      const openaiColumns = useTerminalSize().columns - 20;

      const renderOpenAIRow = (field: OpenAIField, label: string, opts?: { mask?: boolean }) => {
        const active = activeField === field;
        const val = openaiDisplayValues[field];
        return (
          <Box>
            <Text backgroundColor={active ? 'suggestion' : undefined} color={active ? 'inverseText' : undefined}>
              {` ${label} `}
            </Text>
            <Text> </Text>
            {active ? (
              <TextInput
                value={openaiInputValue}
                onChange={setOpenaiInputValue}
                onSubmit={handleOpenAIEnter}
                cursorOffset={openaiInputCursorOffset}
                onChangeCursorOffset={setOpenaiInputCursorOffset}
                columns={openaiColumns}
                mask={opts?.mask ? '*' : undefined}
                focus={true}
              />
            ) : val ? (
              <Text color="success">
                {opts?.mask ? val.slice(0, 8) + '\u00b7'.repeat(Math.max(0, val.length - 8)) : val}
              </Text>
            ) : null}
          </Box>
        );
      };

      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>OpenAI Compatible API Setup</Text>
          <Text dimColor>Configure an OpenAI Chat Completions compatible endpoint (e.g. Ollama, DeepSeek, vLLM).</Text>
          <Box flexDirection="column" gap={1}>
            {renderOpenAIRow('base_url', 'Base URL ')}
            {renderOpenAIRow('api_key', 'API Key  ', { mask: true })}
            {renderOpenAIRow('haiku_model', 'Haiku    ')}
            {renderOpenAIRow('sonnet_model', 'Sonnet   ')}
            {renderOpenAIRow('opus_model', 'Opus     ')}
          </Box>
          <Text dimColor>↑↓/Tab to switch · Enter on last field to save · Esc to go back</Text>
        </Box>
      );
    }

    case 'chatgpt_subscription': {
      const status = oauthStatus as {
        state: 'chatgpt_subscription';
        phase: 'requesting' | 'waiting';
        deviceCode?: ChatGPTDeviceCode;
      };
      const startedRef = useRef(false);

      useEffect(() => {
        if (startedRef.current) return;
        startedRef.current = true;
        let cancelled = false;
        const controller = new AbortController();
        async function runLogin() {
          try {
            const deviceCode = await requestChatGPTDeviceCode();
            if (cancelled) return;
            setOAuthStatus({
              state: 'chatgpt_subscription',
              phase: 'waiting',
              deviceCode,
            });
            void openBrowser(deviceCode.verificationUrl);
            await completeChatGPTDeviceLogin(deviceCode, controller.signal);
            if (cancelled) return;
            const env: Record<string, string> = {
              OPENAI_AUTH_MODE: 'chatgpt',
            };
            const settingsUpdate: Parameters<typeof updateSettingsForSource>[1] = {
              modelType: 'openai',
              env,
            };
            const { error } = updateSettingsForSource('userSettings', settingsUpdate);
            if (error) {
              throw new Error('Failed to save settings. Please try again.');
            }
            for (const [k, v] of Object.entries(env)) process.env[k] = v;
            setOAuthStatus({ state: 'success' });
            void onDone();
          } catch (err) {
            if (cancelled) return;
            setOAuthStatus({
              state: 'error',
              message: (err as Error).message,
              toRetry: {
                state: 'chatgpt_subscription',
                phase: 'requesting',
              },
            });
          }
        }
        void runLogin();
        return () => {
          cancelled = true;
          controller.abort();
        };
      }, [setOAuthStatus, onDone]);

      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>ChatGPT Account Setup</Text>
          {status.phase === 'requesting' && (
            <Box>
              <Spinner />
              <Text>Requesting sign-in code…</Text>
            </Box>
          )}
          {status.phase === 'waiting' && status.deviceCode && (
            <Box flexDirection="column" gap={1}>
              <Text>Open this link and sign in with your ChatGPT account:</Text>
              <Link url={status.deviceCode.verificationUrl}>
                <Text dimColor>{status.deviceCode.verificationUrl}</Text>
              </Link>
              <Text>
                Enter code: <Text bold>{status.deviceCode.userCode}</Text>
              </Text>
              <Box>
                <Spinner />
                <Text>Waiting for ChatGPT authorization…</Text>
              </Box>
            </Box>
          )}
          <Text dimColor>Esc to go back. Device codes expire after 15 minutes.</Text>
        </Box>
      );
    }

    case 'gemini_api': {
      type GeminiField =
        | 'api_key'
        | 'haiku_model'
        | 'sonnet_model'
        | 'opus_model'
        | 'custom_haiku_model'
        | 'custom_sonnet_model'
        | 'custom_opus_model';
      const GEMINI_FIELDS: GeminiField[] = ['api_key', 'haiku_model', 'sonnet_model', 'opus_model'];
      const gp = oauthStatus as {
        state: 'gemini_api';
        activeField: GeminiField;
        apiKey: string;
        haikuModel: string;
        sonnetModel: string;
        opusModel: string;
        availableModels: string[];
        isLoadingModels: boolean;
        statusMessage?: string;
      };
      const {
        activeField,
        apiKey,
        haikuModel,
        sonnetModel,
        opusModel,
        availableModels,
        isLoadingModels,
        statusMessage,
      } = gp;
      const geminiDisplayValues: Record<string, string> = {
        api_key: apiKey,
        haiku_model: haikuModel,
        sonnet_model: sonnetModel,
        opus_model: opusModel,
        custom_haiku_model: haikuModel,
        custom_sonnet_model: sonnetModel,
        custom_opus_model: opusModel,
      };

      const [geminiInputValue, setGeminiInputValue] = useState(() => geminiDisplayValues[activeField] ?? '');
      const [geminiInputCursorOffset, setGeminiInputCursorOffset] = useState(
        () => (geminiDisplayValues[activeField] ?? '').length,
      );

      const buildGeminiState = useCallback(
        (field: GeminiField, value: string, newActive?: GeminiField) => {
          const s = {
            state: 'gemini_api' as const,
            activeField: newActive ?? activeField,
            apiKey,
            haikuModel,
            sonnetModel,
            opusModel,
            availableModels,
            isLoadingModels,
            statusMessage,
          };
          switch (field) {
            case 'api_key':
              return { ...s, apiKey: value };
            case 'haiku_model':
            case 'custom_haiku_model':
              return { ...s, haikuModel: value };
            case 'sonnet_model':
            case 'custom_sonnet_model':
              return { ...s, sonnetModel: value };
            case 'opus_model':
            case 'custom_opus_model':
              return { ...s, opusModel: value };
            default:
              return s;
          }
        },
        [activeField, apiKey, haikuModel, sonnetModel, opusModel, availableModels, isLoadingModels, statusMessage],
      );

      const fetchGeminiModels = useCallback(
        async (currentApiKey: string) => {
          setOAuthStatus((prev: OAuthStatus) =>
            prev.state === 'gemini_api'
              ? {
                  ...prev,
                  isLoadingModels: true,
                  statusMessage: currentApiKey ? 'Fetching models...' : 'Authenticating via browser...',
                }
              : prev,
          );
          try {
            if (!currentApiKey) {
              const { loginToGoogle } = await import('src/services/api/gemini/google-oauth.js');
              await loginToGoogle();
            }
            const { listGeminiModels } = await import('src/services/api/gemini/client.js');
            const models = await listGeminiModels(currentApiKey || undefined);
            setOAuthStatus((prev: OAuthStatus) =>
              prev.state === 'gemini_api'
                ? {
                    ...prev,
                    availableModels: models,
                    isLoadingModels: false,
                    statusMessage: undefined,
                    activeField: 'haiku_model',
                  }
                : prev,
            );
            setGeminiInputValue(geminiDisplayValues['haiku_model'] ?? '');
            setGeminiInputCursorOffset((geminiDisplayValues['haiku_model'] ?? '').length);
          } catch (e) {
            setOAuthStatus((prev: OAuthStatus) =>
              prev.state === 'gemini_api'
                ? {
                    ...prev,
                    isLoadingModels: false,
                    statusMessage: undefined,
                  }
                : prev,
            );
            setOAuthStatus({
              state: 'error',
              message: `Failed to fetch models: ${e instanceof Error ? e.message : e}`,
              toRetry: {
                state: 'gemini_api',
                apiKey: currentApiKey,
                haikuModel,
                sonnetModel,
                opusModel,
                activeField: 'api_key',
                availableModels: [],
                isLoadingModels: false,
              },
            });
          }
        },
        [haikuModel, sonnetModel, opusModel, geminiDisplayValues, setOAuthStatus],
      );

      const doGeminiSave = useCallback(
        async (stateToSave: any) => {
          const {
            apiKey: finalApiKey,
            haikuModel: finalHaiku,
            sonnetModel: finalSonnet,
            opusModel: finalOpus,
          } = stateToSave;
          if (!finalHaiku || !finalSonnet || !finalOpus) {
            setOAuthStatus({
              state: 'error',
              message: 'Gemini setup requires Haiku, Sonnet, and Opus model names.',
              toRetry: {
                ...stateToSave,
                activeField,
              },
            });
            return;
          }

          const env: Record<string, string> = {};
          if (finalApiKey) env.GEMINI_API_KEY = finalApiKey;
          if (finalHaiku) env.GEMINI_DEFAULT_HAIKU_MODEL = finalHaiku;
          if (finalSonnet) env.GEMINI_DEFAULT_SONNET_MODEL = finalSonnet;
          if (finalOpus) env.GEMINI_DEFAULT_OPUS_MODEL = finalOpus;
          const { error } = updateSettingsForSource('userSettings', {
            modelType: 'gemini',
            env,
          });
          if (error) {
            setOAuthStatus({
              state: 'error',
              message: `Failed to save: ${error.message}`,
              toRetry: {
                ...stateToSave,
                activeField: 'api_key',
              },
            });
          } else {
            for (const [k, v] of Object.entries(env)) process.env[k] = v;
            setOAuthStatus({ state: 'success' });
            void onDone();
          }
        },
        [activeField, onDone, setOAuthStatus],
      );

      const handleGeminiEnter = useCallback(() => {
        if (activeField.startsWith('custom_') && geminiInputValue) {
          const nextState = buildGeminiState(activeField, geminiInputValue);
          setOAuthStatus(nextState);
          doGeminiSave(nextState);
          return;
        }

        if (activeField === 'api_key') {
          const nextState = buildGeminiState(activeField, geminiInputValue);
          setOAuthStatus(nextState);
          void fetchGeminiModels(geminiInputValue);
          return;
        }

        const idx = GEMINI_FIELDS.indexOf(activeField as any);
        if (idx === GEMINI_FIELDS.length - 1) {
          const nextState = buildGeminiState(activeField, geminiInputValue);
          setOAuthStatus(nextState);
          doGeminiSave(nextState);
        } else {
          const next = GEMINI_FIELDS[idx + 1]!;
          const nextState = buildGeminiState(activeField, geminiInputValue, next);
          setOAuthStatus(nextState);
          setGeminiInputValue(geminiDisplayValues[next] ?? '');
          setGeminiInputCursorOffset((geminiDisplayValues[next] ?? '').length);
        }
      }, [
        activeField,
        buildGeminiState,
        doGeminiSave,
        fetchGeminiModels,
        geminiDisplayValues,
        geminiInputValue,
        setOAuthStatus,
      ]);

      const isTextInputActive = activeField === 'api_key' || activeField.startsWith('custom_');

      useKeybinding(
        'tabs:next',
        () => {
          const idx = GEMINI_FIELDS.indexOf(activeField as any);
          if (idx < GEMINI_FIELDS.length - 1) {
            const next = GEMINI_FIELDS[idx + 1]!;
            const nextState = buildGeminiState(activeField, geminiInputValue, next);
            setOAuthStatus(nextState);
            setGeminiInputValue(geminiDisplayValues[next] ?? '');
            setGeminiInputCursorOffset((geminiDisplayValues[next] ?? '').length);
          }
        },
        { context: 'FormField', isActive: isTextInputActive },
      );
      useKeybinding(
        'tabs:previous',
        () => {
          const idx = GEMINI_FIELDS.indexOf(activeField as any);
          if (idx > 0) {
            const prev = GEMINI_FIELDS[idx - 1]!;
            const nextState = buildGeminiState(activeField, geminiInputValue, prev);
            setOAuthStatus(nextState);
            setGeminiInputValue(geminiDisplayValues[prev] ?? '');
            setGeminiInputCursorOffset((geminiDisplayValues[prev] ?? '').length);
          }
        },
        { context: 'FormField', isActive: isTextInputActive },
      );
      useKeybinding(
        'confirm:no',
        () => {
          setOAuthStatus({ state: 'idle' });
        },
        { context: 'Confirmation' },
      );

      const geminiColumns = useTerminalSize().columns - 20;

      const renderGeminiModelField = (field: GeminiField, customField: GeminiField, label: string) => {
        const active = activeField === field || activeField === customField;
        const val = geminiDisplayValues[field];

        return (
          <Box flexDirection="column">
            <Box>
              <Text
                backgroundColor={activeField === field ? 'suggestion' : undefined}
                color={activeField === field ? 'inverseText' : undefined}
              >
                {` ${label} `}
              </Text>
              <Text> </Text>
              {activeField === field ? (
                <Select
                  options={[
                    ...availableModels.map(m => ({ label: m, value: m })),
                    { label: 'Custom (Type your own)', value: '__custom__' },
                  ]}
                  onChange={val => {
                    if (val === '__custom__') {
                      const nextState = buildGeminiState(field, '', customField);
                      setOAuthStatus(nextState);
                      setGeminiInputValue('');
                      setGeminiInputCursorOffset(0);
                    } else {
                      const nextState = buildGeminiState(field, val);
                      if (field === 'opus_model') {
                        setOAuthStatus(nextState);
                        doGeminiSave(nextState);
                      } else {
                        // Advance to next field
                        const idx = GEMINI_FIELDS.indexOf(field);
                        const next = GEMINI_FIELDS[idx + 1]!;
                        const advancedState = buildGeminiState(field, val, next);
                        setOAuthStatus(advancedState);
                        setGeminiInputValue(geminiDisplayValues[next] ?? '');
                        setGeminiInputCursorOffset((geminiDisplayValues[next] ?? '').length);
                      }
                    }
                  }}
                />
              ) : activeField === customField ? (
                <TextInput
                  value={geminiInputValue}
                  onChange={setGeminiInputValue}
                  onSubmit={handleGeminiEnter}
                  cursorOffset={geminiInputCursorOffset}
                  onChangeCursorOffset={setGeminiInputCursorOffset}
                  columns={geminiColumns}
                  focus={true}
                />
              ) : val ? (
                <Text color="success">{val}</Text>
              ) : null}
            </Box>
          </Box>
        );
      };

      const renderGeminiRow = (field: GeminiField, label: string, opts?: { mask?: boolean }) => {
        const active = activeField === field;
        const val = geminiDisplayValues[field];
        return (
          <Box>
            <Text backgroundColor={active ? 'suggestion' : undefined} color={active ? 'inverseText' : undefined}>
              {` ${label} `}
            </Text>
            <Text> </Text>
            {active ? (
              <TextInput
                value={geminiInputValue}
                onChange={setGeminiInputValue}
                onSubmit={handleGeminiEnter}
                cursorOffset={geminiInputCursorOffset}
                onChangeCursorOffset={setGeminiInputCursorOffset}
                columns={geminiColumns}
                mask={opts?.mask ? '*' : undefined}
                focus={true}
              />
            ) : val ? (
              <Text color="success">
                {opts?.mask ? val.slice(0, 8) + '\u00b7'.repeat(Math.max(0, val.length - 8)) : val}
              </Text>
            ) : null}
          </Box>
        );
      };

      return (
        <Box flexDirection="column" gap={1}>
          <Text bold>Gemini API Setup</Text>
          <Text dimColor>
            Configure a Gemini Generate Content compatible endpoint. Models will be fetched automatically. Leave API Key
            blank to log in via browser (Google Auth).
          </Text>

          <Box flexDirection="column" gap={1}>
            {(activeField === 'api_key' ||
              GEMINI_FIELDS.indexOf(activeField as any) >= GEMINI_FIELDS.indexOf('api_key')) &&
              renderGeminiRow('api_key', 'API Key  ', { mask: true })}

            {isLoadingModels && (
              <Box gap={1}>
                <Spinner />
                <Text>{statusMessage || 'Loading...'}</Text>
              </Box>
            )}

            {!isLoadingModels &&
              (activeField === 'haiku_model' ||
                activeField === 'custom_haiku_model' ||
                GEMINI_FIELDS.indexOf(activeField as any) > GEMINI_FIELDS.indexOf('haiku_model')) &&
              renderGeminiModelField('haiku_model', 'custom_haiku_model', 'Haiku    ')}

            {!isLoadingModels &&
              (activeField === 'sonnet_model' ||
                activeField === 'custom_sonnet_model' ||
                GEMINI_FIELDS.indexOf(activeField as any) > GEMINI_FIELDS.indexOf('sonnet_model')) &&
              renderGeminiModelField('sonnet_model', 'custom_sonnet_model', 'Sonnet   ')}

            {!isLoadingModels &&
              (activeField === 'opus_model' ||
                activeField === 'custom_opus_model' ||
                GEMINI_FIELDS.indexOf(activeField as any) > GEMINI_FIELDS.indexOf('opus_model')) &&
              renderGeminiModelField('opus_model', 'custom_opus_model', 'Opus     ')}
          </Box>
          <Text dimColor>↑↓ to select options · Enter to save/fetch models · Esc to go back</Text>
        </Box>
      );
    }

    case 'platform_setup':
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>Using 3rd-party platforms</Text>

          <Box flexDirection="column" gap={1}>
            <Text>
              Claude Code supports Amazon Bedrock, Microsoft Foundry, and Vertex AI. Set the required environment
              variables, then restart Claude Code.
            </Text>

            <Text>
              If you are part of an enterprise organization, contact your administrator for setup instructions.
            </Text>

            <Box flexDirection="column" marginTop={1}>
              <Text bold>Documentation:</Text>
              <Text>
                · Amazon Bedrock:{' '}
                <Link url="https://code.claude.com/docs/en/amazon-bedrock">
                  https://code.claude.com/docs/en/amazon-bedrock
                </Link>
              </Text>
              <Text>
                · Microsoft Foundry:{' '}
                <Link url="https://code.claude.com/docs/en/microsoft-foundry">
                  https://code.claude.com/docs/en/microsoft-foundry
                </Link>
              </Text>
              <Text>
                · Vertex AI:{' '}
                <Link url="https://code.claude.com/docs/en/google-vertex-ai">
                  https://code.claude.com/docs/en/google-vertex-ai
                </Link>
              </Text>
            </Box>

            <Box marginTop={1}>
              <Text dimColor>
                Press <Text bold>Enter</Text> to go back to login options.
              </Text>
            </Box>
          </Box>
        </Box>
      );

    case 'waiting_for_login':
      return (
        <Box flexDirection="column" gap={1}>
          {forcedMethodMessage && (
            <Box>
              <Text dimColor>{forcedMethodMessage}</Text>
            </Box>
          )}

          {!showPastePrompt && (
            <Box>
              <Spinner />
              <Text>Opening browser to sign in…</Text>
            </Box>
          )}

          {showPastePrompt && (
            <Box>
              <Text>{PASTE_HERE_MSG}</Text>
              <TextInput
                value={pastedCode}
                onChange={setPastedCode}
                onSubmit={(value: string) => handleSubmitCode(value, oauthStatus.url || '')}
                cursorOffset={cursorOffset}
                onChangeCursorOffset={setCursorOffset}
                columns={textInputColumns}
                mask="*"
              />
            </Box>
          )}
        </Box>
      );

    case 'creating_api_key':
      return (
        <Box flexDirection="column" gap={1}>
          <Box>
            <Spinner />
            <Text>Creating API key for Claude Code…</Text>
          </Box>
        </Box>
      );

    case 'about_to_retry':
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="permission">Retrying…</Text>
        </Box>
      );

    case 'success':
      return (
        <Box flexDirection="column">
          {mode === 'setup-token' && oauthStatus.token ? null : (
            <>
              {getOauthAccountInfo()?.emailAddress ? (
                <Text dimColor>
                  Logged in as <Text>{getOauthAccountInfo()?.emailAddress}</Text>
                </Text>
              ) : null}
              <Text color="success">
                Login successful. Press <Text bold>Enter</Text> to continue…
              </Text>
            </>
          )}
        </Box>
      );

    case 'error':
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="error">OAuth error: {oauthStatus.message}</Text>

          {oauthStatus.toRetry && (
            <Box marginTop={1}>
              <Text color="permission">
                Press <Text bold>Enter</Text> to retry.
              </Text>
            </Box>
          )}
        </Box>
      );

    default:
      return null;
  }
}
