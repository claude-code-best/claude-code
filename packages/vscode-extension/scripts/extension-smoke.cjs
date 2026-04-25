#!/usr/bin/env node
const Module = require("node:module");
const path = require("node:path");

const extensionDir = path.resolve(__dirname, "..");
const registeredCommands = [];
const registeredViews = [];

function disposable() {
  return { dispose() {} };
}

const fakeConfiguration = {
  get(_key, defaultValue) {
    return defaultValue;
  },
};

const fakeVscode = {
  StatusBarAlignment: { Right: 2 },
  Uri: {
    joinPath(base, ...segments) {
      return {
        fsPath: path.join(base.fsPath ?? String(base), ...segments),
        path: path.join(base.path ?? base.fsPath ?? String(base), ...segments),
      };
    },
  },
  window: {
    createStatusBarItem() {
      return {
        text: "",
        tooltip: "",
        command: undefined,
        show() {},
        dispose() {},
      };
    },
    createOutputChannel() {
      return {
        appendLine() {},
        dispose() {},
      };
    },
    registerWebviewViewProvider(id, provider, options) {
      registeredViews.push({ id, provider, options });
      return disposable();
    },
  },
  commands: {
    registerCommand(id, handler) {
      registeredCommands.push({ id, handler });
      return disposable();
    },
    async executeCommand() {},
  },
  workspace: {
    getConfiguration() {
      return fakeConfiguration;
    },
    workspaceFolders: [
      {
        uri: {
          fsPath: path.resolve(extensionDir, "../.."),
          path: path.resolve(extensionDir, "../.."),
        },
      },
    ],
  },
};

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === "vscode") return fakeVscode;
  return originalLoad.call(this, request, parent, isMain);
};

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const extension = require(path.join(extensionDir, "dist", "extension.js"));
const state = new Map();
const context = {
  extensionUri: { fsPath: extensionDir, path: extensionDir },
  globalState: {
    get(key, defaultValue) {
      return state.has(key) ? state.get(key) : defaultValue;
    },
    update(key, value) {
      state.set(key, value);
      return Promise.resolve();
    },
    keys() {
      return [...state.keys()];
    },
  },
  subscriptions: [],
};

try {
  extension.activate(context);

  assert(
    registeredViews.some((view) => view.id === "ccb.chat"),
    "ccb.chat webview provider was not registered",
  );

  for (const command of [
    "ccb.newChat",
    "ccb.focus",
    "ccb.cancel",
    "ccb.cycleMode",
    "ccb.sendSelection",
    "ccb.sendFileContext",
    "ccb.restartAgent",
    "ccb.openHistory",
    "ccb.clearScreen",
    "ccb.searchHistory",
    "ccb.toggleThinking",
  ]) {
    assert(
      registeredCommands.some((entry) => entry.id === command),
      `missing command registration: ${command}`,
    );
  }

  assert(context.subscriptions.length >= 13, "expected disposables in subscriptions");

  extension.deactivate();

  console.log(
    JSON.stringify(
      {
        ok: true,
        views: registeredViews.map((view) => view.id),
        commands: registeredCommands.map((entry) => entry.id),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    "[extension-smoke] failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  Module._load = originalLoad;
}
