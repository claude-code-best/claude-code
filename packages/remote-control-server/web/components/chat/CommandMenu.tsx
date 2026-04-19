import { useMemo, useRef, useEffect, useState } from "react";
import { cn } from "../../src/lib/utils";
import type { AvailableCommand } from "../../src/acp/types";

// =============================================================================
// Slash command picker — floating above ChatInput
// =============================================================================

interface CommandMenuProps {
  commands: AvailableCommand[];
  /** Text after "/" used for filtering */
  filter: string;
  onSelect: (command: AvailableCommand) => void;
  onClose: () => void;
  className?: string;
}

/**
 * Prefix match — checks if the text starts with the query.
 */
function prefixMatch(query: string, text: string): boolean {
  if (!query) return true;
  return text.toLowerCase().startsWith(query.toLowerCase());
}

export function CommandMenu({
  commands,
  filter,
  onSelect,
  onClose,
  className,
}: CommandMenuProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Filter commands by current input
  const filtered = useMemo(() => {
    if (!filter) return commands;
    return commands.filter(
      (cmd) => prefixMatch(filter, cmd.name),
    );
  }, [commands, filter]);

  // Reset active index when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [filter]);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  // Handle keyboard navigation (ArrowUp/ArrowDown/Enter) via document-level listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (filtered.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((prev) => (prev + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((prev) => (prev - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const cmd = filtered[activeIndex];
        if (cmd) onSelect(cmd);
      }
    };

    document.addEventListener("keydown", handleKeyDown, true); // capture phase
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [filtered, activeIndex, onSelect]);

  // Scroll active item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const active = container.querySelector("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "rounded-xl border border-border bg-surface-2 shadow-lg",
        className,
      )}
    >
      <div className="max-h-[320px] overflow-y-auto py-1">
        {filtered.length === 0 ? (
          <div className="text-xs text-text-muted font-display py-3 text-center">
            没有匹配的命令
          </div>
        ) : (
          filtered.map((cmd, index) => (
            <button
              key={cmd.name}
              type="button"
              data-active={index === activeIndex}
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => setActiveIndex(index)}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 cursor-pointer rounded-lg mx-1 text-left",
                "transition-colors",
                index === activeIndex
                  ? "bg-brand/10 text-text-primary"
                  : "text-text-secondary hover:bg-surface-1/50",
              )}
              style={{ width: "calc(100% - 8px)" }}
            >
              <span className="text-sm font-display font-medium text-brand">
                /{cmd.name}
              </span>
              <span className="text-xs text-text-muted truncate flex-1">
                {cmd.description}
              </span>
              {cmd.input?.hint && (
                <span className="text-[10px] text-text-muted italic">
                  {cmd.input.hint}
                </span>
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
