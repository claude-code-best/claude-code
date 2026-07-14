import { useEffect, useMemo, useState } from 'react';
import { Plus, Circle, TerminalSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import type { SessionTerminalsApi } from './useSessionTerminals';
import { TerminalView } from './TerminalView';
import '@xterm/xterm/css/xterm.css';

// =============================================================================
// 终端侧边栏 — Apple Terminal.app 风格：三点标题栏 + tab 条 + xterm + 状态栏
// 多终端切换；模型正在写入的 tab 显示橙点。
// =============================================================================

interface TerminalPanelProps {
  api: SessionTerminalsApi;
}

export function TerminalPanel({ api }: TerminalPanelProps) {
  const { terminals, connected } = api;
  const [activeId, setActiveId] = useState<string | null>(null);

  // 自动选中第一个 / 保持选中有效
  useEffect(() => {
    if (terminals.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !terminals.some(t => t.id === activeId)) {
      setActiveId(terminals[0].id);
    }
  }, [terminals, activeId]);

  const active = useMemo(() => terminals.find(t => t.id === activeId) ?? null, [terminals, activeId]);

  return (
    <div className={cn('flex h-full flex-col overflow-hidden bg-[#171615] dark:bg-[#171615]')}>
      {/* 标题栏 — 工作中心已经提供顶层切换，这里只保留终端现场信息。 */}
      <div className="flex h-10 flex-shrink-0 items-center gap-2 border-b border-black/30 bg-[#2b2927] px-3">
        <div className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
          <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
          <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 truncate font-mono text-[11px] text-white/60">
          <TerminalSquare className="h-3 w-3 flex-shrink-0 text-brand/80" />
          <span className="truncate">
            {active ? `${active.name}${active.purpose ? ` — ${active.purpose}` : ''}` : '终端'}
          </span>
        </div>
        <span className={cn('font-mono text-[9px]', connected ? 'text-[#61c28a]' : 'text-[#e4b15d]')}>
          {connected ? 'SSE' : 'SYNC'}
        </span>
      </div>

      {/* Tab 条 */}
      <div className="flex flex-shrink-0 items-center gap-0.5 overflow-x-auto border-b border-black/30 bg-[#211f1d] px-1.5 py-1.5">
        {terminals.map(t => {
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveId(t.id)}
              className={cn(
                'group flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-[11px] transition-colors',
                t.id === activeId
                  ? 'bg-[#3b3733] text-white shadow-sm'
                  : 'text-white/50 hover:bg-[#302d2a] hover:text-white/80',
              )}
              title={t.purpose || t.name}
            >
              {!t.alive ? <Circle className="h-2 w-2 flex-shrink-0 fill-white/20 text-white/20" /> : null}
              <span className="max-w-28 truncate">{t.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => api.openTerminal()}
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md text-white/40 hover:bg-[#333] hover:text-white/80"
          title="新建终端"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 终端区 — 每个终端一个持久 xterm 实例，非激活隐藏不销毁 */}
      <div className="relative min-h-0 flex-1">
        {terminals.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <TerminalGlyph />
            <p className="font-mono text-[12px] leading-relaxed text-white/50">模型或你都可以在这里开一个终端</p>
            <button
              type="button"
              onClick={() => api.openTerminal()}
              className="rounded-lg bg-brand px-3 py-1.5 font-display text-[12px] font-medium text-white hover:bg-brand-light"
            >
              新建终端
            </button>
          </div>
        ) : (
          terminals.map(t => (
            <div key={t.id} className="absolute inset-0">
              <TerminalView termId={t.id} api={api} active={t.id === activeId} />
            </div>
          ))
        )}
      </div>

      {/* 状态栏 */}
      <div className="flex h-6 flex-shrink-0 items-center justify-between border-t border-black/30 bg-[#252525] px-3 font-mono text-[10px] text-white/40">
        <span className="truncate">{active ? active.cwd : ''}</span>
        <span className="flex items-center gap-2">
          {active && (
            <span>
              {active.cols}×{active.rows}
            </span>
          )}
          <span className={cn('flex items-center gap-1', connected ? 'text-[#61c28a]' : 'text-[#e4b15d]')}>
            <Circle className="h-1.5 w-1.5 fill-current" />
            {connected ? '事件流在线' : '事件流同步中…'}
          </span>
        </span>
      </div>
    </div>
  );
}

function TerminalGlyph() {
  return (
    <svg width="40" height="34" viewBox="0 0 40 34" aria-hidden="true" className="opacity-40">
      <rect
        x="1"
        y="1"
        width="38"
        height="32"
        rx="3"
        fill="none"
        stroke="#ffffff"
        strokeOpacity="0.3"
        strokeWidth="1.5"
      />
      <path
        d="M7 11l6 5-6 5"
        fill="none"
        stroke="#d77757"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <line
        x1="17"
        y1="22"
        x2="27"
        y2="22"
        stroke="#ffffff"
        strokeOpacity="0.4"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
