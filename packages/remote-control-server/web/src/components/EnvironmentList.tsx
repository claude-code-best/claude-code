import type { Environment } from "../types";
import { StatusBadge } from "./Navbar";
import { esc, formatTime } from "../lib/utils";

interface EnvironmentListProps {
  environments: Environment[];
}

export function EnvironmentList({ environments }: EnvironmentListProps) {
  if (!environments || environments.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface-1 p-8 text-center text-text-muted">
        No active environments
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {environments.map((env) => (
        <div
          key={env.id}
          className="flex items-center justify-between rounded-xl border border-border bg-surface-1 px-4 py-3 transition-colors hover:border-border-light"
        >
          <div>
            <div className="font-medium text-text-primary">
              {env.machine_name || env.id}
            </div>
            <div className="text-sm text-text-muted">{env.directory || ""}</div>
          </div>
          <div className="text-right">
            <StatusBadge status={env.status} />
            <div className="mt-1 text-xs text-text-muted">
              {env.branch || ""}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
