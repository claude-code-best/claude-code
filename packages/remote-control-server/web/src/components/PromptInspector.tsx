import { useState } from 'react';
import { FileText, Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { MessageResponse } from '../../components/ai-elements/message';
import type { ControlRequestResult } from '../lib/rcs-chat-adapter';
import { cn } from '../lib/utils';

// =============================================================================
// Prompt Inspector — 侧边栏"提示词"区块 + 原文查看弹窗
// 数据来自 CLI 的 get_system_prompt 控制请求，返回与实际发给模型
// 完全一致的分节原文（system_prompt / claude_md / append_system_prompt …）。
// =============================================================================

export interface PromptSection {
  id: string;
  title: string;
  text: string;
}

/** 解析 control_response 里的 { sections } 载荷；结构不符时返回空数组。 */
export function parsePromptSections(data: unknown): PromptSection[] {
  if (typeof data !== 'object' || data === null) return [];
  const sections = (data as Record<string, unknown>).sections;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap(item => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.id !== 'string' || typeof record.text !== 'string') return [];
    return [
      {
        id: record.id,
        title: typeof record.title === 'string' && record.title ? record.title : record.id,
        text: record.text,
      },
    ];
  });
}

const SYSTEM_SECTION_IDS = new Set(['system_prompt', 'custom_system_prompt', 'append_system_prompt']);

function isProjectSection(section: PromptSection): boolean {
  return section.id === 'claude_md' || section.id.startsWith('user_context:');
}

/** 中文别名 — 常见 section id 的友好标题，未知 id 保留 CLI 下发的 title。 */
const SECTION_LABELS: Record<string, string> = {
  system_prompt: '系统提示词',
  custom_system_prompt: '自定义系统提示词 (--system-prompt)',
  append_system_prompt: '追加系统提示词 (--append-system-prompt)',
  claude_md: '项目提示词 (CLAUDE.md)',
  'user_context:currentDate': '当前日期注入',
};

function sectionLabel(section: PromptSection): string {
  return SECTION_LABELS[section.id] ?? section.title;
}

type PromptKind = 'system' | 'project';

interface PromptInspectorProps {
  onControl?: (subtype: string, params?: Record<string, unknown>) => Promise<ControlRequestResult>;
  offline: boolean;
}

export function PromptInspector({ onControl, offline }: PromptInspectorProps) {
  const [sections, setSections] = useState<PromptSection[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<PromptKind | 'refresh' | null>(null);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(true);

  const disabled = offline || !onControl;

  const fetchSections = async (): Promise<PromptSection[] | null> => {
    if (!onControl) return null;
    const result = await onControl('get_system_prompt');
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    const parsed = parsePromptSections(result.data);
    if (parsed.length === 0) {
      setError('CLI 未返回提示词内容（可能版本过旧，不支持 get_system_prompt）');
      return null;
    }
    setSections(parsed);
    return parsed;
  };

  const openPrompt = async (kind: PromptKind) => {
    if (disabled || loading) return;
    setError(null);
    setLoading(kind);
    try {
      const parsed = await fetchSections();
      if (!parsed) return;
      const initial =
        kind === 'system'
          ? (parsed.find(section => SYSTEM_SECTION_IDS.has(section.id)) ?? parsed[0])
          : parsed.find(isProjectSection);
      setSelectedId(initial?.id ?? parsed[0]?.id ?? null);
      setRawMode(true);
      setOpen(true);
      if (kind === 'project' && !initial) {
        setError('该会话未加载 CLAUDE.md 项目提示词');
      }
    } finally {
      setLoading(null);
    }
  };

  const refresh = async () => {
    if (disabled || loading) return;
    setError(null);
    setLoading('refresh');
    try {
      await fetchSections();
    } finally {
      setLoading(null);
    }
  };

  const selected = sections.find(section => section.id === selectedId) ?? sections[0];

  return (
    <>
      <div className="space-y-1">
        <PromptRow
          icon={<ScrollText />}
          label="系统提示词"
          hint="普通对话实际使用的完整 system prompt 原文"
          disabled={disabled}
          loading={loading === 'system'}
          onClick={() => void openPrompt('system')}
        />
        <PromptRow
          icon={<FileText />}
          label="项目提示词 (CLAUDE.md)"
          hint="注入会话上下文的项目级提示词原文"
          disabled={disabled}
          loading={loading === 'project'}
          onClick={() => void openPrompt('project')}
        />
        {disabled && <p className="pt-1 text-[9px] leading-4 text-text-muted">CLI 离线时无法读取原始提示词。</p>}
        {error && !open && <p className="pt-1 text-[9px] leading-4 text-status-error">{error}</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[82vh] flex-col gap-3 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display text-base">提示词原文</DialogTitle>
            <DialogDescription className="text-xs">
              以下内容由 CLI 实时组装，与实际发送给模型的提示词一致。
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2">
            <div className="flex overflow-hidden rounded-md border border-border">
              <ModeButton active={rawMode} onClick={() => setRawMode(true)}>
                原文
              </ModeButton>
              <ModeButton active={!rawMode} onClick={() => setRawMode(false)}>
                Markdown
              </ModeButton>
            </div>
            <button
              type="button"
              disabled={loading !== null}
              onClick={() => void refresh()}
              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-text-muted hover:text-text-primary disabled:opacity-40"
            >
              {loading === 'refresh' ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              刷新
            </button>
            {selected && (
              <span className="ml-auto font-mono text-[9px] text-text-muted">{selected.text.length} chars</span>
            )}
          </div>

          {error && <p className="text-[10px] text-status-error">{error}</p>}

          <div className="flex min-h-0 flex-1 gap-3">
            <div className="w-44 flex-shrink-0 overflow-y-auto rounded-md border border-border bg-surface-0/40 py-1">
              {sections.map(section => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setSelectedId(section.id)}
                  className={cn(
                    'block w-full border-l-2 px-2.5 py-2 text-left text-[10px] leading-4 transition-colors',
                    section.id === selected?.id
                      ? 'border-brand bg-brand/[0.07] text-text-primary'
                      : 'border-transparent text-text-muted hover:bg-surface-2 hover:text-text-primary',
                  )}
                >
                  {sectionLabel(section)}
                </button>
              ))}
            </div>
            <div className="min-w-0 flex-1 overflow-y-auto rounded-md border border-border bg-surface-2 p-3">
              {selected ? (
                rawMode ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text-secondary">
                    {selected.text}
                  </pre>
                ) : (
                  <div className="text-sm">
                    <MessageResponse>{selected.text}</MessageResponse>
                  </div>
                )
              ) : (
                <p className="text-xs text-text-muted">暂无内容。</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function PromptRow({
  icon,
  label,
  hint,
  disabled,
  loading,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      onClick={onClick}
      className="flex w-full items-start gap-2 rounded-md px-1.5 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-text-muted [&>svg]:h-3.5 [&>svg]:w-3.5">
        {loading ? <Loader2 className="animate-spin" /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-medium text-text-primary">{label}</span>
        <span className="block text-[9px] leading-4 text-text-muted">{hint}</span>
      </span>
    </button>
  );
}

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'px-2.5 py-1 text-[10px] transition-colors',
        active ? 'bg-brand/10 font-medium text-brand' : 'text-text-muted hover:text-text-primary',
      )}
    >
      {children}
    </button>
  );
}
