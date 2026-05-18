import { describe, expect, test, mock } from 'bun:test';
import * as React from 'react';
import { renderToString } from '../../utils/staticRender.js';

// Mock dependencies MUST be called before importing the component
mock.module('src/services/analytics/index.js', () => ({
  logEvent: () => {},
}));

mock.module('../cli/handlers/auth.js', () => ({
  installOAuthTokens: async () => {},
}));

mock.module('../utils/browser.js', () => ({
  openBrowser: async () => {},
}));

mock.module('../utils/log.js', () => ({
  logError: () => {},
}));

mock.module('../utils/settings/settings.js', () => ({
  getSettings_DEPRECATED: () => ({}),
  updateSettingsForSource: async () => {},
}));

mock.module('../services/oauth/index.js', () => ({
  OAuthService: {
    getAuthorizationUrl: async () => 'https://example.com/auth',
    exchangeCode: async () => ({ accessToken: 'abc' }),
  },
}));

mock.module('../utils/auth.js', () => ({
  getOauthAccountInfo: async () => ({ email: 'test@example.com' }),
  validateForceLoginOrg: async () => true,
}));

mock.module('../services/notifier.js', () => ({
  sendNotification: () => {},
}));

mock.module('./CustomSelect/select.js', () => ({
  Select: () => null,
}));

mock.module('./Spinner.js', () => ({
  Spinner: () => null,
}));

mock.module('./TextInput.js', () => ({
  default: () => null,
}));

mock.module('../hooks/useTerminalSize.js', () => ({
  useTerminalSize: () => ({ columns: 80, rows: 24 }),
}));

mock.module('../keybindings/useKeybinding.js', () => ({
  useKeybinding: () => {},
}));

import { ConsoleOAuthFlow } from '../ConsoleOAuthFlow.js';

describe('ConsoleOAuthFlow', () => {
  test(
    'renders initial login method selection',
    async () => {
      const onDone = () => {};
      const out = await renderToString(<ConsoleOAuthFlow onDone={onDone} />);

      expect(out).toContain('Select login method');
      expect(out).toContain('Local LLM');
      expect(out).toContain('Gemini API');
    },
    { timeout: 10000 },
  );
});
