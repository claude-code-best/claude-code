import { useEffect, useState } from 'react';
import { FileText, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../components/ui/dialog';
import { MessageResponse } from '../../components/ai-elements/message';
import type { MarkdownDoc } from '../lib/work-center-model';
import { cn } from '../lib/utils';

// =============================================================================
// Markdown 文档面板 — 工作中心"文档" tab。
// 内容从 Write/Edit 工具事件推导（deriveMarkdownDocs），离线与历史回放同样可用。
// =============================================================================

export function DocsPanel({ docs }: { docs: MarkdownDoc[] }) {
  const [selectedPath, setSelectedPath] = useState<string | null>(docs[0]?.path ?? null);
  const [zoomed, setZoomed] = useState(false);

  useEffect(() => {
    if (docs.length === 0) {
      setSelectedPath(null);
      return;
    }
    if (!selectedPath || !docs.some(doc => doc.path === selectedPath)) {
      setSelectedPath(docs[0]?.path ?? null);
    }
  }, [docs, selectedPath]);

  const selected = docs.find(doc => doc.path === selectedPath) ?? docs[0];

  if (!selected) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <FileText className="h-7 w-7 text-text-muted/50" />
        <p className="mt-3 font-display text-xs font-medium text-text-primary">本回合还没有生成 Markdown 文档</p>
        <p className="mt-1 font-display text-[10px] leading-relaxed text-text-muted">
          Agent 通过 Write 写出的 .md 文件会自动出现在这里。
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 flex-shrink-0 items-center gap-2 border-b border-border px-3">
        <FileText className="h-3.5 w-3.5 text-text-muted" />
        <span className="font-display text-[10px] font-medium text-text-secondary">会话生成的 Markdown 文档</span>
        <span className="ml-auto font-display text-[9px] text-text-muted">{docs.length} 个文件</span>
        <button
          type="button"
          title="放大查看"
          onClick={() => setZoomed(true)}
          className="flex h-6 w-6 items-center justify-center rounded text-text-muted hover:bg-surface-2 hover:text-text-primary"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="w-[148px] flex-shrink-0 overflow-y-auto border-r border-border bg-surface-0/40 py-1.5">
          {docs.map(doc => (
            <button
              key={doc.path}
              type="button"
              onClick={() => setSelectedPath(doc.path)}
              className={cn(
                'flex w-full items-start gap-1.5 border-l-2 px-2 py-2 text-left transition-colors',
                doc.path === selected.path ? 'border-brand bg-brand/[0.07]' : 'border-transparent hover:bg-surface-2',
              )}
              title={doc.path}
            >
              <FileText className="mt-0.5 h-3 w-3 flex-shrink-0 text-text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[9px] text-text-primary">{doc.basename}</p>
                {doc.stale && <p className="mt-0.5 text-[8px] text-amber-600 dark:text-amber-400">内容可能过时</p>}
              </div>
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1 overflow-y-auto bg-surface-1">
          <DocHeader doc={selected} />
          <DocBody doc={selected} className="px-3 pb-6 pt-2" />
        </div>
      </div>

      <Dialog open={zoomed} onOpenChange={setZoomed}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-2 sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="break-all font-mono text-xs font-medium">{selected.path}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <DocBody doc={selected} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DocHeader({ doc }: { doc: MarkdownDoc }) {
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-surface-1/95 px-3 py-2 backdrop-blur">
      <p className="truncate font-mono text-[10px] text-text-primary" title={doc.path}>
        {doc.path}
      </p>
      {doc.stale && (
        <p className="mt-0.5 text-[8px] text-amber-600 dark:text-amber-400">
          该文件在写入后又被 Edit 修改过，以下内容可能不是磁盘上的最新版本。
        </p>
      )}
    </div>
  );
}

function DocBody({ doc, className }: { doc: MarkdownDoc; className?: string }) {
  if (!doc.content) {
    return (
      <p className={cn('text-[10px] leading-relaxed text-text-muted', className)}>
        该文件只有 Edit 片段记录，事件流中没有完整内容。可以在聊天中让 Claude 读取该文件查看全文。
      </p>
    );
  }
  return (
    <div className={cn('text-sm', className)}>
      <MessageResponse>{doc.content}</MessageResponse>
    </div>
  );
}
