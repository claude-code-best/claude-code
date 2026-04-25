import * as path from "node:path";
import * as vscode from "vscode";

export interface DiagnosticItem {
  uri: string;
  range: { startLine: number; endLine: number };
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  source?: string;
}

export interface FileSearchEntry {
  path: string; // absolute fs path
  relPath: string; // path relative to workspace root
}

/**
 * VSCode integration surface used by both the chat view (selection / diff /
 * file context) and the ACP `Client` callbacks (readTextFile / writeTextFile).
 *
 * All filesystem mutations go through `vscode.workspace.fs` so that they
 * participate in the editor's undo stack and trigger language server refreshes.
 */
export class EditorBridge {
  // ---------------------------------------------------------------------------
  // Editor selection / file context (used by send_selection / send_file)
  // ---------------------------------------------------------------------------

  getSelectedText(): string {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return "";
    return editor.document.getText(editor.selection);
  }

  getActiveFileContext(): { filePath: string; language: string; content: string } | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return null;
    return {
      filePath: editor.document.uri.fsPath,
      language: editor.document.languageId,
      content: editor.document.getText(),
    };
  }

  getSelectedTextWithContext(): {
    filePath: string;
    language: string;
    selectedText: string;
    startLine: number;
    endLine: number;
  } | null {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.selection.isEmpty) return null;
    return {
      filePath: editor.document.uri.fsPath,
      language: editor.document.languageId,
      selectedText: editor.document.getText(editor.selection),
      startLine: editor.selection.start.line + 1,
      endLine: editor.selection.end.line + 1,
    };
  }

  // ---------------------------------------------------------------------------
  // Diff view (apply_diff)
  // ---------------------------------------------------------------------------

  async showDiff(filePath: string, oldText: string | null | undefined, newText: string): Promise<void> {
    const fileUri = vscode.Uri.file(filePath);
    const original = oldText ?? "";
    // Use untitled scheme for the proposed side so it's editable / closable.
    const proposed = vscode.Uri.parse(
      `untitled:${path.basename(filePath)}.proposed`,
    );

    // Seed both sides through workspaceEdit so the diff shows real content.
    await vscode.workspace.openTextDocument({ content: original, language: this.guessLanguage(filePath) });
    const proposedDoc = await vscode.workspace.openTextDocument(proposed);
    const edit = new vscode.WorkspaceEdit();
    edit.insert(proposed, new vscode.Position(0, 0), newText);
    await vscode.workspace.applyEdit(edit);

    await vscode.commands.executeCommand(
      "vscode.diff",
      fileUri,
      proposedDoc.uri,
      `${path.basename(filePath)}: agent edit preview`,
    );
  }

  /**
   * Apply a unified diff blob (legacy `apply_diff` from earlier protocol).
   * For ACP, prefer writeTextFile or showDiff with explicit oldText/newText.
   */
  async applyDiffPreview(filePath: string, oldText: string | null | undefined, newText: string): Promise<void> {
    return this.showDiff(filePath, oldText, newText);
  }

  // ---------------------------------------------------------------------------
  // Open file at line
  // ---------------------------------------------------------------------------

  async openFile(filePath: string, line?: number): Promise<void> {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(doc, { preview: true });
    if (line !== undefined && line > 0) {
      const pos = new vscode.Position(line - 1, 0);
      editor.selection = new vscode.Selection(pos, pos);
      editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
    }
  }

  // ---------------------------------------------------------------------------
  // Insert / clipboard
  // ---------------------------------------------------------------------------

  async insertAtCursor(text: string): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;
    return editor.edit((b) => b.insert(editor.selection.active, text));
  }

  async copyToClipboard(text: string): Promise<void> {
    await vscode.env.clipboard.writeText(text);
  }

  // ---------------------------------------------------------------------------
  // ACP filesystem capabilities
  // ---------------------------------------------------------------------------

  async acpReadTextFile(absPath: string, line?: number, limit?: number): Promise<string> {
    const uri = vscode.Uri.file(absPath);
    // Prefer the open-document snapshot so unsaved edits are visible to the agent.
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    let content: string;
    if (open) {
      content = open.getText();
    } else {
      const buf = await vscode.workspace.fs.readFile(uri);
      content = new TextDecoder("utf-8").decode(buf);
    }
    if (line === undefined && limit === undefined) return content;
    const lines = content.split(/\r?\n/);
    const startIdx = Math.max(0, (line ?? 1) - 1);
    const endIdx = limit === undefined ? lines.length : Math.min(lines.length, startIdx + limit);
    return lines.slice(startIdx, endIdx).join("\n");
  }

  async acpWriteTextFile(absPath: string, content: string): Promise<void> {
    const uri = vscode.Uri.file(absPath);
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (open) {
      const edit = new vscode.WorkspaceEdit();
      const fullRange = new vscode.Range(
        new vscode.Position(0, 0),
        open.lineAt(open.lineCount - 1).range.end,
      );
      edit.replace(uri, fullRange, content);
      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        throw new Error(`workspace.applyEdit refused for ${absPath}`);
      }
      await open.save();
      return;
    }
    // Ensure parent directory exists for newly created files.
    const parentDir = vscode.Uri.file(path.dirname(absPath));
    try {
      await vscode.workspace.fs.createDirectory(parentDir);
    } catch {
      /* parent may already exist */
    }
    await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
  }

  // ---------------------------------------------------------------------------
  // @-mention file search & diagnostics (used by webview lookups)
  // ---------------------------------------------------------------------------

  async findFiles(query: string, max = 30): Promise<FileSearchEntry[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) return [];
    const root = folders[0];
    const sanitised = sanitiseGlobQuery(query);
    const pattern = new vscode.RelativePattern(root, `**/${sanitised}*`);
    const ignore = new vscode.RelativePattern(root, "**/{node_modules,.git,dist,build}/**");
    const files = await vscode.workspace.findFiles(pattern, ignore, max);
    return files.map((u) => ({
      path: u.fsPath,
      relPath: path.relative(root.uri.fsPath, u.fsPath).replace(/\\/g, "/"),
    }));
  }

  getDiagnostics(uri?: string): DiagnosticItem[] {
    const items: DiagnosticItem[] = [];
    const collect = (u: vscode.Uri, ds: readonly vscode.Diagnostic[]) => {
      for (const d of ds) {
        items.push({
          uri: u.fsPath,
          range: { startLine: d.range.start.line + 1, endLine: d.range.end.line + 1 },
          message: d.message,
          severity: severityToString(d.severity),
          source: d.source,
        });
      }
    };
    if (uri) {
      const u = vscode.Uri.file(uri);
      collect(u, vscode.languages.getDiagnostics(u));
    } else {
      const all = vscode.languages.getDiagnostics();
      for (const [u, ds] of all) collect(u, ds);
    }
    return items;
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private guessLanguage(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case ".ts":
      case ".tsx":
        return "typescript";
      case ".js":
      case ".jsx":
        return "javascript";
      case ".py":
        return "python";
      case ".go":
        return "go";
      case ".rs":
        return "rust";
      case ".java":
        return "java";
      case ".cpp":
      case ".cc":
      case ".hpp":
        return "cpp";
      case ".md":
        return "markdown";
      case ".json":
        return "json";
      default:
        return "plaintext";
    }
  }
}

function severityToString(s: vscode.DiagnosticSeverity): "error" | "warning" | "info" | "hint" {
  switch (s) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "info";
    case vscode.DiagnosticSeverity.Hint:
      return "hint";
  }
}

function sanitiseGlobQuery(q: string): string {
  return q.replace(/[\\{}()[\]!?]/g, "");
}
