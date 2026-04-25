import * as vscode from "vscode";

export type StatusBarState =
  | "idle"
  | "connecting"
  | "thinking"
  | "streaming"
  | "disconnected"
  | "waiting_permission";

export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;
  private currentState: StatusBarState = "disconnected";
  private inputTokens = 0;
  private outputTokens = 0;
  private cacheTokens = 0;
  private cost = 0;
  private model = "";
  private mode = "";
  private disposed = false;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100
    );
    this.item.command = "ccb.focus";
    this.update("disconnected");
    this.item.show();
  }

  update(state: StatusBarState): void {
    this.currentState = state;
    this.render();
  }

  updateModel(model: string): void {
    this.model = model;
    this.render();
  }

  updateMode(mode: string): void {
    this.mode = mode;
    this.render();
  }

  updateTokens(
    input: number,
    output: number,
    cache: number,
    totalCost: number
  ): void {
    this.inputTokens = input;
    this.outputTokens = output;
    this.cacheTokens = cache;
    this.cost = totalCost;
    this.render();
  }

  resetTokens(): void {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.cacheTokens = 0;
    this.cost = 0;
    this.render();
  }

  private render(): void {
    const { icon, label } = this.getIconAndLabel();
    const modePart = this.mode ? ` ⋄ ${formatMode(this.mode)}` : "";
    this.item.text = `${icon} ${label}${modePart}`;
    this.item.tooltip = this.buildTooltip();
  }

  private getIconAndLabel(): { icon: string; label: string } {
    switch (this.currentState) {
      case "idle":
        return { icon: "$(circle-outline)", label: "CCB" };
      case "connecting":
        return { icon: "$(loading~spin)", label: "CCB: Connecting" };
      case "thinking":
        return { icon: "$(loading~spin)", label: "CCB: Thinking" };
      case "streaming":
        return { icon: "$(pulse)", label: "CCB: Streaming" };
      case "disconnected":
        return { icon: "$(circle-slash)", label: "CCB: Offline" };
      case "waiting_permission":
        return { icon: "$(shield)", label: "CCB: Permission" };
    }
  }

  private buildTooltip(): string {
    const lines = [`CCB (Claude Code Best) - ${this.currentState}`];
    if (this.model) lines.push(`Model: ${this.model}`);
    if (this.mode) lines.push(`Mode: ${formatMode(this.mode)}`);
    if (this.inputTokens > 0 || this.outputTokens > 0) {
      lines.push(
        `Input: ${formatTokens(this.inputTokens)} | Output: ${formatTokens(this.outputTokens)}`
      );
      if (this.cacheTokens > 0) {
        lines.push(`Cache: ${formatTokens(this.cacheTokens)}`);
      }
      if (this.cost > 0) {
        lines.push(`Cost: $${this.cost.toFixed(4)}`);
      }
    }
    return lines.join("\n");
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.item.dispose();
  }
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(1)}M`;
  }
  if (n >= 1_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return String(n);
}

const MODE_LABELS: Record<string, string> = {
  default: "default",
  acceptEdits: "auto-edit",
  bypassPermissions: "bypass",
  plan: "plan",
  dontAsk: "dont-ask",
  auto: "auto",
};

function formatMode(mode: string): string {
  return MODE_LABELS[mode] ?? mode;
}
