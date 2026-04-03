import { c as _c } from "react/compiler-runtime";
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS, logEvent } from 'src/services/analytics/index.js';
import { installOAuthTokens } from '../cli/handlers/auth.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { setClipboard } from '../ink/termio/osc.js';
import { useTerminalNotification } from '../ink/useTerminalNotification.js';
import { Box, Link, Text } from '../ink.js';
import { useKeybinding } from '../keybindings/useKeybinding.js';
import { getSSLErrorHint } from '../services/api/errorUtils.js';
import { sendNotification } from '../services/notifier.js';
import { OAuthService } from '../services/oauth/index.js';
import { getOauthAccountInfo, validateForceLoginOrg } from '../utils/auth.js';
import { logError } from '../utils/log.js';
import { getSettings_DEPRECATED, updateSettingsForSource } from '../utils/settings/settings.js';
import { Select } from './CustomSelect/select.js';
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js';
import { Spinner } from './Spinner.js';
import TextInput from './TextInput.js';
type Props = {
  onDone(): void;
  startingMessage?: string;
  mode?: 'login' | 'setup-token';
  forceLoginMethod?: 'claudeai' | 'console';
};
type OAuthStatus = {
  state: 'idle';
} // Initial state, waiting to select login method
| {
  state: 'platform_setup';
} // Show platform setup info (Bedrock/Vertex/Foundry)
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
  state: 'ready_to_start';
} // Flow started, waiting for browser to open
| {
  state: 'waiting_for_login';
  url: string;
} // Browser opened, waiting for user to login
| {
  state: 'creating_api_key';
} // Got access token, creating API key
| {
  state: 'about_to_retry';
  nextState: OAuthStatus;
} | {
  state: 'success';
  token?: string;
} | {
  state: 'error';
  message: string;
  toRetry?: OAuthStatus;
};
const PASTE_HERE_MSG = 'Paste code here if prompted > ';
export function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode = 'login',
  forceLoginMethod: forceLoginMethodProp
}: Props): React.ReactNode {
  const settings = getSettings_DEPRECATED() || {};
  const forceLoginMethod = forceLoginMethodProp ?? settings.forceLoginMethod;
  const orgUUID = settings.forceLoginOrgUUID;
  const forcedMethodMessage = forceLoginMethod === 'claudeai' ? 'Login method pre-selected: Subscription Plan (Claude Pro/Max)' : forceLoginMethod === 'console' ? 'Login method pre-selected: API Usage Billing (Anthropic Console)' : null;
  const terminal = useTerminalNotification();
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>(() => {
    if (mode === 'setup-token') {
      return {
        state: 'ready_to_start'
      };
    }
    if (forceLoginMethod === 'claudeai' || forceLoginMethod === 'console') {
      return {
        state: 'ready_to_start'
      };
    }
    return {
      state: 'idle'
    };
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

  // Handle Enter to continue on success state
  useKeybinding('confirm:yes', () => {
    logEvent('tengu_oauth_success', {
      loginWithClaudeAi
    });
    onDone();
  }, {
    context: 'Confirmation',
    isActive: oauthStatus.state === 'success' && mode !== 'setup-token'
  });

  // Handle Enter to continue from platform setup
  useKeybinding('confirm:yes', () => {
    setOAuthStatus({
      state: 'idle'
    });
  }, {
    context: 'Confirmation',
    isActive: oauthStatus.state === 'platform_setup'
  });

  // Handle Enter to retry on error state
  useKeybinding('confirm:yes', () => {
    if (oauthStatus.state === 'error' && oauthStatus.toRetry) {
      setPastedCode('');
      setOAuthStatus({
        state: 'about_to_retry',
        nextState: oauthStatus.toRetry
      });
    }
  }, {
    context: 'Confirmation',
    isActive: oauthStatus.state === 'error' && !!oauthStatus.toRetry
  });
  useEffect(() => {
    if (pastedCode === 'c' && oauthStatus.state === 'waiting_for_login' && showPastePrompt && !urlCopied) {
      void setClipboard(oauthStatus.url).then(raw => {
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
          toRetry: {
            state: 'waiting_for_login',
            url
          }
        });
        return;
      }

      // Track which path the user is taking (manual code entry)
      logEvent('tengu_oauth_manual_entry', {});
      oauthService.handleManualAuthCodeInput({
        authorizationCode,
        state
      });
    } catch (err: unknown) {
      logError(err);
      setOAuthStatus({
        state: 'error',
        message: (err as Error).message,
        toRetry: {
          state: 'waiting_for_login',
          url
        }
      });
    }
  }
  const startOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_flow_start', {
        loginWithClaudeAi
      });
      const result = await oauthService.startOAuthFlow(async url_0 => {
        setOAuthStatus({
          state: 'waiting_for_login',
          url: url_0
        });
        setTimeout(setShowPastePrompt, 3000, true);
      }, {
        loginWithClaudeAi,
        inferenceOnly: mode === 'setup-token',
        expiresIn: mode === 'setup-token' ? 365 * 24 * 60 * 60 : undefined,
        // 1 year for setup-token
        orgUUID
      }).catch(err_1 => {
        const isTokenExchangeError = err_1.message.includes('Token exchange failed');
        // Enterprise TLS proxies (Zscaler et al.) intercept the token
        // exchange POST and cause cryptic SSL errors. Surface an
        // actionable hint so the user isn't stuck in a login loop.
        const sslHint_0 = getSSLErrorHint(err_1);
        setOAuthStatus({
          state: 'error',
          message: sslHint_0 ?? (isTokenExchangeError ? 'Failed to exchange authorization code for access token. Please try again.' : err_1.message),
          toRetry: mode === 'setup-token' ? {
            state: 'ready_to_start'
          } : {
            state: 'idle'
          }
        });
        logEvent('tengu_oauth_token_exchange_error', {
          error: err_1.message,
          ssl_error: sslHint_0 !== null
        });
        throw err_1;
      });
      if (mode === 'setup-token') {
        // For setup-token mode, return the OAuth access token directly (it can be used as an API key)
        // Don't save to keychain - the token is displayed for manual use with CLAUDE_CODE_OAUTH_TOKEN
        setOAuthStatus({
          state: 'success',
          token: result.accessToken
        });
      } else {
        await installOAuthTokens(result);
        const orgResult = await validateForceLoginOrg();
        if (!orgResult.valid) {
          throw new Error((orgResult as { valid: false; message: string }).message);
        }
        setOAuthStatus({
          state: 'success'
        });
        void sendNotification({
          message: 'Claude Code login successful',
          notificationType: 'auth_success'
        }, terminal);
      }
    } catch (err_0) {
      const errorMessage = (err_0 as Error).message;
      const sslHint = getSSLErrorHint(err_0);
      setOAuthStatus({
        state: 'error',
        message: sslHint ?? errorMessage,
        toRetry: {
          state: mode === 'setup-token' ? 'ready_to_start' : 'idle'
        }
      });
      logEvent('tengu_oauth_error', {
        error: errorMessage as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        ssl_error: sslHint !== null
      });
    }
  }, [oauthService, setShowPastePrompt, loginWithClaudeAi, mode, orgUUID]);
  const pendingOAuthStartRef = useRef(false);
  useEffect(() => {
    if (oauthStatus.state === 'ready_to_start' && !pendingOAuthStartRef.current) {
      pendingOAuthStartRef.current = true;
      process.nextTick((startOAuth_0: () => Promise<void>, pendingOAuthStartRef_0: React.MutableRefObject<boolean>) => {
        void startOAuth_0();
        pendingOAuthStartRef_0.current = false;
      }, startOAuth, pendingOAuthStartRef);
    }
  }, [oauthStatus.state, startOAuth]);

  // Auto-exit for setup-token mode
  useEffect(() => {
    if (mode === 'setup-token' && oauthStatus.state === 'success') {
      // Delay to ensure static content is fully rendered before exiting
      const timer_0 = setTimeout((loginWithClaudeAi_0, onDone_0) => {
        logEvent('tengu_oauth_success', {
          loginWithClaudeAi: loginWithClaudeAi_0
        });
        // Don't clear terminal so the token remains visible
        onDone_0();
      }, 500, loginWithClaudeAi, onDone);
      return () => clearTimeout(timer_0);
    }
  }, [mode, oauthStatus, loginWithClaudeAi, onDone]);

  // Cleanup OAuth service when component unmounts
  useEffect(() => {
    return () => {
      oauthService.cleanup();
    };
  }, [oauthService]);
  return <Box flexDirection="column" gap={1}>
      {oauthStatus.state === 'waiting_for_login' && showPastePrompt && <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
          <Box paddingX={1}>
            <Text dimColor>
              Browser didn&apos;t open? Use the url below to sign in{' '}
            </Text>
            {urlCopied ? <Text color="success">(Copied!)</Text> : <Text dimColor>
                <KeyboardShortcutHint shortcut="c" action="copy" parens />
              </Text>}
          </Box>
          <Link url={oauthStatus.url}>
            <Text dimColor>{oauthStatus.url}</Text>
          </Link>
        </Box>}
      {mode === 'setup-token' && oauthStatus.state === 'success' && oauthStatus.token && <Box key="tokenOutput" flexDirection="column" gap={1} paddingTop={1}>
            <Text color="success">
              ✓ Long-lived authentication token created successfully!
            </Text>
            <Box flexDirection="column" gap={1}>
              <Text>Your OAuth token (valid for 1 year):</Text>
              <Text color="warning">{oauthStatus.token}</Text>
              <Text dimColor>
                Store this token securely. You won&apos;t be able to see it
                again.
              </Text>
              <Text dimColor>
                Use this token by setting: export
                CLAUDE_CODE_OAUTH_TOKEN=&lt;token&gt;
              </Text>
            </Box>
          </Box>}
      <Box paddingLeft={1} flexDirection="column" gap={1}>
        <OAuthStatusMessage oauthStatus={oauthStatus} mode={mode} startingMessage={startingMessage} forcedMethodMessage={forcedMethodMessage} showPastePrompt={showPastePrompt} pastedCode={pastedCode} setPastedCode={setPastedCode} cursorOffset={cursorOffset} setCursorOffset={setCursorOffset} textInputColumns={textInputColumns} handleSubmitCode={handleSubmitCode} setOAuthStatus={setOAuthStatus} setLoginWithClaudeAi={setLoginWithClaudeAi} onDone={onDone} />
      </Box>
    </Box>;
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
  setCursorOffset: (offset: number) => void;
  textInputColumns: number;
  handleSubmitCode: (value: string, url: string) => void;
  setOAuthStatus: (status: OAuthStatus) => void;
  setLoginWithClaudeAi: (value: boolean) => void;
  onDone: () => void;
};
function OAuthStatusMessage(t0) {
  const $ = _c(51);
  const {
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
    onDone
  } = t0;
  switch (oauthStatus.state) {
    case "idle":
      {
        const t1 = startingMessage ? startingMessage : "Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.";
        let t2;
        if ($[0] !== t1) {
          t2 = <Text bold={true}>{t1}</Text>;
          $[0] = t1;
          $[1] = t2;
        } else {
          t2 = $[1];
        }
        let t3;
        if ($[2] === Symbol.for("react.memo_cache_sentinel")) {
          t3 = <Text>Select login method:</Text>;
          $[2] = t3;
        } else {
          t3 = $[2];
        }
        let t4;
        if ($[3] === Symbol.for("react.memo_cache_sentinel")) {
          t4 = {
            label: <Text>Claude account with subscription ·{" "}<Text dimColor={true}>Pro, Max, Team, or Enterprise</Text>{false && <Text>{"\n"}<Text color="warning">[ANT-ONLY]</Text>{" "}<Text dimColor={true}>Please use this option unless you need to login to a special org for accessing sensitive data (e.g. customer data, HIPI data) with the Console option</Text></Text>}{"\n"}</Text>,
            value: "claudeai"
          };
          $[3] = t4;
        } else {
          t4 = $[3];
        }
        let t5;
        if ($[4] === Symbol.for("react.memo_cache_sentinel")) {
          t5 = {
            label: <Text>Anthropic Console account ·{" "}<Text dimColor={true}>API usage billing</Text>{"\n"}</Text>,
            value: "console"
          };
          $[4] = t5;
        } else {
          t5 = $[4];
        }
        let t6;
        if ($[5] === Symbol.for("react.memo_cache_sentinel")) {
          t6 = [{
            label: <Text>Custom Platform ·{" "}<Text dimColor={true}>Configure your own API endpoint</Text>{"\n"}</Text>,
            value: "custom_platform"
          }, t4, t5, {
            label: <Text>3rd-party platform ·{" "}<Text dimColor={true}>Amazon Bedrock, Microsoft Foundry, or Vertex AI</Text>{"\n"}</Text>,
            value: "platform"
          }];
          $[5] = t6;
        } else {
          t6 = $[5];
        }
        let t7;
        if ($[6] !== setLoginWithClaudeAi || $[7] !== setOAuthStatus) {
          t7 = <Box><Select options={t6} onChange={value_0 => {
              if (value_0 === "custom_platform") {
                logEvent("tengu_custom_platform_selected", {});
                setOAuthStatus({
                  state: "custom_platform",
                  baseUrl: process.env.ANTHROPIC_BASE_URL ?? "",
                  apiKey: process.env.ANTHROPIC_AUTH_TOKEN ?? "",
                  haikuModel: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL ?? "",
                  sonnetModel: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL ?? "",
                  opusModel: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL ?? "",
                  activeField: "base_url"
                });
              } else if (value_0 === "platform") {
                logEvent("tengu_oauth_platform_selected", {});
                setOAuthStatus({
                  state: "platform_setup"
                });
              } else {
                setOAuthStatus({
                  state: "ready_to_start"
                });
                if (value_0 === "claudeai") {
                  logEvent("tengu_oauth_claudeai_selected", {});
                  setLoginWithClaudeAi(true);
                } else {
                  logEvent("tengu_oauth_console_selected", {});
                  setLoginWithClaudeAi(false);
                }
              }
            }} /></Box>;
          $[6] = setLoginWithClaudeAi;
          $[7] = setOAuthStatus;
          $[8] = t7;
        } else {
          t7 = $[8];
        }
        let t8;
        if ($[9] !== t2 || $[10] !== t7) {
          t8 = <Box flexDirection="column" gap={1} marginTop={1}>{t2}{t3}{t7}</Box>;
          $[9] = t2;
          $[10] = t7;
          $[11] = t8;
        } else {
          t8 = $[11];
        }
        return t8;
      }
    case "platform_setup":
      {
        let t1;
        if ($[12] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = <Text bold={true}>Using 3rd-party platforms</Text>;
          $[12] = t1;
        } else {
          t1 = $[12];
        }
        let t2;
        let t3;
        if ($[13] === Symbol.for("react.memo_cache_sentinel")) {
          t2 = <Text>Claude Code supports Amazon Bedrock, Microsoft Foundry, and Vertex AI. Set the required environment variables, then restart Claude Code.</Text>;
          t3 = <Text>If you are part of an enterprise organization, contact your administrator for setup instructions.</Text>;
          $[13] = t2;
          $[14] = t3;
        } else {
          t2 = $[13];
          t3 = $[14];
        }
        let t4;
        if ($[15] === Symbol.for("react.memo_cache_sentinel")) {
          t4 = <Text bold={true}>Documentation:</Text>;
          $[15] = t4;
        } else {
          t4 = $[15];
        }
        let t5;
        if ($[16] === Symbol.for("react.memo_cache_sentinel")) {
          t5 = <Text>· Amazon Bedrock:{" "}<Link url="https://code.claude.com/docs/en/amazon-bedrock">https://code.claude.com/docs/en/amazon-bedrock</Link></Text>;
          $[16] = t5;
        } else {
          t5 = $[16];
        }
        let t6;
        if ($[17] === Symbol.for("react.memo_cache_sentinel")) {
          t6 = <Text>· Microsoft Foundry:{" "}<Link url="https://code.claude.com/docs/en/microsoft-foundry">https://code.claude.com/docs/en/microsoft-foundry</Link></Text>;
          $[17] = t6;
        } else {
          t6 = $[17];
        }
        let t7;
        if ($[18] === Symbol.for("react.memo_cache_sentinel")) {
          t7 = <Box flexDirection="column" marginTop={1}>{t4}{t5}{t6}<Text>· Vertex AI:{" "}<Link url="https://code.claude.com/docs/en/google-vertex-ai">https://code.claude.com/docs/en/google-vertex-ai</Link></Text></Box>;
          $[18] = t7;
        } else {
          t7 = $[18];
        }
        let t8;
        if ($[19] === Symbol.for("react.memo_cache_sentinel")) {
          t8 = <Box flexDirection="column" gap={1} marginTop={1}>{t1}<Box flexDirection="column" gap={1}>{t2}{t3}{t7}<Box marginTop={1}><Text dimColor={true}>Press <Text bold={true}>Enter</Text> to go back to login options.</Text></Box></Box></Box>;
          $[19] = t8;
        } else {
          t8 = $[19];
        }
        return t8;
      }
    case "custom_platform":
      {
        type Field = 'base_url' | 'api_key' | 'haiku_model' | 'sonnet_model' | 'opus_model';
        const FIELDS: Field[] = ['base_url', 'api_key', 'haiku_model', 'sonnet_model', 'opus_model'];
        const cp = oauthStatus as { state: 'custom_platform'; activeField: Field; baseUrl: string; apiKey: string; haikuModel: string; sonnetModel: string; opusModel: string };
        const { activeField, baseUrl, apiKey, haikuModel, sonnetModel, opusModel } = cp;
        const displayValues: Record<Field, string> = { base_url: baseUrl, api_key: apiKey, haiku_model: haikuModel, sonnet_model: sonnetModel, opus_model: opusModel };

        const [inputValue, setInputValue] = useState(() => displayValues[activeField]);
        const [inputCursorOffset, setInputCursorOffset] = useState(() => displayValues[activeField].length);

        // Build updated state with a given field changed
        const buildState = useCallback((field: Field, value: string, newActive?: Field) => {
          const s = { state: 'custom_platform' as const, activeField: newActive ?? activeField, baseUrl, apiKey, haikuModel, sonnetModel, opusModel };
          switch (field) {
            case 'base_url': return { ...s, baseUrl: value };
            case 'api_key': return { ...s, apiKey: value };
            case 'haiku_model': return { ...s, haikuModel: value };
            case 'sonnet_model': return { ...s, sonnetModel: value };
            case 'opus_model': return { ...s, opusModel: value };
          }
        }, [activeField, baseUrl, apiKey, haikuModel, sonnetModel, opusModel]);

        // Tab switching: save current → update state → load target
        const switchTo = useCallback((target: Field) => {
          setOAuthStatus(buildState(activeField, inputValue, target));
          setInputValue(displayValues[target] ?? '');
          setInputCursorOffset((displayValues[target] ?? '').length);
        }, [activeField, inputValue, displayValues, buildState, setOAuthStatus]);

        const doSave = useCallback(() => {
          const finalVals = { ...displayValues, [activeField]: inputValue };
          const env: Record<string, string> = {};
          if (finalVals.base_url) env.ANTHROPIC_BASE_URL = finalVals.base_url;
          if (finalVals.api_key) env.ANTHROPIC_AUTH_TOKEN = finalVals.api_key;
          if (finalVals.haiku_model) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = finalVals.haiku_model;
          if (finalVals.sonnet_model) env.ANTHROPIC_DEFAULT_SONNET_MODEL = finalVals.sonnet_model;
          if (finalVals.opus_model) env.ANTHROPIC_DEFAULT_OPUS_MODEL = finalVals.opus_model;
          const { error } = updateSettingsForSource('userSettings', { env } as any);
          if (error) {
            setOAuthStatus({ state: 'error', message: `Failed to save: ${error.message}`, toRetry: { state: 'custom_platform', baseUrl: '', apiKey: '', haikuModel: '', sonnetModel: '', opusModel: '', activeField: 'base_url' } });
          } else {
            for (const [k, v] of Object.entries(env)) process.env[k] = v;
            setOAuthStatus({ state: 'success' });
            void onDone();
          }
        }, [activeField, inputValue, displayValues, setOAuthStatus, onDone]);

        const handleEnter = useCallback(() => {
          const idx = FIELDS.indexOf(activeField);
          // Update current field value in state
          setOAuthStatus(buildState(activeField, inputValue));
          if (idx === FIELDS.length - 1) {
            doSave();
          } else {
            const next = FIELDS[idx + 1]!;
            setInputValue(displayValues[next] ?? '');
            setInputCursorOffset((displayValues[next] ?? '').length);
          }
        }, [activeField, inputValue, buildState, doSave, displayValues, setOAuthStatus]);

        useKeybinding('tabs:next', () => {
          const idx = FIELDS.indexOf(activeField);
          if (idx < FIELDS.length - 1) {
            setOAuthStatus(buildState(activeField, inputValue, FIELDS[idx + 1]));
            setInputValue(displayValues[FIELDS[idx + 1]!] ?? '');
            setInputCursorOffset((displayValues[FIELDS[idx + 1]!] ?? '').length);
          }
        }, { context: 'Tabs' });
        useKeybinding('tabs:previous', () => {
          const idx = FIELDS.indexOf(activeField);
          if (idx > 0) {
            setOAuthStatus(buildState(activeField, inputValue, FIELDS[idx - 1]));
            setInputValue(displayValues[FIELDS[idx - 1]!] ?? '');
            setInputCursorOffset((displayValues[FIELDS[idx - 1]!] ?? '').length);
          }
        }, { context: 'Tabs' });
        useKeybinding('confirm:no', () => {
          setOAuthStatus({ state: 'idle' });
        }, { context: 'Confirmation' });

        const columns = useTerminalSize().columns - 20;

        const renderRow = (field: Field, label: string, opts?: { mask?: boolean; placeholder?: string }) => {
          const active = activeField === field;
          const val = displayValues[field];
          return <Box>
            <Text backgroundColor={active ? 'suggestion' : undefined} color={active ? 'inverseText' : undefined}>{` ${label} `}</Text>
            <Text> </Text>
            {active
              ? <TextInput value={inputValue} onChange={setInputValue} onSubmit={handleEnter} cursorOffset={inputCursorOffset} onChangeCursorOffset={setInputCursorOffset} columns={columns} mask={opts?.mask ? "*" : undefined} focus={true} />
              : (val
                ? <Text color="success">{opts?.mask ? val.slice(0, 8) + '·'.repeat(Math.max(0, val.length - 8)) : val}</Text>
                : null)}
          </Box>;
        };

        return <Box flexDirection="column" gap={1}>
          <Text bold={true}>Custom Platform Setup</Text>
          <Box flexDirection="column" gap={1}>
            {renderRow('base_url', 'Base URL ')}
            {renderRow('api_key', 'API Key  ', { mask: true })}
            {renderRow('haiku_model', 'Haiku    ')}
            {renderRow('sonnet_model', 'Sonnet   ')}
            {renderRow('opus_model', 'Opus     ')}
          </Box>
          <Text dimColor>Tab to switch · Enter on last field to save · Esc to go back</Text>
        </Box>;
      }
    case "waiting_for_login":
      {
        let t1;
        if ($[20] !== forcedMethodMessage) {
          t1 = forcedMethodMessage && <Box><Text dimColor={true}>{forcedMethodMessage}</Text></Box>;
          $[20] = forcedMethodMessage;
          $[21] = t1;
        } else {
          t1 = $[21];
        }
        let t2;
        if ($[22] !== showPastePrompt) {
          t2 = !showPastePrompt && <Box><Spinner /><Text>Opening browser to sign in…</Text></Box>;
          $[22] = showPastePrompt;
          $[23] = t2;
        } else {
          t2 = $[23];
        }
        let t3;
        if ($[24] !== cursorOffset || $[25] !== handleSubmitCode || $[26] !== oauthStatus.url || $[27] !== pastedCode || $[28] !== setCursorOffset || $[29] !== setPastedCode || $[30] !== showPastePrompt || $[31] !== textInputColumns) {
          t3 = showPastePrompt && <Box><Text>{PASTE_HERE_MSG}</Text><TextInput value={pastedCode} onChange={setPastedCode} onSubmit={value => handleSubmitCode(value, oauthStatus.url)} cursorOffset={cursorOffset} onChangeCursorOffset={setCursorOffset} columns={textInputColumns} mask="*" /></Box>;
          $[24] = cursorOffset;
          $[25] = handleSubmitCode;
          $[26] = oauthStatus.url;
          $[27] = pastedCode;
          $[28] = setCursorOffset;
          $[29] = setPastedCode;
          $[30] = showPastePrompt;
          $[31] = textInputColumns;
          $[32] = t3;
        } else {
          t3 = $[32];
        }
        let t4;
        if ($[33] !== t1 || $[34] !== t2 || $[35] !== t3) {
          t4 = <Box flexDirection="column" gap={1}>{t1}{t2}{t3}</Box>;
          $[33] = t1;
          $[34] = t2;
          $[35] = t3;
          $[36] = t4;
        } else {
          t4 = $[36];
        }
        return t4;
      }
    case "creating_api_key":
      {
        let t1;
        if ($[37] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = <Box flexDirection="column" gap={1}><Box><Spinner /><Text>Creating API key for Claude Code…</Text></Box></Box>;
          $[37] = t1;
        } else {
          t1 = $[37];
        }
        return t1;
      }
    case "about_to_retry":
      {
        let t1;
        if ($[38] === Symbol.for("react.memo_cache_sentinel")) {
          t1 = <Box flexDirection="column" gap={1}><Text color="permission">Retrying…</Text></Box>;
          $[38] = t1;
        } else {
          t1 = $[38];
        }
        return t1;
      }
    case "success":
      {
        let t1;
        if ($[39] !== mode || $[40] !== oauthStatus.token) {
          t1 = mode === "setup-token" && oauthStatus.token ? null : <>{getOauthAccountInfo()?.emailAddress ? <Text dimColor={true}>Logged in as{" "}<Text>{getOauthAccountInfo()?.emailAddress}</Text></Text> : null}<Text color="success">Login successful. Press <Text bold={true}>Enter</Text> to continue…</Text></>;
          $[39] = mode;
          $[40] = oauthStatus.token;
          $[41] = t1;
        } else {
          t1 = $[41];
        }
        let t2;
        if ($[42] !== t1) {
          t2 = <Box flexDirection="column">{t1}</Box>;
          $[42] = t1;
          $[43] = t2;
        } else {
          t2 = $[43];
        }
        return t2;
      }
    case "error":
      {
        let t1;
        if ($[44] !== oauthStatus.message) {
          t1 = <Text color="error">OAuth error: {oauthStatus.message}</Text>;
          $[44] = oauthStatus.message;
          $[45] = t1;
        } else {
          t1 = $[45];
        }
        let t2;
        if ($[46] !== oauthStatus.toRetry) {
          t2 = oauthStatus.toRetry && <Box marginTop={1}><Text color="permission">Press <Text bold={true}>Enter</Text> to retry.</Text></Box>;
          $[46] = oauthStatus.toRetry;
          $[47] = t2;
        } else {
          t2 = $[47];
        }
        let t3;
        if ($[48] !== t1 || $[49] !== t2) {
          t3 = <Box flexDirection="column" gap={1}>{t1}{t2}</Box>;
          $[48] = t1;
          $[49] = t2;
          $[50] = t3;
        } else {
          t3 = $[50];
        }
        return t3;
      }
    default:
      {
        return null;
      }
  }
}
