import { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Check, ChevronDown, FolderOpen, Loader2, Map, Pencil, Shield, ShieldOff } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ControlRequestResult } from '../lib/rcs-chat-adapter';
import {
  buildSessionModelOptions,
  findSelectedSessionModel,
  type SessionModelOption,
} from '../lib/session-model-options';
import type { ProviderModelCatalog, SessionInitInfo, SessionModelSelection, TokenUsageTotals } from '../types';

// =============================================================================
// 会话控制条 — 终端高级功能的可视化入口
//
// 权限模式（终端 Shift+Tab 循环）、模型切换（/model）、扩展思考（/think）
// 都通过 SDK control_request 直达 CLI，与终端行为一致。
// =============================================================================

export type PermissionModeId = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions';

const PERMISSION_MODES: Array<{
  id: PermissionModeId;
  label: string;
  hint: string;
  icon: React.ReactNode;
  accent: string;
}> = [
  {
    id: 'default',
    label: '标准',
    hint: '每次敏感操作前询问（终端默认模式）',
    icon: <Shield className="h-3.5 w-3.5" />,
    accent: 'text-text-secondary',
  },
  {
    id: 'acceptEdits',
    label: '自动编辑',
    hint: '自动批准文件编辑（Shift+Tab 循环第二档）',
    icon: <Pencil className="h-3.5 w-3.5" />,
    accent: 'text-status-active',
  },
  {
    id: 'plan',
    label: '规划',
    hint: '只读规划模式，先出方案再执行',
    icon: <Map className="h-3.5 w-3.5" />,
    accent: 'text-brand',
  },
  {
    id: 'bypassPermissions',
    label: '跳过权限',
    hint: '跳过全部权限确认（需 CLI 以 --dangerously-skip-permissions 启动）',
    icon: <ShieldOff className="h-3.5 w-3.5" />,
    accent: 'text-status-error',
  },
];

const MODEL_OPTIONS: Array<{ id: string | null; label: string; hint: string }> = [
  { id: null, label: '默认模型', hint: '跟随 CLI 当前配置' },
  { id: 'opus', label: 'Opus', hint: '最强推理，速度较慢' },
  { id: 'sonnet', label: 'Sonnet', hint: '平衡性能与速度' },
  { id: 'haiku', label: 'Haiku', hint: '最快，适合轻量任务' },
];

/** 默认扩展思考预算（tokens），与终端 /think 档位一致的中档值 */
const THINKING_BUDGET_TOKENS = 16000;

interface SessionControlBarProps {
  sessionInfo: SessionInitInfo | null;
  usage: TokenUsageTotals | null;
  /** 会话创建时指定的权限模式（system/init 到达前的初始值） */
  initialPermissionMode?: string | null;
  providerCatalog?: ProviderModelCatalog | null;
  modelSelection?: SessionModelSelection | null;
  catalogStale?: boolean;
  disabled?: boolean;
  onSetPermissionMode: (mode: string) => Promise<ControlRequestResult>;
  onSetModel: (model: string | null) => Promise<ControlRequestResult>;
  onSetProviderModel?: (model: SessionModelOption, revision: number) => Promise<ControlRequestResult>;
  onSetThinking: (maxTokens: number | null) => Promise<ControlRequestResult>;
}

