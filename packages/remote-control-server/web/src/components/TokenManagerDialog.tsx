import { useState } from "react";
import type { TokenEntry } from "../hooks/useTokens";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../components/ui/dialog";
import { Check, Copy, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";

interface TokenManagerDialogProps {
  open: boolean;
  onClose: () => void;
  tokens: TokenEntry[];
  activeTokenId: string | null;
  onSetActive: (id: string) => void;
  onAdd: (token: string, label: string) => string | null;
  onRemove: (id: string) => void;
  onUpdate: (id: string, label: string) => void;
}

export function TokenManagerDialog({
  open,
  onClose,
  tokens,
  activeTokenId,
  onSetActive,
  onAdd,
  onRemove,
  onUpdate,
}: TokenManagerDialogProps) {
  const [newToken, setNewToken] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [visibleTokenId, setVisibleTokenId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (id: string, token: string) => {
    navigator.clipboard.writeText(token).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  };

  const handleAdd = () => {
    const error = onAdd(newToken, newLabel);
    if (error) {
      setAddError(error);
      return;
    }
    setNewToken("");
    setNewLabel("");
    setAddError("");
  };

  const handleStartEdit = (entry: TokenEntry) => {
    setEditingId(entry.id);
    setEditLabel(entry.label);
  };

  const handleSaveEdit = (id: string) => {
    onUpdate(id, editLabel.trim() || "Unnamed");
    setEditingId(null);
  };

  const handleSwitch = (id: string) => {
    onSetActive(id);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md rounded-2xl border-border bg-surface-1 p-6 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-lg font-semibold text-text-primary">
            Token Manager
          </DialogTitle>
          <DialogDescription className="text-sm text-text-muted">
            Manage API tokens for RCS authentication.
          </DialogDescription>
        </DialogHeader>

        {/* Token list */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {tokens.map((entry) => (
            <div key={entry.id} className="group flex items-center gap-1">
              {editingId === entry.id ? (
                <div className="flex flex-1 items-center gap-2 rounded-lg bg-surface-2 px-3 py-1.5">
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveEdit(entry.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    className="flex-1 rounded border border-border bg-surface-1 px-2 py-1 text-sm text-text-primary focus:border-brand focus:outline-none"
                    autoFocus
                  />
                  <button
                    onClick={() => handleSaveEdit(entry.id)}
                    className="text-brand hover:text-brand-light transition-colors"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="text-text-muted hover:text-text-primary transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <>
                  <button
                    onClick={() => handleSwitch(entry.id)}
                    className={`flex flex-1 items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      activeTokenId === entry.id
                        ? "bg-brand/10 text-brand"
                        : "text-text-secondary hover:bg-surface-2"
                    }`}
                  >
                    <div className="flex flex-col items-start min-w-0">
                      <span className="font-medium truncate w-full">{entry.label}</span>
                      <span className="text-xs text-text-muted font-mono">
                        {visibleTokenId === entry.id
                          ? entry.token
                          : `${entry.token.slice(0, 6)}${"\u2022".repeat(6)}`}
                      </span>
                    </div>
                    {activeTokenId === entry.id && <Check className="h-4 w-4 flex-shrink-0" />}
                  </button>
                  <button
                    onClick={() => setVisibleTokenId(visibleTokenId === entry.id ? null : entry.id)}
                    className="rounded p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary transition-all"
                    title="Toggle token visibility"
                  >
                    {visibleTokenId === entry.id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleCopy(entry.id, entry.token)}
                    className="rounded p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary transition-all"
                    title="Copy token"
                  >
                    {copiedId === entry.id ? <Check className="h-3.5 w-3.5 text-status-active" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  <button
                    onClick={() => handleStartEdit(entry)}
                    className="rounded p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:text-text-primary transition-all"
                    title="Edit label"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => onRemove(entry.id)}
                    className="rounded p-1 text-text-muted opacity-0 group-hover:opacity-100 hover:text-status-error transition-all"
                    title="Delete token"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}

          {tokens.length === 0 && (
            <div className="py-4 text-center text-sm text-text-muted">
              No tokens saved yet. Add one below.
            </div>
          )}
        </div>

        {/* Add form */}
        <div className="border-t border-border pt-4 space-y-3">
          <div className="text-sm font-medium text-text-secondary">Add Token</div>
          <div className="space-y-2">
            <input
              type="text"
              value={newToken}
              onChange={(e) => {
                setNewToken(e.target.value);
                setAddError("");
              }}
              placeholder="API Token"
              className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAdd();
              }}
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Label (optional)"
                className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAdd();
                }}
              />
              <button
                onClick={handleAdd}
                disabled={!newToken.trim()}
                className="rounded-lg bg-brand px-3 py-2 text-white hover:bg-brand-light disabled:opacity-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>
          {addError && <div className="text-xs text-status-error">{addError}</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
