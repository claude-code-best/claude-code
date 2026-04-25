import * as vscode from "vscode";
import { ChatViewProvider } from "./ChatViewProvider";
import { StatusBarManager } from "./StatusBarManager";

let chatProvider: ChatViewProvider | undefined;
let statusBarManager: StatusBarManager | undefined;

export function activate(context: vscode.ExtensionContext): void {
  statusBarManager = new StatusBarManager();
  chatProvider = new ChatViewProvider(context.extensionUri, statusBarManager, context.globalState);

  const viewRegistration = vscode.window.registerWebviewViewProvider("ccb.chat", chatProvider, {
    webviewOptions: { retainContextWhenHidden: true },
  });

  const commands: Array<[string, () => void | Promise<void>]> = [
    ["ccb.newChat", () => chatProvider?.newChat()],
    ["ccb.focus", () => { void vscode.commands.executeCommand("ccb.chat.focus"); }],
    ["ccb.cancel", () => chatProvider?.cancel()],
    ["ccb.cycleMode", () => chatProvider?.cycleMode()],
    ["ccb.sendSelection", () => chatProvider?.sendSelection()],
    ["ccb.sendFileContext", () => chatProvider?.sendFileContext()],
    ["ccb.restartAgent", () => chatProvider?.restartAgent()],
    ["ccb.openHistory", () => chatProvider?.openHistory()],
    ["ccb.clearScreen", () => chatProvider?.clearScreen()],
    ["ccb.searchHistory", () => chatProvider?.searchHistory()],
    ["ccb.toggleThinking", () => chatProvider?.toggleThinking()],
  ];

  const registrations = commands.map(([id, handler]) => vscode.commands.registerCommand(id, handler));

  context.subscriptions.push(viewRegistration, ...registrations, chatProvider, statusBarManager);
}

export function deactivate(): void {
  chatProvider?.dispose();
  statusBarManager?.dispose();
  chatProvider = undefined;
  statusBarManager = undefined;
}
