import figures from 'figures';
import React, { useCallback, useState } from 'react';
import { Dialog } from '@anthropic/ink';
// eslint-disable-next-line custom-rules/prefer-use-keybindings -- raw text input for config dialog
import { Box, Text, useInput, stringWidth } from '@anthropic/ink';
import { useKeybinding, useKeybindings } from '../../keybindings/useKeybinding.js';
import { isEnvTruthy } from '../../utils/envUtils.js';
import type { PluginOptionSchema, PluginOptionValues } from '../../utils/plugins/pluginOptionsStorage.js';

/** 根据收集的字符串输入构建 onSave 负载。

敏感字段永远不会预填充到文本缓冲区中（出于安全考虑），因此当用户到达最后一个字段时，他们经过的每个敏感字段在收集的数据中都包含 ''。为了避免在重新配置时静默擦除已保存的密钥：如果一个敏感字段为 '' 且 initialValues 中该字段有值，则完全省略该键。savePluginOptions 只写入它接收到的键，因此省略意味着保留现有值。

导出用于单元测试。 */
export function buildFinalValues(
  fields: string[],
  collected: Record<string, string>,
  configSchema: PluginOptionSchema,
  initialValues: PluginOptionValues | undefined,
): PluginOptionValues {
  const finalValues: PluginOptionValues = {};
  for (const fieldKey of fields) {
    const schema = configSchema[fieldKey];
    const value = collected[fieldKey] ?? '';

    if (schema?.sensitive === true && value === '' && initialValues?.[fieldKey] !== undefined) {
      continue;
    }

    if (schema?.type === 'number') {
      // Number('') returns 0, not NaN — omit blank number inputs so
      // validateUserConfig's required check actually catches them.
      if (value.trim() === '') continue;
      const num = Number(value);
      finalValues[fieldKey] = Number.isNaN(num) ? value : num;
    } else if (schema?.type === 'boolean') {
      finalValues[fieldKey] = isEnvTruthy(value);
    } else {
      finalValues[fieldKey] = value;
    }
  }
  return finalValues;
}

type Props = {
  title: string;
  subtitle: string;
  configSchema: PluginOptionSchema;
  /** Pre-fill fields when reconfiguring. Sensitive fields are not prepopulated. */
  initialValues?: PluginOptionValues;
  onSave: (config: PluginOptionValues) => void;
  onCancel: () => void;
};

export function PluginOptionsDialog({
  title,
  subtitle,
  configSchema,
  initialValues,
  onSave,
  onCancel,
}: Props): React.ReactNode {
  const fields = Object.keys(configSchema);

  // 从 initialValues 预填充，但跳过敏感字段 —
  // — 我们不希望将密钥回显到文本缓冲区中。
  const initialFor = useCallback(
    (key: string): string => {
      if (configSchema[key]?.sensitive === true) return '';
      const v = initialValues?.[key];
      return v === undefined ? '' : String(v);
    },
    [configSchema, initialValues],
  );

  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [values, setValues] = useState<Record<string, string>>({});
  const [currentInput, setCurrentInput] = useState(() => (fields[0] ? initialFor(fields[0]) : ''));

  const currentField = fields[currentFieldIndex];
  const fieldSchema = currentField ? configSchema[currentField] : null;

  // Use Settings context so 'n' key doesn't cancel (allows typing 'n' in input).
  // isCancelActive={false} on Dialog keeps its own confirm:no out of the way.
  useKeybinding('confirm:no', onCancel, { context: 'Settings' });

  // Tab 键跳转到下一个字段
  const handleNextField = useCallback(() => {
    if (currentFieldIndex < fields.length - 1 && currentField) {
      setValues(prev => ({ ...prev, [currentField]: currentInput }));
      setCurrentFieldIndex(prev => prev + 1);
      const nextKey = fields[currentFieldIndex + 1];
      setCurrentInput(nextKey ? initialFor(nextKey) : '');
    }
  }, [currentFieldIndex, fields, currentField, currentInput, initialFor]);

  // Enter 键保存当前字段并移至下一个，如果是最后一个字段则保存所有
  const handleConfirm = useCallback(() => {
    if (!currentField) return;

    const newValues = { ...values, [currentField]: currentInput };

    if (currentFieldIndex === fields.length - 1) {
      onSave(buildFinalValues(fields, newValues, configSchema, initialValues));
    } else {
      // Move to next field
      setValues(newValues);
      setCurrentFieldIndex(prev => prev + 1);
      const nextKey = fields[currentFieldIndex + 1];
      setCurrentInput(nextKey ? initialFor(nextKey) : '');
    }
  }, [currentField, values, currentInput, currentFieldIndex, fields, configSchema, onSave, initialFor, initialValues]);

  useKeybindings(
    {
      'confirm:nextField': handleNextField,
      'confirm:yes': handleConfirm,
    },
    { context: 'Confirmation' },
  );

  // 字符输入处理（退格键、输入）
  useInput((char, key) => {
    // 退格键
    if (key.backspace || key.delete) {
      setCurrentInput(prev => prev.slice(0, -1));
      return;
    }

    // 常规字符输入
    if (char && !key.ctrl && !key.meta && !key.tab && !key.return) {
      setCurrentInput(prev => prev + char);
    }
  });

  if (!fieldSchema || !currentField) {
    return null;
  }

  const isSensitive = fieldSchema.sensitive === true;
  const isRequired = fieldSchema.required === true;
  const displayValue = isSensitive ? '*'.repeat(stringWidth(currentInput)) : currentInput;

  return (
    <Dialog title={title} subtitle={subtitle} onCancel={onCancel} isCancelActive={false}>
      <Box flexDirection="column">
        <Text bold={true}>
          {fieldSchema.title || currentField}
          {isRequired && <Text color="error"> *</Text>}
        </Text>
        {fieldSchema.description && <Text dimColor={true}>{fieldSchema.description}</Text>}

        <Box marginTop={1}>
          <Text>{figures.pointerSmall} </Text>
          <Text>{displayValue}</Text>
          <Text>█</Text>
        </Box>
      </Box>

      <Box flexDirection="column">
        <Text dimColor={true}>
          Field {currentFieldIndex + 1} of {fields.length}
        </Text>
        {currentFieldIndex < fields.length - 1 && (
          <Text dimColor={true}>Tab: Next field · Enter: Save and continue</Text>
        )}
        {currentFieldIndex === fields.length - 1 && <Text dimColor={true}>Enter: Save configuration</Text>}
      </Box>
    </Dialog>
  );
}
