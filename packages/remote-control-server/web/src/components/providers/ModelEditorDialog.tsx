import { useEffect, useState } from 'react';
import type { ProviderCatalogModelProfile, ProviderModelMutationPayload } from '../../types';

export function ModelEditorDialog({
  open,
  model,
  onClose,
  onSave,
}: {
  open: boolean;
  model?: ProviderCatalogModelProfile;
  onClose: () => void;
  onSave: (model: ProviderModelMutationPayload) => Promise<void>;
}) {
  const [id, setId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [remoteModelId, setRemoteModelId] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setId(model?.id ?? '');
    setDisplayName(model?.displayName ?? '');
    setRemoteModelId(model?.remoteModelId ?? '');
    setError(null);
  }, [open, model]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <form
        className="w-full max-w-md rounded-xl border border-border bg-surface-2 p-5"
        onSubmit={event => {
          event.preventDefault();
          if (!/^[a-z0-9-]+$/.test(id) || !displayName.trim() || !remoteModelId.trim()) {
            setError('请填写合法的模型 ID、名称和 remote model ID');
            return;
          }
          void onSave({
            id,
            display_name: displayName.trim(),
            remote_model_id: remoteModelId.trim(),
            enabled: true,
            archived: false,
            validation: { status: model?.validation.status ?? 'unverified' },
          })
            .then(onClose)
            .catch(reason => setError(reason instanceof Error ? reason.message : '保存失败'));
        }}
      >
        <h2 className="text-lg font-medium">{model ? '编辑模型' : '添加模型'}</h2>
        <div className="mt-4 space-y-3">
          {(
            [
              ['模型配置 ID', id, setId],
              ['显示名称', displayName, setDisplayName],
              ['Remote Model ID', remoteModelId, setRemoteModelId],
            ] as const
          ).map(([label, value, setter]) => (
            <label key={label} className="block text-xs text-text-secondary">
              {label}
              <input
                value={value}
                disabled={Boolean(model) && label === '模型配置 ID'}
                onChange={event => setter(event.target.value)}
                className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-text-muted">始终可以手工输入模型 ID。</p>
        {error && <p className="mt-3 text-xs text-status-error">{error}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-border px-3 py-2 text-xs">
            取消
          </button>
          <button type="submit" className="rounded-md bg-brand px-3 py-2 text-xs text-white">
            保存
          </button>
        </div>
      </form>
    </div>
  );
}
