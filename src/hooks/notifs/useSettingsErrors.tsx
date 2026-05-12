import { useCallback, useEffect, useState } from 'react';
import { useNotifications } from 'src/context/notifications.js';
import { getIsRemoteMode } from '../../bootstrap/state.js';
import { getSettingsWithAllErrors } from '../../utils/settings/allErrors.js';
import type { ValidationError } from '../../utils/settings/validation.js';
import { useSettingsChange } from '../useSettingsChange.js';

const SETTINGS_ERRORS_NOTIFICATION_KEY = 'settings-errors';

export function useSettingsErrors(): ValidationError[] {
  const { addNotification, removeNotification } = useNotifications();
  const [errors, setErrors] = useState<ValidationError[]>(() => {
    const { errors } = getSettingsWithAllErrors();
    return errors;
  });

  const handleSettingsChange = useCallback(() => {
    const { errors } = getSettingsWithAllErrors();
    setErrors(errors);
  }, []);

  useSettingsChange(handleSettingsChange);

  useEffect(() => {
    if (getIsRemoteMode()) return;
    if (errors.length > 0) {
      const message = `Found ${errors.length} settings ${errors.length === 1 ? 'issue' : 'issues'} · /doctor for details`;
      addNotification({
        key: SETTINGS_ERRORS_NOTIFICATION_KEY,
        text: message,
        color: 'warning',
        priority: 'high',
        timeoutMs: 60000,
      });
    } else {
      removeNotification(SETTINGS_ERRORS_NOTIFICATION_KEY);
    }
  }, [errors, addNotification, removeNotification]);

  return errors;
}
