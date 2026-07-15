import { useEffect, useState } from 'react';
import type { ProviderCatalogProfile, ProviderMutationPayload } from '../../types';
import { buildProviderMutation, stateFromPreset, stateFromProvider, type ProviderFormState } from './providerForm';
import { ProviderPresetPicker } from './ProviderPresetPicker';

export function ProviderEditorDialog({
  open,
  provider,
  onClose,
  onSave,
}: {
  open: boolean;
  provider?: ProviderCatalogProfile;
  onClose: () => void;
  onSave: (provider: ProviderMutationPayload) => Promise<void>;
}) {
  const [state, setState] = useState<ProviderFormState>(() =>
    provider ? stateFromProvider(provider) : stateFromPreset('anthropic'),
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setState(provider ? stateFromProvider(provider) : stateFromPreset('anthropic'));
      setError(null);
    }
  }, [open, provider]);
  if (!open) return null;

  const field = (key: keyof ProviderFormState, value: string) => setState(current => ({ ...current, [key]: value }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <form
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl border border-border bg-surface-2 p-5 shadow-xl"
        onSubmit={event => {
          event.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const mutation = buildProviderMutation(state, provider?.models);
            void onSave(mutation)
              .then(onClose)
              .catch(reason => setError(reason instanceof Error ? reason.message : '保存失败'))
              .finally(() => setBusy(false));
          } catch (reason) {
            setBusy(false);
            setError(reason instanceof Error ? reason.message : '表单无效');
          }
        }}
      >
        <h2 className="text-lg font-medium">{provider ? '编辑供应商' : '添加模型供应商'}</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {!provider && (
            <div className="sm:col-span-2">
              <ProviderPresetPicker value={state.presetId} onChange={value => setState(stateFromPreset(value))} />
            </div>
          )}
          <Input
            label="供应商 ID"
            value={state.id}
            disabled={Boolean(provider)}
            onChange={value => field('id', value)}
          />
          <Input label="显示名称" value={state.displayName} onChange={value => field('displayName', value)} />
          <Input
            label="Base URL"
            value={state.baseUrl}
            placeholder="https://api.example.com/v1"
            onChange={value => field('baseUrl', value)}
          />
          <Input label="凭据环境变量引用" value={state.envName} onChange={value => field('envName', value)} />
          <label className="text-xs text-text-secondary">
            认证方式
            <select
              value={state.authScheme}
              onChange={event => field('authScheme', event.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
            >
              {['oauth', 'api-key', 'bearer', 'aws-iam', 'gcp-adc', 'azure-ad', 'proxy'].map(value => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <Input
            label="兼容规则"
            value={state.compatRule}
            placeholder="permissive"
            onChange={value => field('compatRule', value)}
          />
          {!provider && (
            <Input
              label="建议或手工输入模型 ID"
              value={state.initialModelId}
              placeholder="手工输入模型 ID"
              onChange={value => field('initialModelId', value)}
            />
          )}
        </div>
        <p className="mt-3 text-[10px] text-text-muted">密钥不属于此表单；保存目录后请使用独立认证入口。</p>
        {error && <p className="mt-3 text-xs text-status-error">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-xs">
            取消
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand px-3 py-2 text-xs text-white disabled:opacity-50"
          >
            {busy ? '保存中…' : '保存'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="text-xs text-text-secondary">
      {label}
      <input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={event => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm disabled:opacity-60"
      />
    </label>
  );
}
