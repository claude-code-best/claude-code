import { useMemo, useState } from 'react';
import { Check, KeyRound, Network, X } from 'lucide-react';
import { apiSendEvent } from '../api/client';
import { generateMessageUuid } from '../lib/utils';
import type { Environment, Session } from '../types';

interface ProviderView {
  id: string;
  kind?: string;
  baseUrl?: string;
  model?: string;
  compatRule?: string;
  keyEnv?: string;
  keyConfigured: boolean;
  environmentId: string;
  current: boolean;
}

export function ProviderSettingsPage({
  environments,
  sessions,
  onOpenSession,
}: {
  environments: Environment[];
  sessions: Session[];
  onOpenSession: (id: string) => void;
}) {
  const providers = useMemo(() => readProviders(environments), [environments]);
  const [busy, setBusy] = useState<string | null>(null);
  const requestTest = async (provider: ProviderView) => {
    const session = sessions.find(item => item.environment_id === provider.environmentId && item.status !== 'archived');
    if (!session) return;
    setBusy(provider.id);
    try {
      const uuid = generateMessageUuid();
      const content = `请对 Provider “${provider.id}”执行一次最小化连通性检查，不要回显任何密钥；报告 DNS/认证/模型端点是否可用。`;
      await apiSendEvent(session.id, { type: 'user', uuid, content, message: { content } });
      onOpenSession(session.id);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-medium text-text-primary">模型供应商</h1>
        <p className="mt-1 text-sm text-text-muted">
          只展示配置状态，不读取或回显密钥内容。模型映射来自 Claude Code 环境注册。
        </p>
        <div className="mt-7 border-t border-border">
          {providers.length === 0 ? (
            <p className="py-8 text-[11px] text-text-muted">
              当前在线环境尚未报告 Provider 配置。重新连接新版 Claude Code 后会显示。
            </p>
          ) : (
            providers.map(provider => {
              const session = sessions.find(
                item => item.environment_id === provider.environmentId && item.status !== 'archived',
              );
              return (
                <div
                  key={`${provider.environmentId}:${provider.id}`}
                  className="grid gap-3 border-b border-border/70 py-4 sm:grid-cols-[150px_minmax(0,1fr)_auto]"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-text-primary">{provider.id}</span>
                      {provider.current && (
                        <span className="rounded bg-brand/[0.09] px-1.5 py-0.5 text-[8px] text-brand">current</span>
                      )}
                    </div>
                    <p className="mt-1 text-[9px] text-text-muted">{provider.kind}</p>
                  </div>
                  <div className="min-w-0 space-y-1 font-mono text-[9px] text-text-muted">
                    <p className="truncate">{provider.baseUrl}</p>
                    <p>
                      {provider.model}
                      {provider.compatRule ? ` · ${provider.compatRule}` : ''}
                    </p>
                    <p className="flex items-center gap-1.5">
                      {provider.keyConfigured ? (
                        <Check className="h-3 w-3 text-status-active" />
                      ) : (
                        <X className="h-3 w-3 text-text-muted" />
                      )}
                      <KeyRound className="h-3 w-3" />
                      {provider.keyEnv} · {provider.keyConfigured ? '已配置' : '未配置'}
                    </p>
                  </div>
                  <div className="flex items-center">
                    {session && (
                      <button
                        type="button"
                        disabled={busy === provider.id}
                        onClick={() => void requestTest(provider)}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-[9px] text-text-secondary hover:bg-surface-2 disabled:opacity-40"
                      >
                        <Network className="h-3 w-3" />
                        在会话中测试
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function readProviders(environments: Environment[]): ProviderView[] {
  return environments.flatMap(env => {
    const provider = env.capabilities?.provider;
    if (!provider || typeof provider !== 'object') return [];
    const record = provider as Record<string, unknown>;
    const current = typeof record.current === 'string' ? record.current : '';
    if (!Array.isArray(record.configs)) return [];
    return record.configs.flatMap(item => {
      if (!item || typeof item !== 'object') return [];
      const config = item as Record<string, unknown>;
      const id = typeof config.id === 'string' ? config.id : '';
      if (!id) return [];
      return [
        {
          id,
          kind: stringValue(config.kind),
          baseUrl: stringValue(config.base_url),
          model: stringValue(config.default_model),
          compatRule: stringValue(config.compat_rule),
          keyEnv: stringValue(config.key_env),
          keyConfigured: config.key_configured === true,
          environmentId: env.id,
          current: id === current,
        },
      ];
    });
  });
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
