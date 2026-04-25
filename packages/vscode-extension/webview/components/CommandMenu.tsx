import React, { useEffect, useMemo, useRef, useState } from "react";
import type { AvailableCommand } from "../lib/acp/types";
import {
  commandMatchesFilter,
  findCommandByName,
  getArgumentOptions,
  getStringMeta,
} from "../lib/slashCommands";

interface CommandMenuProps {
  commands: AvailableCommand[];
  filter: string;
  visible: boolean;
  commandName?: string;
  onSelect: (command: AvailableCommand) => void;
  onClose: () => void;
}

export function CommandMenu({
  commands,
  filter,
  visible,
  commandName,
  onSelect,
  onClose,
}: CommandMenuProps): React.ReactElement | null {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    if (commandName) {
      const command = findCommandByName(commands, commandName);
      return getArgumentOptions(command?.input?.hint, filter, command).map(
        (option): AvailableCommand => ({
          name: option.value,
          description: option.label,
          input: null,
          _meta: {
            ccbArgumentFor: commandName,
            ccbArgumentValue: option.insertText,
          },
        }),
      );
    }

    return commands.filter((command) => commandMatchesFilter(command, filter));
  }, [commandName, commands, filter]);

  useEffect(() => setActiveIndex(0), [commandName, filter, commands]);

  useEffect(() => {
    if (!visible) return;
    function handleClickOutside(e: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [visible, onClose]);

  useEffect(() => {
    if (!visible || filtered.length === 0) return;
    function handleKey(e: KeyboardEvent): void {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const cmd = filtered[activeIndex];
        if (cmd) onSelect(cmd);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKey, true);
    return () => document.removeEventListener("keydown", handleKey, true);
  }, [visible, filtered, activeIndex, onSelect, onClose]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const active = root.querySelector("[data-active='true']");
    active?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!visible) return null;

  return (
    <div ref={containerRef} className="command-menu">
      {filtered.length === 0 ? (
        <div className="command-menu-empty">No matching command</div>
      ) : (
        filtered.map((cmd, i) => {
          const argumentFor = getStringMeta(cmd, "ccbArgumentFor");
          return (
            <button
              key={argumentFor ? `${argumentFor}:${cmd.name}` : cmd.name}
              type="button"
              data-active={i === activeIndex}
              className={`command-menu-item ${i === activeIndex ? "active" : ""}`}
              onMouseEnter={() => setActiveIndex(i)}
              onClick={() => onSelect(cmd)}
            >
              <span className="cmd-name">{argumentFor ? cmd.name : `/${cmd.name}`}</span>
              <span className="cmd-desc">
                {argumentFor ? `argument for /${argumentFor}` : cmd.description}
              </span>
              {argumentFor ? <span className="cmd-hint">{cmd.description}</span> : null}
              {!argumentFor && cmd.input?.hint && <span className="cmd-hint">{cmd.input.hint}</span>}
            </button>
          );
        })
      )}
    </div>
  );
}
