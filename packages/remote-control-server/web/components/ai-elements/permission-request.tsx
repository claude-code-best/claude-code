"use client";

import { cn } from "../../src/lib/utils";
import { Button } from "../ui/button";
import { ShieldAlertIcon, CheckIcon, XIcon } from "lucide-react";
import type { PermissionOption } from "../../src/acp/types";

// Get button variant based on option kind
function getButtonVariant(kind: PermissionOption["kind"]): "default" | "destructive" | "outline" | "secondary" {
  switch (kind) {
    case "allow_once":
    case "allow_always":
      return "default";
    case "reject_once":
    case "reject_always":
      return "destructive";
    default:
      return "outline";
  }
}

// Get button icon based on option kind
function getButtonIcon(kind: PermissionOption["kind"]) {
  switch (kind) {
    case "allow_once":
    case "allow_always":
      return <CheckIcon className="size-4" />;
    case "reject_once":
    case "reject_always":
      return <XIcon className="size-4" />;
    default:
      return null;
  }
}

// Permission buttons component - used inside Tool component
export interface ToolPermissionButtonsProps {
  requestId: string;
  options: PermissionOption[];
  onRespond: (requestId: string, optionId: string | null, optionKind: PermissionOption["kind"] | null) => void;
  className?: string;
}

export function ToolPermissionButtons({ requestId, options, onRespond, className }: ToolPermissionButtonsProps) {
  const handleOptionClick = (option: PermissionOption) => {
    onRespond(requestId, option.optionId, option.kind);
  };

  return (
    <div className={cn("p-3 border-t border-yellow-500/30 bg-yellow-50/50 dark:bg-yellow-950/10", className)}>
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlertIcon className="size-4 text-yellow-600 dark:text-yellow-500" />
        <span className="text-xs font-medium text-yellow-800 dark:text-yellow-200">
          Permission Required
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <Button
            key={option.optionId}
            variant={getButtonVariant(option.kind)}
            size="sm"
            onClick={() => handleOptionClick(option)}
            className="gap-1.5"
          >
            {getButtonIcon(option.kind)}
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  );
}