export function SessionControlBar({
  sessionInfo,
  usage,
  initialPermissionMode,
  providerCatalog,
  modelSelection,
  catalogStale = false,
  disabled = false,
  onSetPermissionMode,
  onSetModel,
  onSetProviderModel,
  onSetThinking,
}: SessionControlBarProps) {
  const [mode, setMode] = useState<string>(initialPermissionMode || 'default');
  const [model, setModel] = useState<string | null>(null);
  const [providerSelection, setProviderSelection] = useState<SessionModelSelection | null>(modelSelection ?? null);
  const [thinking, setThinking] = useState<boolean | null>(null);
  const [pending, setPending] = useState<'mode' | 'model' | 'thinking' | null>(null);
  const [error, setError] = useState('');
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const modelMenuRef = useRef<HTMLDivElement>(null);
  const providerModels = useMemo(
    () => (providerCatalog ? buildSessionModelOptions(providerCatalog) : []),
    [providerCatalog],
  );
  const usesProviderCatalog =
    providerCatalog?.features.runtimeSwitch === true && providerModels.length > 0 && onSetProviderModel !== undefined;

  // system/init 报告的实际状态优先于本地乐观值
  useEffect(() => {
    if (sessionInfo?.permissionMode) setMode(sessionInfo.permissionMode);
  }, [sessionInfo?.permissionMode]);

  useEffect(() => {
    const reported = sessionInfo?.model?.toLowerCase();
    if (!reported) {
      setModel(null);
    } else if (reported.includes('opus')) {
      setModel('opus');
    } else if (reported.includes('sonnet')) {
      setModel('sonnet');
    } else if (reported.includes('haiku')) {
      setModel('haiku');
    } else {
      setModel(sessionInfo?.model ?? null);
    }
  }, [sessionInfo?.model]);

  useEffect(() => setProviderSelection(modelSelection ?? null), [modelSelection]);

  // 点击外部关闭模型菜单
  useEffect(() => {
    if (!modelMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!modelMenuRef.current?.contains(e.target as Node)) setModelMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [modelMenuOpen]);

  const showError = (message: string) => {
    setError(message);
    setTimeout(() => setError(''), 6000);
  };

  const handleMode = async (next: PermissionModeId) => {
    if (disabled || pending || next === mode) return;
    const previous = mode;
    setMode(next);
    setPending('mode');
    const result = await onSetPermissionMode(next);
    setPending(null);
    if (!result.ok) {
      setMode(previous);
      showError(result.error);
    }
  };

  const handleModel = async (next: string | null) => {
    setModelMenuOpen(false);
    if (disabled || pending || next === model) return;
    const previous = model;
    setModel(next);
    setPending('model');
    const result = await onSetModel(next);
    setPending(null);
    if (!result.ok) {
      setModel(previous);
      showError(result.error);
    }
  };

  const handleProviderModel = async (next: SessionModelOption) => {
    setModelMenuOpen(false);
    if (
      disabled ||
      catalogStale ||
      pending ||
      !providerCatalog ||
      !onSetProviderModel ||
      (providerSelection?.provider_id === next.providerId && providerSelection.model_profile_id === next.modelProfileId)
    )
      return;
    if (next.unverified && !window.confirm('该模型尚未验证，仍切换当前会话吗？')) return;
    const previous = providerSelection;
    setProviderSelection({
      provider_id: next.providerId,
      model_profile_id: next.modelProfileId,
      resolved_model_id: next.remoteModelId,
      provider_config_revision: providerCatalog.revision,
      updated_at: Date.now(),
    });
    setPending('model');
    const result = await onSetProviderModel(next, providerCatalog.revision);
    setPending(null);
    if (!result.ok) {
      setProviderSelection(previous);
      showError(modelControlError(result.error));
    }
  };

  const handleThinking = async () => {
    if (disabled || pending) return;
    const previous = thinking;
    const next = thinking !== true;
    setThinking(next);
    setPending('thinking');
    const result = await onSetThinking(next ? THINKING_BUDGET_TOKENS : null);
    setPending(null);
    if (!result.ok) {
      setThinking(previous);
      showError(result.error);
    }
  };

  const selectedProviderModel = findSelectedSessionModel(providerModels, providerSelection);
  const activeModel = usesProviderCatalog
    ? (selectedProviderModel?.label ??
      (providerSelection
        ? `${providerSelection.provider_id} / ${providerSelection.model_profile_id}`
        : sessionInfo?.model || '未记录模型'))
    : (MODEL_OPTIONS.find(option => option.id === model)?.label ?? model ?? '默认模型');
  const reportedModel = sessionInfo?.model;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 sm:px-8">
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-surface-1/80 px-2 py-1.5 backdrop-blur-sm">
        {/* 权限模式分段控件 */}
        <div className="flex items-center rounded-lg bg-surface-2/70 p-0.5" role="group" aria-label="权限模式">
          {PERMISSION_MODES.map(item => {
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleMode(item.id)}
                disabled={disabled || pending !== null}
                title={item.hint}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-1 font-display text-[11px] transition-colors',
                  active
                    ? cn('bg-surface-0 shadow-sm font-medium', item.accent)
                    : 'text-text-muted hover:text-text-secondary',
                  (disabled || pending !== null) && 'opacity-60 cursor-not-allowed',
                )}
              >
                {pending === 'mode' && active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : item.icon}
                <span className="hidden sm:inline">{item.label}</span>
              </button>
            );
          })}
        </div>

        <span className="h-4 w-px bg-border" />

        {/* 模型选择 */}
        <div className="relative" ref={modelMenuRef}>
          <button
            type="button"
            onClick={() => setModelMenuOpen(open => !open)}
            disabled={disabled || pending !== null || (usesProviderCatalog && catalogStale)}
            title={
              usesProviderCatalog
                ? catalogStale
                  ? '当前为缓存模型目录，请刷新运行环境后切换'
                  : '切换并持久化当前会话的供应商模型'
                : reportedModel
                  ? `CLI 当前模型：${reportedModel}`
                  : '旧版 Worker 模型切换（等同 /model）'
            }
            className={cn(
              'flex items-center gap-1 rounded-lg px-2 py-1 font-display text-[11px] text-text-secondary transition-colors hover:bg-surface-2',
              (disabled || pending !== null) && 'opacity-60 cursor-not-allowed',
            )}
          >
            {pending === 'model' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            )}
            {activeModel}
            <ChevronDown className="h-3 w-3 text-text-muted" />
          </button>
          {modelMenuOpen && pending === null && (
            <div className="absolute bottom-full left-0 z-40 mb-1 max-h-80 w-72 overflow-y-auto rounded-xl border border-border bg-surface-1 p-1 shadow-xl">
              {usesProviderCatalog
                ? providerModels.map(option => {
                    const selected =
                      providerSelection?.provider_id === option.providerId &&
                      providerSelection.model_profile_id === option.modelProfileId;
                    const environmentDefault =
                      providerCatalog?.defaultModel?.providerId === option.providerId &&
                      providerCatalog.defaultModel.modelProfileId === option.modelProfileId;
                    return (
                      <button
                        key={`${option.providerId}:${option.modelProfileId}`}
                        type="button"
                        onClick={() => void handleProviderModel(option)}
                        className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand">
                          {selected && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block font-display text-[12px] text-text-primary">{option.label}</span>
                          <span className="block font-display text-[10px] text-text-muted">
                            {option.remoteModelId}
                            {environmentDefault ? ' · 新对话默认' : ''}
                            {option.unverified ? ' · 未验证' : ''}
                          </span>
                        </span>
                      </button>
                    );
                  })
                : MODEL_OPTIONS.map(option => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => handleModel(option.id)}
                      className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-surface-2"
                    >
                      <span className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-brand">
                        {model === option.id && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-display text-[12px] text-text-primary">{option.label}</span>
                        <span className="block font-display text-[10px] text-text-muted">{option.hint}</span>
                      </span>
                    </button>
                  ))}
            </div>
          )}
        </div>

        {/* 扩展思考开关 */}
        <button
          type="button"
          onClick={handleThinking}
          disabled={disabled || pending !== null}
          title={
            thinking === null
              ? `CLI 未上报当前思考预算；点击设置为 ${THINKING_BUDGET_TOKENS.toLocaleString()} tokens`
              : thinking
                ? '关闭本页已设置的扩展思考'
                : `开启扩展思考（预算 ${THINKING_BUDGET_TOKENS.toLocaleString()} tokens）`
          }
          className={cn(
            'flex items-center gap-1 rounded-lg px-2 py-1 font-display text-[11px] transition-colors',
            thinking ? 'bg-brand/10 text-brand' : 'text-text-muted hover:bg-surface-2 hover:text-text-secondary',
            (disabled || pending !== null) && 'opacity-60 cursor-not-allowed',
          )}
        >
          {pending === 'thinking' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Brain className="h-3.5 w-3.5" />
          )}
          思考
        </button>

        {/* 右侧：工作目录 + token 用量 */}
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {usage && usage.apiCalls > 0 && (
            <span
              className="hidden font-mono text-[10px] text-text-muted md:inline"
              title={`输入 ${usage.inputTokens.toLocaleString()} · 输出 ${usage.outputTokens.toLocaleString()} · 缓存读取 ${usage.cacheReadInputTokens.toLocaleString()} tokens`}
            >
              ↑{formatTokens(usage.inputTokens + usage.cacheCreationInputTokens)} ↓{formatTokens(usage.outputTokens)}
            </span>
          )}
          {sessionInfo?.cwd && (
            <span
              className="flex min-w-0 items-center gap-1 font-mono text-[10px] text-text-muted"
              title={`工作目录：${sessionInfo.cwd}`}
            >
              <FolderOpen className="h-3 w-3 flex-shrink-0" />
              <span className="max-w-[180px] truncate">{sessionInfo.cwd}</span>
            </span>
          )}
        </div>
      </div>
      {error && <p className="mt-1 px-1 font-display text-[11px] text-status-error">{error}</p>}
    </div>
  );
}

export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}k`;
  return String(count);
}

function modelControlError(error: string): string {
  const messages: Record<string, string> = {
    provider_revision_conflict: '模型目录已更新，请刷新后重试',
    authentication_required: '该供应商尚未完成认证',
    provider_not_found: '供应商已不存在或已归档',
    model_not_found: '模型已不存在或已归档',
    provider_unavailable: '供应商当前不可用',
    model_unavailable: '模型当前不可用',
    model_not_allowed: '该模型被管理员策略禁止',
    runtime_busy: '当前回合仍在运行，请在结束后切换模型',
    runtime_operation_conflict: '模型切换操作与已完成操作冲突，请重试',
    activation_failed: '本地 Worker 激活模型失败',
  };
  return messages[error] ?? error;
}
