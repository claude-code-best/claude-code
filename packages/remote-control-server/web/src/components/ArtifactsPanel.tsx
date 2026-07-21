import { useState } from 'react';
import { Check, Copy, ExternalLink, FileCode2, RefreshCw } from 'lucide-react';
import type { PublishedArtifact } from '../lib/work-center-model';

export function ArtifactsPanel({
  artifacts,
  canRepublish,
  onRepublish,
}: {
  artifacts: PublishedArtifact[];
  canRepublish: boolean;
  onRepublish?: (artifact: PublishedArtifact) => Promise<void>;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(artifacts[0]?.toolUseId ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const selected = artifacts.find(item => item.toolUseId === selectedId) ?? artifacts[0];

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <FileCode2 className="h-7 w-7 text-text-muted/40" />
        <p className="mt-3 text-xs font-medium text-text-primary">还没有发布产物</p>
        <p className="mt-1 text-[10px] leading-5 text-text-muted">Artifact 工具成功发布的 HTML 会自动出现在这里。</p>
      </div>
    );
  }

  const copyUrl = async (artifact: PublishedArtifact) => {
    if (!artifact.url) return;
    await navigator.clipboard.writeText(artifact.url);
    setCopied(artifact.toolUseId);
    setTimeout(() => setCopied(null), 1200);
  };

  const republish = async (artifact: PublishedArtifact) => {
    if (!onRepublish) return;
    setBusy(artifact.toolUseId);
    try {
      await onRepublish(artifact);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-1">
      <div className="flex-shrink-0 border-b border-border px-3 py-3">
        <p className="text-[11px] font-medium text-text-primary">Artifacts</p>
        <p className="mt-0.5 text-[9px] text-text-muted">{artifacts.length} 个已报告产物</p>
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex-shrink-0 overflow-x-auto border-b border-border px-2 py-2">
          <div className="flex gap-2">
            {artifacts.map(artifact => (
              <button
                key={artifact.toolUseId}
                type="button"
                onClick={() => setSelectedId(artifact.toolUseId)}
                className={`w-28 flex-shrink-0 rounded-md border p-1.5 text-left ${artifact.toolUseId === selected.toolUseId ? 'border-brand bg-brand/[0.04]' : 'border-border hover:bg-surface-2'}`}
              >
                {artifact.url ? (
                  <iframe
                    src={artifact.url}
                    title={artifact.basename}
                    tabIndex={-1}
                    className="pointer-events-none aspect-video w-full rounded-sm bg-white"
                    sandbox="allow-scripts"
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center rounded-sm bg-surface-2">
                    <FileCode2 className="h-4 w-4 text-text-muted" />
                  </div>
                )}
                <p className="mt-1 truncate font-mono text-[8px] text-text-secondary">{artifact.basename}</p>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-[10px] text-text-primary">{selected.basename}</p>
            <p className="truncate font-mono text-[8px] text-text-muted">
              {selected.expiresAt
                ? `过期：${selected.expiresAt}`
                : selected.status === 'running'
                  ? '发布中'
                  : '未报告过期时间'}
            </p>
          </div>
          {selected.url && (
            <button
              type="button"
              title="复制链接"
              onClick={() => void copyUrl(selected)}
              className="rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
            >
              {copied === selected.toolUseId ? (
                <Check className="h-3.5 w-3.5 text-status-active" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          {selected.url && (
            <a
              href={selected.url}
              target="_blank"
              rel="noreferrer"
              title="新窗口打开"
              className="rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {canRepublish && onRepublish && (
            <button
              type="button"
              title="请求重新发布"
              disabled={busy === selected.toolUseId}
              onClick={() => void republish(selected)}
              className="rounded p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy === selected.toolUseId ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 bg-surface-2">
          {selected.url ? (
            <iframe
              src={selected.url}
              title={`预览 ${selected.basename}`}
              className="h-full w-full border-0 bg-white"
              sandbox="allow-forms allow-modals allow-popups allow-scripts"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center text-[10px] leading-5 text-text-muted">
              {selected.error || 'Artifact 工具尚未返回可预览链接。'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
