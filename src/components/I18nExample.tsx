/**
 * Example component showing how to use i18n in Claude Code.
 * This is a reference implementation - not actually used in the app.
 */

import * as React from 'react';
import { Text } from '../ink.js';
import { t } from '../i18n';
import { getShortcutDisplay } from '../keybindings/shortcutFormat.js';

/**
 * Example: Using i18n in a component
 */
export function I18nExampleComponent() {
  // Simple translation
  const loadingText = t('common.loading');

  // Translation with parameters
  const shortcut = getShortcutDisplay('chat:imagePaste', 'Chat', 'ctrl+v');
  const noImageText = t('notifications.noImage', { shortcut });

  return (
    <div>
      {/* Simple translation */}
      <Text>{loadingText}</Text>

      {/* Translation with parameters */}
      <Text>{noImageText}</Text>

      {/* Inline usage */}
      <Text>{t('chat.input.placeholder')}</Text>

      {/* Nested keys for organization */}
      <Text>{t('permissions.title')}</Text>
      <Text>{t('permissions.explanation')}</Text>
    </div>
  );
}

/**
 * Example: Conditional rendering with i18n
 */
export function PermissionDialogExample({ action }: { action: string }) {
  return (
    <div>
      <Text bold>{t('permissions.title')}</Text>
      <Text>{t('permissions.explanation')}</Text>
      <Text>{action}</Text>
      <Text>
        [{t('permissions.allow')}] [{t('permissions.deny')}]
      </Text>
    </div>
  );
}

/**
 * Example: Using i18n with settings
 */
export function SettingsExample() {
  const settingsItems = [
    { key: 'settings.general', label: t('settings.general') },
    { key: 'settings.appearance', label: t('settings.appearance') },
    { key: 'settings.keybindings', label: t('settings.keybindings') },
    { key: 'settings.permissions', label: t('settings.permissions') },
    { key: 'settings.mcp', label: t('settings.mcp') },
    { key: 'settings.plugins', label: t('settings.plugins') },
  ];

  return (
    <div>
      <Text bold>{t('settings.title')}</Text>
      {settingsItems.map((item) => (
        <Text key={item.key}>{item.label}</Text>
      ))}
    </div>
  );
}
