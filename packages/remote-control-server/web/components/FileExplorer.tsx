import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { ScrollArea, ScrollBar } from "./ui/scroll-area";
import { Button } from "./ui/button";
import { CodeBlock } from "./ai-elements/code-block";
import type { BundledLanguage } from "shiki";

import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  X,
} from "lucide-react";
import { cn } from "../src/lib/utils";
import type { ACPClient } from "../src/acp/client";
import type {
  FileItem,
  FileContent,
  FileChange,
} from "../src/acp/types";

// Map file extensions to shiki language identifiers
const EXT_TO_LANGUAGE: Record<string, BundledLanguage> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "jsonc",
  md: "markdown",
  mdx: "mdx",
  html: "html",
  htm: "html",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  py: "python",
  rb: "ruby",
  rs: "rust",
  go: "go",
  java: "java",
  kt: "kotlin",
  kts: "kotlin",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cs: "csharp",
  swift: "swift",
  php: "php",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  fish: "fish",
  ps1: "powershell",
  psm1: "powershell",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  svg: "xml",
  vue: "vue",
  svelte: "svelte",
  astro: "astro",
  graphql: "graphql",
  gql: "graphql",
  dockerfile: "dockerfile",
  makefile: "makefile",
  cmake: "cmake",
  lua: "lua",
  vim: "viml",
  ex: "elixir",
  exs: "elixir",
  erl: "erlang",
  hrl: "erlang",
  clj: "clojure",
  cljs: "clojure",
  scala: "scala",
  hs: "haskell",
  ml: "ocaml",
  mli: "ocaml",
  r: "r",
  jl: "julia",
  nim: "nim",
  zig: "zig",
  d: "d",
  dart: "dart",
  v: "v",
  tf: "terraform",
  hcl: "hcl",
  nix: "nix",
  asm: "asm",
  wasm: "wasm",
  ini: "ini",
  env: "dotenv",
  gitignore: "gitignore",
  editorconfig: "ini",
  prettierrc: "json",
  eslintrc: "json",
};

function getLanguageFromPath(path: string): BundledLanguage | null {
  const filename = path.split("/").pop() || "";
  const lowerFilename = filename.toLowerCase();

  // Special filenames
  if (lowerFilename === "dockerfile") return "dockerfile";
  if (lowerFilename === "makefile" || lowerFilename === "gnumakefile") return "makefile";
  if (lowerFilename === "cmakelists.txt") return "cmake";
  if (lowerFilename === ".gitignore") return "gitignore";
  if (lowerFilename === ".env" || lowerFilename.startsWith(".env.")) return "dotenv";

  // Extension-based lookup
  const ext = filename.split(".").pop()?.toLowerCase();
  if (ext && ext in EXT_TO_LANGUAGE) {
    return EXT_TO_LANGUAGE[ext];
  }

  return null;
}

interface FileExplorerProps {
  client: ACPClient;
}

interface TreeNodeState {
  expanded: boolean;
  children?: FileItem[];
  loading?: boolean;
}

