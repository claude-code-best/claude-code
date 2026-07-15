import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import {
  apiArchiveProvider,
  apiArchiveProviderModel,
  apiCreateProvider,
  apiCreateProviderModel,
  apiSetDefaultProviderModel,
  apiUpdateProvider,
  apiUpdateProviderModel,
  apiValidateProviderModel,
} from '../api/client';
import { useProviderCatalog } from '../hooks/useProviderCatalog';
import { parseProviderModelCatalog } from '../lib/provider-catalog-model';
import type {
  Environment,
  ProviderCatalogModelProfile,
  ProviderCatalogProfile,
  ProviderModelMutationPayload,
} from '../types';
import { ModelEditorDialog } from '../components/providers/ModelEditorDialog';
import { ProviderCard } from '../components/providers/ProviderCard';
import { ProviderEditorDialog } from '../components/providers/ProviderEditorDialog';

export function ProviderSettingsPage({
  environments,
  onRefresh,
}: {
  environments: Environment[];
  onRefresh: () => void | Promise<void>;
}) {
  const [environmentId, setEnvironmentId] = useState(() => environments[0]?.id ?? null);
  useEffect(() => {
    if (!environments.some(environment => environment.id === environmentId)) {
      setEnvironmentId(environments[0]?.id ?? null);
    }
  }, [environmentId, environments]);
  const remote = useProviderCatalog(environmentId);
  const embeddedCatalog = useMemo(() => {
    const environment = environments.find(item => item.id === environmentId);
    const value = environment?.capabilities?.provider_model_catalog_v1;
    if (value === undefined) return null;
    try {
      return parseProviderModelCatalog(value);
    } catch {
      return null;
    }
  }, [environmentId, environments]);
  const catalog = remote.catalog ?? embeddedCatalog;
  const selectedEnvironment = environments.find(item => item.id === environmentId);
  const disabled = !catalog?.features.catalogWrite || remote.stale || selectedEnvironment?.status !== 'active';
  const [providerEditor, setProviderEditor] = useState<ProviderCatalogProfile | null | undefined>(undefined);
  const [modelEditor, setModelEditor] = useState<{
    provider: ProviderCatalogProfile;
    model?: ProviderCatalogModelProfile;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const mutate = async (action: (revision: number, operationId: string) => Promise<unknown>) => {
    setBusy(true);
    setNotice(null);
    try {
      const result = await remote.mutate(action);
      if (!result.ok) throw new Error(result.error);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  const requireEnvironment = () => {
    if (!environmentId) throw new Error('请先选择运行环境');
    return environmentId;
  };
  const report = (action: () => Promise<void>) =>
    action().catch(error => setNotice(error instanceof Error ? error.message : '操作失败'));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-5xl px-5 py-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium text-text-primary">模型供应商</h1>
            <p className="mt-1 text-sm text-text-muted">
              每台运行环境拥有独立目录；浏览器只接收脱敏状态，不读取密钥内容。
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void remote.refresh()}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => setProviderEditor(null)}
              className="inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-2 text-xs text-white disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              添加供应商
            </button>
          </div>
        </div>

        <label className="mt-6 block max-w-md text-xs text-text-secondary">
          运行环境
          <select
            value={environmentId ?? ''}
            onChange={event => setEnvironmentId(event.target.value || null)}
            className="mt-1 w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm"
          >
            {environments.length === 0 && <option value="">没有在线环境</option>}
            {environments.map(environment => (
              <option key={environment.id} value={environment.id}>
                {environment.device_name || environment.machine_name || environment.id} ·{' '}
                {environment.directory || '未报告目录'}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 rounded-lg border border-border bg-surface-1 p-4">
          <p className="text-xs font-medium">默认启用模型</p>
          <p className="mt-1 text-[11px] text-text-muted">
            {catalog?.defaultModel
              ? defaultLabel(catalog.providers, catalog.defaultModel)
              : '未设置，将使用 CLI 默认模型'}
            {' · '}只影响之后新建的对话，旧对话维持上次成功使用的模型。
          </p>
        </div>

        {(remote.stale || !catalog?.features.catalogWrite) && catalog && (
          <p className="mt-4 rounded-md border border-warning-border bg-warning-bg px-3 py-2 text-xs text-warning-text">
            {remote.stale
              ? '当前为缓存目录，写操作已禁用；请确认本地 Worker 在线。'
              : '当前 Worker 仅支持只读供应商目录，请升级后管理。'}
          </p>
        )}
        {notice && <p className="mt-4 text-xs text-status-error">{notice}</p>}
        {remote.error && <p className="mt-4 text-xs text-status-error">{remote.error}</p>}

        <div className="mt-5 space-y-4">
          {!catalog && !remote.loading && (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-text-muted">
              当前环境尚未报告 Provider Catalog。旧 Worker 仍可使用终端中的模型配置。
            </p>
          )}
          {remote.loading && !catalog && <p className="py-8 text-xs text-text-muted">正在读取供应商目录…</p>}
          {catalog?.providers.map(provider => {
            const defaultModelId =
              catalog.defaultModel?.providerId === provider.id ? catalog.defaultModel.modelProfileId : null;
            return (
              <ProviderCard
                key={provider.id}
                provider={provider}
                defaultModelId={defaultModelId}
                disabled={disabled || busy}
                onEdit={() => setProviderEditor(provider)}
                onArchive={() =>
                  report(() =>
                    mutate((revision, operationId) =>
                      apiArchiveProvider(requireEnvironment(), provider.id, {
                        expected_revision: revision,
                        operation_id: operationId,
                      }),
                    ),
                  )
                }
                onAddModel={() => setModelEditor({ provider })}
                onEditModel={modelId =>
                  setModelEditor({
                    provider,
                    model: provider.models.find(model => model.id === modelId),
                  })
                }
                onArchiveModel={modelId =>
                  report(() =>
                    mutate((revision, operationId) =>
                      apiArchiveProviderModel(requireEnvironment(), provider.id, modelId, {
                        expected_revision: revision,
                        operation_id: operationId,
                      }),
                    ),
                  )
                }
                onSetDefault={modelId => {
                  const model = provider.models.find(item => item.id === modelId);
                  if (
                    model?.validation.status === 'unverified' &&
                    !window.confirm('该模型尚未验证，仍设为新对话默认模型吗？')
                  ) {
                    return;
                  }
                  report(() =>
                    mutate((revision, operationId) =>
                      apiSetDefaultProviderModel(requireEnvironment(), {
                        expected_revision: revision,
                        operation_id: operationId,
                        model: {
                          provider_id: provider.id,
                          model_profile_id: modelId,
                        },
                        allow_unverified: model?.validation.status === 'unverified',
                      }),
                    ),
                  );
                }}
                onValidate={modelId =>
                  report(() =>
                    mutate((revision, operationId) =>
                      apiValidateProviderModel(requireEnvironment(), provider.id, modelId, {
                        expected_revision: revision,
                        operation_id: operationId,
                      }),
                    ),
                  )
                }
                onAuthenticate={() => setNotice('认证方式选择将在此处打开；目录编辑不会接收密钥。')}
              />
            );
          })}
        </div>
      </div>

      <ProviderEditorDialog
        open={providerEditor !== undefined}
        provider={providerEditor ?? undefined}
        onClose={() => setProviderEditor(undefined)}
        onSave={provider =>
          mutate((revision, operationId) =>
            providerEditor
              ? apiUpdateProvider(requireEnvironment(), providerEditor.id, {
                  expected_revision: revision,
                  operation_id: operationId,
                  provider,
                })
              : apiCreateProvider(requireEnvironment(), {
                  expected_revision: revision,
                  operation_id: operationId,
                  provider,
                }),
          )
        }
      />
      <ModelEditorDialog
        open={modelEditor !== null}
        model={modelEditor?.model}
        onClose={() => setModelEditor(null)}
        onSave={model => saveModel(modelEditor, model, mutate, requireEnvironment)}
      />
    </div>
  );
}

async function saveModel(
  editor: { provider: ProviderCatalogProfile; model?: ProviderCatalogModelProfile } | null,
  model: ProviderModelMutationPayload,
  mutate: (action: (revision: number, operationId: string) => Promise<unknown>) => Promise<void>,
  environmentId: () => string,
) {
  if (!editor) throw new Error('模型编辑器状态已失效');
  await mutate((revision, operationId) =>
    editor.model
      ? apiUpdateProviderModel(environmentId(), editor.provider.id, editor.model.id, {
          expected_revision: revision,
          operation_id: operationId,
          model,
        })
      : apiCreateProviderModel(environmentId(), editor.provider.id, {
          expected_revision: revision,
          operation_id: operationId,
          model,
        }),
  );
}

function defaultLabel(
  providers: ProviderCatalogProfile[],
  selected: { providerId: string; modelProfileId: string },
): string {
  const provider = providers.find(item => item.id === selected.providerId);
  const model = provider?.models.find(item => item.id === selected.modelProfileId);
  return provider && model
    ? `${provider.displayName} / ${model.displayName}`
    : `${selected.providerId} / ${selected.modelProfileId}`;
}
