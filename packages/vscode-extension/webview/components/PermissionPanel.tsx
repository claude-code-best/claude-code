import React from "react";
import type { PendingPermission } from "../lib/types";
import type { PermissionOption } from "../lib/acp/types";

interface PermissionPanelProps {
  requests: PendingPermission[];
  onRespond: (requestId: string, optionId: string | null, approved: boolean) => void;
}

/**
 * Permission requests are flattened into the chat as tool-call entries with a
 * `permissionRequest` payload. This panel mirrors them above the input so the
 * user can act without scrolling.
 */
export function PermissionPanel({ requests, onRespond }: PermissionPanelProps): React.ReactElement | null {
  if (requests.length === 0) return null;
  return (
    <div className="permission-panel">
      {requests.map((req) => (
        <PermissionCard key={req.requestId} request={req} onRespond={onRespond} />
      ))}
    </div>
  );
}

function PermissionCard({
  request,
  onRespond,
}: {
  request: PendingPermission;
  onRespond: (requestId: string, optionId: string | null, approved: boolean) => void;
}): React.ReactElement {
  const allow = pickOption(request.options, ["allow_once", "allow_always"]);
  const reject = pickOption(request.options, ["reject_once", "reject_always"]);

  const handle = (option: PermissionOption | undefined, approved: boolean) => {
    onRespond(request.requestId, option?.optionId ?? null, approved);
  };

  return (
    <div className="permission-card">
      <div className="permission-card-header">
        <span className="permission-icon" aria-hidden>!</span>
        <span className="permission-title">{request.toolName}</span>
      </div>
      {request.description && <div className="permission-body">{request.description}</div>}

      <div className="permission-options">
        {request.options.map((opt) => (
          <button
            key={opt.optionId}
            type="button"
            className={`permission-option permission-${categoryFor(opt.kind)}`}
            onClick={() => onRespond(request.requestId, opt.optionId, isApprove(opt.kind))}
            title={opt.kind}
          >
            {opt.name}
          </button>
        ))}
      </div>
      {/* Quick fallback when the agent only supplies cryptic option names */}
      {request.options.length === 0 && (
        <div className="permission-options">
          <button type="button" className="permission-option permission-approve" onClick={() => handle(allow, true)}>
            Allow
          </button>
          <button type="button" className="permission-option permission-reject" onClick={() => handle(reject, false)}>
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

function pickOption(
  options: PermissionOption[],
  preferences: PermissionOption["kind"][],
): PermissionOption | undefined {
  for (const k of preferences) {
    const match = options.find((o) => o.kind === k);
    if (match) return match;
  }
  return undefined;
}

function isApprove(kind: PermissionOption["kind"]): boolean {
  return kind === "allow_once" || kind === "allow_always";
}

function categoryFor(kind: PermissionOption["kind"]): "approve" | "reject" {
  return isApprove(kind) ? "approve" : "reject";
}
