import type { Environment } from "../types";
import { StatusBadge } from "./Navbar";
import { esc, formatTime } from "../lib/utils";

interface EnvironmentListProps {
  environments: Environment[];
  onSelectEnvironment?: (env: Environment) => void;
}

export function EnvironmentList({ environments, onSelectEnvironment }: EnvironmentListProps) {
  if (!environments || environments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-1 p-8 text-center text-text-muted">
        No active environments
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {environments.map((env) => {
        const isAcp = env.worker_type === "acp";
        const typeLabel = isAcp ? "ACP Agent" : "Claude Code";
        const typeColor = isAcp ? "bg-brand/15 text-brand" : "bg-status-running/15 text-status-running";

        return (
          <button
            key={env.id}
            type="button"
            onClick={() => onSelectEnvironment?.(env)}
            disabled={isAcp}
            className={`flex w-full items-center justify-between rounded-xl border border-border bg-surface-1 px-4 py-3 text-left transition-colors ${isAcp ? "cursor-default opacity-80" : "hover:border-border-light cursor-pointer"}`}
          >
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-text-primary">
                    {env.machine_name || env.id}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColor}`}>
                    {typeLabel}
                  </span>
                </div>
                <div className="text-sm text-text-muted">{env.directory || ""}</div>
              </div>
            </div>
            <div className="text-right">
              <StatusBadge status={env.status} />
              <div className="mt-1 text-xs text-text-muted">
                {env.branch || ""}
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
