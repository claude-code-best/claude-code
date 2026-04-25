import React, { useEffect, useRef, useState } from "react";
import type { SessionModelState } from "../lib/acp/types";

interface ModelPickerProps {
  state: SessionModelState | null;
  onSelect: (modelId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ModelPicker({ state, onSelect, open: controlledOpen, onOpenChange }: ModelPickerProps): React.ReactElement | null {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean | ((prev: boolean) => boolean)): void => {
    const value = typeof next === "function" ? next(open) : next;
    if (onOpenChange) onOpenChange(value);
    else setUncontrolledOpen(value);
  };

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  if (!state || state.availableModels.length === 0) return null;

  const current = state.availableModels.find((m) => m.modelId === state.currentModelId);
  const label = current?.name ?? state.currentModelId;

  return (
    <div className="model-picker" ref={wrapRef}>
      <button
        type="button"
        className="model-picker-trigger"
        onClick={() => setOpen((v) => !v)}
        title={label}
      >
        <span className="model-picker-label">{label}</span>
        <span className="model-picker-chevron" aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="model-picker-dropdown">
          {state.availableModels.map((m) => (
            <button
              key={m.modelId}
              type="button"
              className={`model-option ${m.modelId === state.currentModelId ? "active" : ""}`}
              onClick={() => {
                onSelect(m.modelId);
                setOpen(false);
              }}
            >
              <span className="model-option-name">{m.name}</span>
              {m.description && <span className="model-option-desc">{m.description}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
