import { useEffect, useMemo, useState } from 'react';
import { Inbox, Paperclip } from 'lucide-react';
import { apiFetchSessionHistory } from '../api/client';
import type { Session, SessionEvent } from '../types';

interface ChannelItem {
  id: string;
  sessionId: string;
  sessionTitle: string;
  source: string;
  sender: string;
  chatId?: string;
  content: string;
  attachments: number;
  createdAt: number;
  pairing?: string;
}

export function ChannelsInboxPage({
  sessions,
  onOpenSession,
}: {
  sessions: Session[];
  onOpenSession: (id: string) => void;
}) {
  const [items, setItems] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void Promise.all(
      sessions.slice(0, 30).map(async session => {
        try {
          const page = await apiFetchSessionHistory(session.id, { after: 0, limit: 500, signal: controller.signal });
          return page.events.flatMap(event => parseChannelEvent(event, session));
        } catch {
          return [];
        }
      }),
    ).then(groups => {
      if (!controller.signal.aborted) {
        setItems(groups.flat().sort((a, b) => b.createdAt - a.createdAt));
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, [sessions]);

  const sources = useMemo(() => [...new Set(items.map(item => item.source))], [items]);
  const visible = filter === 'all' ? items : items.filter(item => item.source === filter);
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <h1 className="text-2xl font-medium text-text-primary">Channels 收件箱</h1>
        <p className="mt-1 text-sm text-text-muted">聚合已投递到 Claude Code 会话的外部频道消息。</p>
        <div className="mt-5 flex flex-wrap gap-1.5">
          <Filter active={filter === 'all'} onClick={() => setFilter('all')}>
            全部
          </Filter>
          {sources.map(source => (
            <Filter key={source} active={filter === source} onClick={() => setFilter(source)}>
              {source}
            </Filter>
          ))}
        </div>
        <div className="mt-5 border-t border-border">
          {loading ? (
            <p className="py-6 text-[11px] text-text-muted">正在读取会话历史…</p>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <Inbox className="h-7 w-7 text-text-muted/40" />
              <p className="mt-3 text-xs text-text-muted">没有已投递的 Channel 消息</p>
            </div>
          ) : (
            visible.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpenSession(item.sessionId)}
                className="block w-full border-b border-border/70 py-4 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="rounded border border-border px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-text-secondary">
                    {item.source}
                  </span>
                  <span className="text-[10px] font-medium text-text-primary">{item.sender}</span>
                  {item.chatId && <span className="truncate font-mono text-[8px] text-text-muted">{item.chatId}</span>}
                  <span className="ml-auto text-[9px] text-text-muted">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-text-secondary">{item.content}</p>
                <div className="mt-2 flex items-center gap-3 text-[9px] text-text-muted">
                  <span>{item.sessionTitle}</span>
                  {item.pairing && <span>{item.pairing}</span>}
                  {item.attachments > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <Paperclip className="h-3 w-3" />
                      {item.attachments}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function parseChannelEvent(event: SessionEvent, session: Session): ChannelItem[] {
  if (event.type !== 'user') return [];
  const payload = event.payload ?? {};
  const raw = payload.raw && typeof payload.raw === 'object' ? payload.raw : {};
  const content =
    typeof payload.content === 'string' ? payload.content : typeof raw.content === 'string' ? raw.content : '';
  const match = /<channel\s+([^>]+)>([\s\S]*?)<\/channel>/i.exec(content);
  if (!match) return [];
  const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(item => [item[1], item[2]]));
  const fileAttachments = Array.isArray((raw as Record<string, unknown>).file_attachments)
    ? ((raw as Record<string, unknown>).file_attachments as unknown[])
    : [];
  return [
    {
      id: event.id,
      sessionId: session.id,
      sessionTitle: session.title || session.id,
      source: attrs.source || 'channel',
      sender: attrs.user || attrs.sender || 'unknown',
      chatId: attrs.chat_id,
      content: match[2].trim(),
      attachments: (payload.images?.length ?? 0) + fileAttachments.length,
      createdAt: event.createdAt,
      pairing: attrs.pairing || attrs.pairing_status,
    },
  ];
}

function Filter({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-[10px] ${active ? 'bg-text-primary text-surface-1' : 'border border-border text-text-secondary hover:bg-surface-2'}`}
    >
      {children}
    </button>
  );
}
