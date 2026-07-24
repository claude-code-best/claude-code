import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import {
  apiArchiveProvider,
  apiArchiveProviderModel,
  apiCreateProvider,
  apiCreateProviderModel,
  apiDeleteProvider,
  apiDeleteProviderModel,
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
import { ModelManagerDialog } from '../components/providers/ModelManagerDialog';
import { ProviderAuthDialog } from '../components/providers/ProviderAuthDialog';
import { ProviderCard } from '../components/providers/ProviderCard';
import { ProviderEditorDialog } from '../components/providers/ProviderEditorDialog';
import { discoveredModelMutation } from '../lib/provider-model-manager';

const LAST_PROVIDER_ENVIRONMENT_KEY = 'rcs-provider-environment-id';

function preferredEnvironmentId(environments: Environment[]): string | null {
  if (typeof window !== 'undefined') {
    try {
      const remembered = window.localStorage.getItem(LAST_PROVIDER_ENVIRONMENT_KEY);
      if (remembered && environments.some(environment => environment.id === remembered)) {
        return remembered;
      }
    } catch {
      // localStorage may be unavailable in hardened/private browsing contexts.
    }
  }
  return [...environments].sort((left, right) => (right.last_poll_at ?? 0) - (left.last_poll_at ?? 0))[0]?.id ?? null;
}

export function ProviderSettingsPage({
  environments,
  onRefresh,
}: {
  environments: Environment[];
  onRefresh: () => void | Promise<void>;
}) {
  const [environmentId, setEnvironmentId] = useState(() => preferredEnvironmentId(environments));
  useEffect(() => {
    if (!environments.some(environment => environment.id === environmentId)) {
      setEnvironmentId(preferredEnvironmentId(environments));
    }
  }, [environmentId, environments]);
  useEffect(() => {
    if (!environmentId || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LAST_PROVIDER_ENVIRONMENT_KEY, environmentId);
    } catch {
      // localStorage may be unavailable in hardened/private browsing contexts.
    }
  }, [environmentId]);
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
  const [modelManagerProviderId, setModelManagerProviderId] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<ProviderCatalogProfile | null>(null);
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
    action().catch(error => setNotice(error instanceof Error ? providerErrorMessage(error.message) : '操作失败'));
  const managedProvider = catalog?.providers.find(provider => provider.id === modelManagerProviderId) ?? null;
  const managedDefaultModelId =
    catalog?.defaultModel && managedProvider && catalog.defaultModel.providerId === managedProvider.id
      ? catalog.defaultModel.modelProfileId
      : null;

  useEffect(() => {
    if (modelManagerProviderId !== null && catalog && managedProvider === null) {
      setModelManagerProviderId(null);
    }
  }, [catalog, managedProvider, modelManagerProviderId]);

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
                onDelete={() =>
                  report(() =>
                    mutate((revision, operationId) =>
                      apiDeleteProvider(requireEnvironment(), provider.id, {
                        expected_revision: revision,
                        operation_id: operationId,
                      }),
                    ),
                  )
                }
                onManageModels={() => setModelManagerProviderId(provider.id)}
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
                onDeleteModel={modelId =>
                  report(() =>
                    mutate((revision, operationId) =>
                      apiDeleteProviderModel(requireEnvironment(), provider.id, modelId, {
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
                onAuthenticate={() => setAuthProvider(provider)}
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
      <ModelManagerDialog
        open={managedProvider !== null}
        environmentId={environmentId ?? ''}
        provider={managedProvider}
        defaultModelId={managedDefaultModelId}
        disabled={disabled || busy}
        onClose={() => setModelManagerProviderId(null)}
        onAdd={async discovered => {
          if (!managedProvider) throw new Error('供应商状态已失效');
          const existing = managedProvider.models.find(model => model.remoteModelId === discovered.remoteModelId);
          try {
            await mutate((revision, operationId) =>
              existing
                ? apiUpdateProviderModel(requireEnvironment(), managedProvider.id, existing.id, {
                    expected_revision: revision,
                    operation_id: operationId,
                    model: {
                      id: existing.id,
                      display_name: existing.displayName,
                      remote_model_id: existing.remoteModelId,
                      enabled: true,
                      archived: false,
                      validation: { status: 'unverified' },
                    },
                  })
                : apiCreateProviderModel(requireEnvironment(), managedProvider.id, {
                    expected_revision: revision,
                    operation_id: operationId,
                    model: discoveredModelMutation(discovered, managedProvider.models),
                  }),
            );
          } catch (error) {
            throw new Error(providerErrorMessage(error instanceof Error ? error.message : '操作失败'));
          }
        }}
        onRemove={async model => {
          if (!managedProvider) throw new Error('供应商状态已失效');
          try {
            await mutate((revision, operationId) =>
              apiArchiveProviderModel(requireEnvironment(), managedProvider.id, model.id, {
                expected_revision: revision,
                operation_id: operationId,
              }),
            );
          } catch (error) {
            throw new Error(providerErrorMessage(error instanceof Error ? error.message : '操作失败'));
          }
        }}
        onManualAdd={() => {
          if (!managedProvider) return;
          setModelManagerProviderId(null);
          setModelEditor({ provider: managedProvider });
        }}
      />
      <ProviderAuthDialog
        environmentId={environmentId ?? ''}
        provider={authProvider}
        onClose={() => setAuthProvider(null)}
        onChanged={async () => {
          await remote.refresh();
          await onRefresh();
        }}
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

const PROVIDER_ERROR_MESSAGES: Record<string, string> = {
  // 验证探测结果
  authentication_required: '未配置凭证：请先为该供应商配置密钥，再进行验证。',
  authentication_failed: '验证失败：凭证被拒绝（密钥无效或无权限）。',
  endpoint_not_found: '验证失败：找不到接口地址，请检查 Base URL 是否正确。',
  model_not_allowed: '该模型不在允许列表内，无法使用。',
  provider_unavailable: '供应商暂时不可用（服务端 5xx），请稍后重试。',
  provider_unreachable: '无法连接到供应商，请检查网络与 Base URL。',
  probe_timeout: '验证超时，请稍后重试或检查网络。',
  probe_unsupported_provider: '该供应商类型（OAuth 订阅 / 云凭证）暂不支持联网验证，请在终端登录后使用。',
  // 目录写操作
  default_model_conflict: '该项是当前默认模型，请先切换默认模型再操作。',
  provider_revision_conflict: '目录已被其它操作更新，请刷新后重试。',
  provider_operation_conflict: '相同操作正在处理中，请稍后重试。',
  provider_not_found: '供应商不存在（可能已被删除）。',
  model_not_found: '模型不存在（可能已被删除）。',
  provider_command_timeout: '本地 Worker 无响应（超时），请确认其在线后重试。',
  provider_command_failed: '本地 Worker 执行失败，请检查其运行状态。',
  provider_management_unsupported: '当前 Worker 不支持在线管理供应商，请升级后重试。',
};

function providerErrorMessage(code: string): string {
  return PROVIDER_ERROR_MESSAGES[code] ?? code;
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
