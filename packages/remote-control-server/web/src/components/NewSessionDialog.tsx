import { useState, useEffect } from "react";
import type { Environment, Session } from "../types";
import { apiCreateSession } from "../api/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../components/ui/dialog";

interface NewSessionDialogProps {
  open: boolean;
  environments: Environment[];
  onClose: () => void;
  onCreated: (session: Session) => void;
}

export function NewSessionDialog({ open, environments, onClose, onCreated }: NewSessionDialogProps) {
  const [title, setTitle] = useState("");
  const [envId, setEnvId] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle("");
      setEnvId("");
      setError("");
    }
  }, [open]);

  const handleCreate = async () => {
    setCreating(true);
    setError("");
    try {
      const body: Record<string, string> = {};
      if (title.trim()) body.title = title.trim();
      if (envId) body.environment_id = envId;
      const session = await apiCreateSession(body);
      onCreated(session);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-1 p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold text-text-primary">New Session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm text-text-secondary">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="My session"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm text-text-secondary">Environment</label>
            <select
              value={envId}
              onChange={(e) => setEnvId(e.target.value)}
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary focus:border-brand focus:outline-none"
            >
              <option value="">-- None --</option>
              {environments.map((env) => (
                <option key={env.id} value={env.id}>
                  {env.machine_name || env.id} ({env.branch || "no branch"})
                </option>
              ))}
            </select>
          </div>

          {error && <div className="text-sm text-status-error">{error}</div>}
        </div>

        <DialogFooter>
          <button
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm text-text-secondary hover:bg-surface-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-light disabled:opacity-50 transition-colors"
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
