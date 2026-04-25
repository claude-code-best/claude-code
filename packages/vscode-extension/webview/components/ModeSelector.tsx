import React, { useEffect, useRef, useState } from "react";
import type { SessionModeState } from "../lib/acp/types";
import { FALLBACK_PERMISSION_MODES, PERMISSION_MODE_LABELS } from "../lib/types";

interface ModeSelectorProps {
  /** Mode state advertised by the agent (preferred). Fallback used otherwise. */
  state: SessionModeState | null;
  currentMode: string;
  onSelect: (modeId: string) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

interface ModeOption {
  id: string;
  label: string;
  description: string;
}

export function ModeSelector({ state, currentMode, onSelect, open: controlledOpen, onOpenChange }: ModeSelectorProps): React.ReactElement {
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

  const options = buildOptions(state);
  const current = options.find((o) => o.id === currentMode) ?? options[0];

  return (
    <div className="mode-selector" ref={wrapRef}>
      <button
        type="button"
        className="mode-selector-trigger"
        title={`Mode: ${current.label} (Shift+Tab to cycle)`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={`mode-dot mode-${current.id}`} aria-hidden />
        <span className="mode-label">{current.label}</span>
        <span className="mode-chevron" aria-hidden>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="mode-selector-dropdown">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`mode-option ${opt.id === current.id ? "active" : ""}`}
              onClick={() => {
                onSelect(opt.id);
                setOpen(false);
              }}
            >
              <span className={`mode-dot mode-${opt.id}`} aria-hidden />
              <div className="mode-option-text">
                <span className="mode-option-name">{opt.label}</span>
                <span className="mode-option-desc">{opt.description}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function buildOptions(state: SessionModeState | null): ModeOption[] {
  if (state && state.availableModes.length > 0) {
    return state.availableModes.map((m) => ({
      id: m.id,
      label: m.name,
      description: m.description ?? PERMISSION_MODE_LABELS[m.id]?.description ?? "",
    }));
  }
  return FALLBACK_PERMISSION_MODES.map((id) => ({
    id,
    label: PERMISSION_MODE_LABELS[id]?.label ?? id,
    description: PERMISSION_MODE_LABELS[id]?.description ?? "",
  }));
}
