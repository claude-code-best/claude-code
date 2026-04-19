import type { PendingPermission } from "../../src/lib/types";
import { cn } from "../../src/lib/utils";
import { ShieldAlert, Check, X } from "lucide-react";

// =============================================================================
// 权限请求面板 — 固定在输入框上方（Anthropic warm token style）
// =============================================================================

interface PermissionPanelProps {
  requests: PendingPermission[];
  onRespond?: (requestId: string, approved: boolean) => void;
  className?: string;
}

export function PermissionPanel({ requests, onRespond, className }: PermissionPanelProps) {
  if (requests.length === 0) return null;

  return (
    <div className={cn("w-full max-w-3xl mx-auto px-4", className)}>
      <div className="space-y-2">
        {requests.map((req) => (
          <PermissionCard
            key={req.requestId}
            request={req}
            onRespond={onRespond}
          />
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// 单个权限卡片 — warm warning tokens + left-border accent
// =============================================================================

interface PermissionCardProps {
  request: PendingPermission;
  onRespond?: (requestId: string, approved: boolean) => void;
}

function PermissionCard({ request, onRespond }: PermissionCardProps) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-warning-border/30 bg-warning-bg/50 px-4 py-3">
      <ShieldAlert className="h-5 w-5 text-warning-text flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-warning-text">
          {request.toolName}
        </div>
        {request.description && (
          <div className="text-xs text-warning-text/80 mt-0.5 truncate">
            {request.description}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onRespond?.(request.requestId, true)}
          className="h-8 px-3 rounded-lg bg-brand text-white text-xs font-medium hover:bg-brand-light transition-colors flex items-center gap-1.5"
        >
          <Check className="h-3.5 w-3.5" />
          允许
        </button>
        <button
          type="button"
          onClick={() => onRespond?.(request.requestId, false)}
          className="h-8 px-3 rounded-lg border border-warning-border/30 text-warning-text text-xs font-medium hover:bg-warning-bg transition-colors flex items-center gap-1.5"
        >
          <X className="h-3.5 w-3.5" />
          拒绝
        </button>
      </div>
    </div>
  );
}