export function FileExplorer({ client }: FileExplorerProps) {
  // State
  const [rootItems, setRootItems] = useState<FileItem[]>([]);
  const [treeState, setTreeState] = useState<Map<string, TreeNodeState>>(new Map());
  const [selectedFile, setSelectedFile] = useState<FileContent | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs to avoid stale closures in file change handler
  const selectedFileRef = useRef<FileContent | null>(null);
  const loadDirectoryRef = useRef<((path: string, silent?: boolean) => Promise<void>) | null>(null);

  // Keep refs in sync with state
  useEffect(() => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

  // Subscribe to file changes (separate from state to avoid re-subscribing)
  useEffect(() => {
    let isMounted = true;

    const unsubscribe = client.onFileChanges(async (changes: FileChange[]) => {
      console.log("[FileExplorer] File changes:", changes);

      // Refresh affected directories
      const affectedDirs = new Set<string>();
      for (const change of changes) {
        const parentDir = change.path.includes("/")
          ? change.path.substring(0, change.path.lastIndexOf("/"))
          : "";
        affectedDirs.add(parentDir);
      }
      for (const dir of affectedDirs) {
        loadDirectoryRef.current?.(dir, true); // silent refresh
      }

      // Refresh preview if the selected file changed (use ref to get latest value)
      const currentSelectedFile = selectedFileRef.current;
      if (currentSelectedFile) {
        const changedFile = changes.find(c => c.path === currentSelectedFile.path && c.event === "update");
        if (changedFile) {
          try {
            const content = await client.readFile(currentSelectedFile.path);
            if (isMounted) {
              setSelectedFile(content);
            }
          } catch {
            // File might have been deleted, clear selection
            if (isMounted) {
              setSelectedFile(null);
            }
          }
        }
        // Clear selection if file was deleted
        const deletedFile = changes.find(c => c.path === currentSelectedFile.path && c.event === "delete");
        if (deletedFile && isMounted) {
          setSelectedFile(null);
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [client]);

  // Load directory contents
  const loadDirectory = useCallback(async (path: string, silent = false) => {
    if (!silent) {
      setTreeState((prev) => {
        const newState = new Map(prev);
        newState.set(path, { ...newState.get(path), loading: true, expanded: true });
        return newState;
      });
    }

    try {
      const items = await client.listDir(path);
      if (path === "") {
        setRootItems(items);
      } else {
        setTreeState((prev) => {
          const newState = new Map(prev);
          newState.set(path, { expanded: true, children: items, loading: false });
          return newState;
        });
      }
      setError(null);
    } catch (err) {
      if (!silent) {
        setError(`Failed to load ${path || "root"}: ${(err as Error).message}`);
      }
    }
  }, [client]);

  // Keep loadDirectory ref in sync
  useEffect(() => {
    loadDirectoryRef.current = loadDirectory;
  }, [loadDirectory]);

  // Load root directory on mount
  useEffect(() => {
    loadDirectory("");
  }, [loadDirectory]);

  // Subscribe to server-pushed directory listings (e.g., after session cwd change)
  useEffect(() => {
    client.setDirListingPushHandler((path, items) => {
      console.log("[FileExplorer] Server pushed dir_listing:", path);
      if (path === "") {
        // Root directory changed - reset the tree state and update root items
        setTreeState(new Map());
        setRootItems(items);
        setSelectedFile(null);
      } else {
        // Subdirectory changed - update tree state
        setTreeState((prev) => {
          const newState = new Map(prev);
          newState.set(path, { expanded: true, children: items, loading: false });
          return newState;
        });
      }
    });
    return () => {
      client.setDirListingPushHandler(null);
    };
  }, [client]);

  // Toggle directory expansion
  const toggleDir = useCallback((item: FileItem) => {
    const state = treeState.get(item.path);
    if (state?.expanded) {
      // Collapse
      setTreeState((prev) => {
        const newState = new Map(prev);
        newState.set(item.path, { ...state, expanded: false });
        return newState;
      });
    } else {
      // Expand & load
      loadDirectory(item.path);
    }
  }, [treeState, loadDirectory]);

  // Select file for preview
  const selectFile = useCallback(async (item: FileItem) => {
    setPreviewLoading(true);
    try {
      const content = await client.readFile(item.path);
      setSelectedFile(content);
      setError(null);
    } catch (err) {
      setError(`Failed to read ${item.name}: ${(err as Error).message}`);
    } finally {
      setPreviewLoading(false);
    }
  }, [client]);

  // Render tree node
  const renderTreeNode = (item: FileItem, depth: number = 0) => {
    const state = treeState.get(item.path);
    const isExpanded = state?.expanded ?? false;
    const isLoading = state?.loading ?? false;
    const children = state?.children ?? [];

    return (
      <div key={item.path}>
        <button
          onClick={() => item.type === "dir" ? toggleDir(item) : selectFile(item)}
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1 text-sm hover:bg-muted/50 rounded text-left",
            selectedFile?.path === item.path && "bg-muted"
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {item.type === "dir" ? (
            <>
              {isLoading ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
              ) : isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              {isExpanded ? (
                <FolderOpen className="h-4 w-4 text-blue-500 shrink-0" />
              ) : (
                <Folder className="h-4 w-4 text-blue-500 shrink-0" />
              )}
            </>
          ) : (
            <>
              <span className="w-3.5" /> {/* spacer */}
              <File className="h-4 w-4 text-muted-foreground shrink-0" />
            </>
          )}
          <span className="truncate" title={item.name}>{item.name}</span>
          {item.type === "file" && item.size !== undefined && (
            <span className="ml-auto text-xs text-muted-foreground shrink-0">
              {formatSize(item.size)}
            </span>
          )}
        </button>
        {isExpanded && children.map((child) => renderTreeNode(child, depth + 1))}
      </div>
    );
  };

  // Render preview panel (shared between mobile and desktop)
  const renderPreviewPanel = () => {
    const language = selectedFile ? getLanguageFromPath(selectedFile.path) : null;

    return (
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {selectedFile ? (
          <>
            {/* Preview Header */}
            <div className="flex items-center justify-between p-2 border-b bg-muted/30 shrink-0">
              <span className="text-sm font-medium truncate">{selectedFile.path}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => setSelectedFile(null)}>
                <X className="h-3.5 w-3.5" />
              </Button>
            </div>
            {/* Preview Content */}
            <div className="flex-1 min-h-0 overflow-auto">
              {selectedFile.binary ? (
                selectedFile.mimeType?.startsWith("image/") ? (
                  <div className="p-4 flex justify-center">
                    <img src={`data:${selectedFile.mimeType};base64,${selectedFile.content}`} alt={selectedFile.path} className="max-w-full" />
                  </div>
                ) : (
                  <div className="p-4 text-center text-muted-foreground">Binary file ({formatSize(selectedFile.size)})</div>
                )
              ) : language ? (
                <CodeBlock
                  code={selectedFile.content}
                  language={language}
                  showLineNumbers
                  className="border-0 rounded-none h-full [&>div]:h-full [&>div>div]:h-full [&_pre]:h-full"
                />
              ) : (
                <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-all">{selectedFile.content}</pre>
              )}
              {selectedFile.truncated && (
                <div className="px-4 pb-4 text-sm text-muted-foreground italic">File truncated (too large)</div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {previewLoading ? (
              <RefreshCw className="h-5 w-5 animate-spin" />
            ) : (
              <span className="text-sm">Select a file to preview</span>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full w-full overflow-hidden">
      {error && (
        <div className="bg-destructive/10 text-destructive px-3 py-2 text-sm flex items-center justify-between">
          <span>{error}</span>
          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setError(null)}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Mobile Layout: stacked with collapsible file tree */}
      <div className="md:hidden flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Mobile: Clickable header bar */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="w-full flex items-center justify-between p-2 border-b bg-muted/30 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Files</span>
            {rootItems.length > 0 && (
              <span className="text-xs text-muted-foreground">({rootItems.length} items)</span>
            )}
          </div>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              sidebarOpen ? "rotate-180" : ""
            )}
          />
        </button>

        {/* Mobile: File Tree with animated collapse */}
        {sidebarOpen && (
          <ScrollArea className="h-48 border-b">
            <div className="p-1 min-w-max">
              {rootItems.map((item) => renderTreeNode(item))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        )}

        {/* Mobile: Preview Panel */}
        {renderPreviewPanel()}
      </div>

      {/* Desktop Layout: fixed sidebar + preview */}
      <div className="hidden md:flex flex-1 min-h-0">
        {/* Desktop: File Tree Sidebar */}
        <div className={cn(
          "flex flex-col border-r bg-muted/30 transition-all duration-200 min-h-0",
          sidebarOpen ? "w-72" : "w-0"
        )}>
          {sidebarOpen && (
            <>
              {/* Desktop: Sidebar Header */}
              <div className="flex items-center justify-between p-2 border-b shrink-0">
                <span className="text-sm font-medium">Files</span>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => loadDirectory("")}>
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSidebarOpen(false)}>
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {/* Desktop: File Tree with horizontal scroll */}
              <ScrollArea className="flex-1">
                <div className="p-1 min-w-max">
                  {rootItems.map((item) => renderTreeNode(item))}
                </div>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </>
          )}
        </div>

        {/* Desktop: Toggle button when sidebar is closed */}
        {!sidebarOpen && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 m-1 shrink-0"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeftOpen className="h-4 w-4" />
          </Button>
        )}

        {/* Desktop: Preview Panel */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {renderPreviewPanel()}
        </div>
      </div>
    </div>
  );
}

// Utility function
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
