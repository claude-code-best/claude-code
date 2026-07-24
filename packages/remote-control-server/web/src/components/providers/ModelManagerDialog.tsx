import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, LoaderCircle, Minus, Plus, RefreshCw, Search, X } from 'lucide-react';
import { apiDiscoverProviderModels } from '../../api/client';
import { parseProviderCatalogResponse, parseProviderModelDiscovery } from '../../lib/provider-catalog-model';
import { mergeManagedProviderModels, type ManagedProviderModel } from '../../lib/provider-model-manager';
import type {
  ProviderCatalogModelProfile,
  ProviderCatalogProfile,
  ProviderDiscoveredModel,
  ProviderModelDiscovery,
} from '../../types';

export function ModelManagerDialog({
  open,
  environmentId,
  provider,
  defaultModelId,
  disabled,
  onClose,
  onAdd,
  onRemove,
  onManualAdd,
}: {
  open: boolean;
  environmentId: string;
  provider: ProviderCatalogProfile | null;
  defaultModelId: string | null;
  disabled: boolean;
  onClose: () => void;
  onAdd: (model: ProviderDiscoveredModel) => Promise<void>;
  onRemove: (model: ProviderCatalogModelProfile) => Promise<void>;
  onManualAdd: () => void;
}) {
  const titleId = useId();
  const providerId = provider?.id ?? null;
  const controller = useRef<AbortController | null>(null);
  const [discovery, setDiscovery] = useState<ProviderModelDiscovery | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingRemoteId, setPendingRemoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!open || !providerId || !environmentId) return;
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setLoading(true);
    setError(null);
    try {
      const response = parseProviderCatalogResponse(
        await apiDiscoverProviderModels(environmentId, providerId, nextController.signal),
      );
      const next = parseProviderModelDiscovery(response.value);
      if (next.providerId !== providerId) throw new Error('invalid_model_discovery_response');
      setDiscovery(next);
    } catch (reason) {
      if (nextController.signal.aborted) return;
      setError(modelDiscoveryErrorMessage(reason instanceof Error ? reason.message : 'model_discovery_failed'));
    } finally {
      if (!nextController.signal.aborted) setLoading(false);
    }
  }, [environmentId, open, providerId]);

  useEffect(() => {
    if (!open) return;
    setDiscovery(null);
    setQuery('');
    setPendingRemoteId(null);
    setError(null);
    void refresh();
    return () => controller.current?.abort();
  }, [open, providerId, refresh]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && pendingRemoteId === null) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open, pendingRemoteId]);

  const rows = useMemo(
    () => mergeManagedProviderModels(discovery?.models ?? [], provider?.models ?? []),
    [discovery, provider?.models],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    if (!needle) return rows;
    return rows.filter(
      model =>
        model.displayName.toLocaleLowerCase().includes(needle) ||
        model.remoteModelId.toLocaleLowerCase().includes(needle) ||
        model.ownedBy?.toLocaleLowerCase().includes(needle),
    );
  }, [query, rows]);
  const enabled = filtered.filter(isEnabled);
  const available = filtered.filter(model => !isEnabled(model));
  const enabledCount = rows.filter(isEnabled).length;

  if (!open || !provider) return null;

  const toggle = async (model: ManagedProviderModel) => {
    if (disabled || pendingRemoteId !== null) return;
    setPendingRemoteId(model.remoteModelId);
    setError(null);
    try {
      if (isEnabled(model) && model.configured) {
        await onRemove(model.configured);
      } else {
        await onAdd(model);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '操作失败');
    } finally {
      setPendingRemoteId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onMouseDown={event => {
        if (event.target === event.currentTarget && pendingRemoteId === null) onClose();
      }}
    >
      <section className="flex max-h-[86vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-surface-2 shadow-2xl">
        <header className="border-b border-border px-5 pb-4 pt-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id={titleId} className="text-lg font-medium text-text-primary">
                管理 {provider.displayName} 模型
              </h2>
              <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
                从供应商获取可用模型；凭证仅由本地 Worker 使用，不会发送到浏览器。
              </p>
            </div>
            <button
              type="button"
              aria-label="关闭"
              disabled={pendingRemoteId !== null}
              onClick={onClose}
              className="rounded-md p-1.5 text-text-muted hover:bg-surface-1 hover:text-text-primary disabled:opacity-40"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 flex gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <span className="sr-only">搜索模型</span>
              <input
                autoFocus
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="搜索模型名称或 Remote ID"
                className="w-full rounded-lg border border-border bg-surface-1 py-2 pl-9 pr-3 text-xs outline-none transition focus:border-brand/60 focus:ring-2 focus:ring-brand/10"
              />
            </label>
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={loading || pendingRemoteId !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-3 text-xs hover:bg-surface-3/60 disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新列表
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-text-muted">
            <span>已启用 {enabledCount}</span>
            <span>供应商返回 {discovery?.models.length ?? 0}</span>
            {discovery && <span>更新于 {new Date(discovery.fetchedAt).toLocaleTimeString()}</span>}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-4 rounded-lg border border-warning-border bg-warning-bg px-3 py-2 text-[11px] leading-relaxed text-warning-text">
              {error}
            </div>
          )}
          {loading && discovery === null && (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              正在从供应商获取模型列表…
            </div>
          )}

          {(!loading || discovery !== null) && (
            <div className="space-y-5">
              <ModelSection
                title="已启用"
                description="这些模型可用于新建对话"
                rows={enabled}
                emptyText={query ? '没有匹配的已启用模型' : '尚未启用模型'}
                defaultModelId={defaultModelId}
                disabled={disabled}
                pendingRemoteId={pendingRemoteId}
                onToggle={toggle}
              />
              <ModelSection
                title="可添加"
                description="点击右侧 + 快捷加入对话模型"
                rows={available}
                emptyText={query ? '没有匹配的可用模型' : discovery ? '供应商列表中的模型均已启用' : '暂无远程模型列表'}
                defaultModelId={defaultModelId}
                disabled={disabled}
                pendingRemoteId={pendingRemoteId}
                onToggle={toggle}
              />
            </div>
          )}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border bg-surface-1/70 px-5 py-3">
          <p className="text-[10px] text-text-muted">列表未包含的模型仍可自主添加。</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onManualAdd}
              disabled={disabled || pendingRemoteId !== null}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-2 px-3 py-2 text-xs hover:bg-surface-3/60 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              手动添加模型
            </button>
            <button type="button" onClick={onClose} className="rounded-md bg-brand px-3 py-2 text-xs text-white">
              完成
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function ModelSection({
  title,
  description,
  rows,
  emptyText,
  defaultModelId,
  disabled,
  pendingRemoteId,
  onToggle,
}: {
  title: string;
  description: string;
  rows: ManagedProviderModel[];
  emptyText: string;
  defaultModelId: string | null;
  disabled: boolean;
  pendingRemoteId: string | null;
  onToggle: (model: ManagedProviderModel) => Promise<void>;
}) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-medium text-text-primary">
          {title}
          <span className="ml-1.5 rounded-full bg-surface-3 px-1.5 py-0.5 text-[9px] text-text-secondary">
            {rows.length}
          </span>
        </h3>
        <p className="text-[10px] text-text-muted">{description}</p>
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-surface-1">
        {rows.map(model => {
          const enabled = isEnabled(model);
          const isDefault = model.configured?.id === defaultModelId;
          const pending = pendingRemoteId === model.remoteModelId;
          return (
            <div
              key={model.remoteModelId}
              className={`flex items-center gap-3 border-b border-border/70 px-3 py-2.5 last:border-b-0 ${
                enabled ? 'bg-brand/[0.045]' : ''
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-medium ${
                  enabled ? 'bg-brand/10 text-brand' : 'bg-surface-3 text-text-secondary'
                }`}
              >
                {enabled ? <Check className="h-3.5 w-3.5" /> : model.displayName.slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate text-xs font-medium text-text-primary">{model.displayName}</p>
                  {isDefault && <Tag>默认</Tag>}
                  {!model.discovered && <Tag>手动</Tag>}
                  {model.configured?.archived && <Tag>已停用</Tag>}
                </div>
                <p className="mt-0.5 truncate font-mono text-[9px] text-text-muted">
                  {model.remoteModelId}
                  {model.ownedBy ? ` · ${model.ownedBy}` : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label={enabled ? `移除 ${model.displayName}` : `添加 ${model.displayName}`}
                title={
                  isDefault ? '默认模型不可移除，请先切换默认模型' : enabled ? '从对话模型中移除' : '添加到对话模型'
                }
                disabled={disabled || pendingRemoteId !== null || isDefault}
                onClick={() => void onToggle(model)}
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-35 ${
                  enabled
                    ? 'border-border bg-surface-2 text-text-secondary hover:border-status-error/30 hover:text-status-error'
                    : 'border-brand/25 bg-brand/5 text-brand hover:bg-brand/10'
                }`}
              >
                {pending ? (
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                ) : enabled ? (
                  <Minus className="h-4 w-4" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
              </button>
            </div>
          );
        })}
        {rows.length === 0 && <p className="px-3 py-5 text-center text-[11px] text-text-muted">{emptyText}</p>}
      </div>
    </section>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="shrink-0 rounded bg-brand/10 px-1.5 py-0.5 text-[8px] text-brand">{children}</span>;
}

function isEnabled(model: ManagedProviderModel): boolean {
  return model.configured?.enabled === true && !model.configured.archived;
}

const MODEL_DISCOVERY_ERROR_MESSAGES: Record<string, string> = {
  authentication_required: '尚未配置供应商凭证。请先完成认证，或使用下方“手动添加模型”。',
  authentication_failed: '供应商拒绝了当前凭证，请重新认证后刷新列表。',
  model_discovery_unsupported_provider: '该供应商类型暂不支持自动获取模型列表，请继续手动添加。',
  model_list_unsupported: '该接口没有提供模型列表能力，请继续手动添加。',
  model_discovery_rate_limited: '获取模型列表过于频繁，请稍后再试。',
  model_discovery_timeout: '获取模型列表超时，请检查网络或 Base URL 后重试。',
  provider_unreachable: '无法连接到供应商，请检查网络与 Base URL。',
  provider_unavailable: '供应商暂时不可用，请稍后刷新。',
  invalid_model_discovery_response: '供应商返回了无法识别的模型列表格式，请继续手动添加。',
  provider_command_timeout: '本地 Worker 无响应，请确认运行环境在线。',
  provider_management_unsupported: '当前 Worker 版本不支持模型列表管理，请升级后重试。',
};

function modelDiscoveryErrorMessage(code: string): string {
  return MODEL_DISCOVERY_ERROR_MESSAGES[code] ?? code;
}
