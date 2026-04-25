#!/usr/bin/env node
import * as acp from "@agentclientprotocol/sdk";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const extensionDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(extensionDir, "../..");
const cliPath = resolve(repoRoot, "dist", "cli-node.js");
const smokeCwd = await mkdtemp(join(tmpdir(), "ccb-vscode-acp-smoke-"));
const DEFAULT_TIMEOUT_MS = 30_000;

const updates = [];
const elicitations = [];
const permissionRequests = [];
let stderr = "";
let sessionIdForCleanup;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function textFromUpdates(slice) {
  return slice
    .map((params) => {
      const update = params.update;
      const content = update?.content;
      return content?.type === "text" ? content.text : "";
    })
    .filter(Boolean)
    .join("\n");
}

function waitFor(predicate, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const started = Date.now();
  return new Promise((resolveWait, reject) => {
    const timer = setInterval(() => {
      try {
        const value = predicate();
        if (value) {
          clearInterval(timer);
          resolveWait(value);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for ${label}`));
        }
      } catch (error) {
        clearInterval(timer);
        reject(error);
      }
    }, 50);
  });
}

async function withTimeout(promise, label, timeoutMs = DEFAULT_TIMEOUT_MS) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(
      () => reject(new Error(`Timed out during ${label}`)),
      timeoutMs,
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
}

async function removeTempDir(path) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(path, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 4) {
        console.warn(
          `[acp-smoke] warning: failed to remove temp dir ${path}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
        return;
      }
      await delay(250);
    }
  }
}

async function waitForChildExit(childProcess, timeoutMs) {
  if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
    return;
  }

  await new Promise((resolveWait) => {
    const timer = setTimeout(resolveWait, timeoutMs);
    childProcess.once("exit", () => {
      clearTimeout(timer);
      resolveWait();
    });
  });
}

const child = spawn(process.execPath, [cliPath, "--acp"], {
  cwd: repoRoot,
  stdio: ["pipe", "pipe", "pipe"],
  windowsHide: true,
  env: {
    ...process.env,
    CCB_VSCODE_ACP: "1",
    DISABLE_LOGIN_COMMAND: "0",
  },
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});

child.on("exit", (code, signal) => {
  if (code !== 0 && code !== null) {
    stderr += `\n[acp-smoke] child exited code=${code} signal=${signal ?? ""}`;
  }
});

const input = Writable.toWeb(child.stdin);
const output = Readable.toWeb(child.stdout);
const stream = acp.ndJsonStream(input, output);

const client = {
  requestPermission: async (params) => {
    permissionRequests.push(params);
    const option =
      params.options.find((o) => o.optionId === "allow") ??
      params.options.find((o) => o.kind === "allow_once") ??
      params.options[0];
    return { outcome: { outcome: "selected", optionId: option.optionId } };
  },
  sessionUpdate: async (params) => {
    updates.push(params);
  },
  readTextFile: async (params) => ({
    content: await readFile(params.path, "utf8"),
  }),
  unstable_createElicitation: async (params) => {
    elicitations.push(params);
    return { action: "decline" };
  },
};

const connection = new acp.ClientSideConnection(() => client, stream);

async function prompt(sessionId, text, label = text) {
  const before = updates.length;
  const result = await withTimeout(
    connection.prompt({
      sessionId,
      prompt: [{ type: "text", text }],
    }),
    `prompt ${label}`,
  );
  return { result, emitted: updates.slice(before) };
}

try {
  const init = await withTimeout(
    connection.initialize({
      protocolVersion: acp.PROTOCOL_VERSION,
      clientInfo: { name: "ccb-vscode-smoke", version: "0.0.0" },
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: false },
        elicitation: { form: {} },
      },
    }),
    "initialize",
  );
  assert(init.agentInfo?.name, "initialize did not return agentInfo");

  const session = await withTimeout(
    connection.newSession({
      cwd: smokeCwd,
      mcpServers: [],
      _meta: { permissionMode: "bypassPermissions" },
    }),
    "newSession",
  );
  assert(session.sessionId, "newSession did not return sessionId");
  sessionIdForCleanup = session.sessionId;

  const commandUpdate = await waitFor(
    () =>
      updates.find(
        (params) => params.update?.sessionUpdate === "available_commands_update",
      ),
    "available_commands_update",
  );
  const commands = commandUpdate.update.availableCommands;
  const byName = new Map(commands.map((command) => [command.name, command]));
  const login = byName.get("login");
  const simplify = byName.get("simplify");
  const mcp = byName.get("mcp");

  assert(login, "missing /login command");
  assert(simplify, "missing /simplify command");
  assert(mcp, "missing /mcp command");
  assert(
    login.input?.hint?.includes("openai_chat_api") &&
      login.input?.hint?.includes("gemini_api"),
    "/login is missing expected provider sub-options",
  );
  assert(
    mcp.input?.hint?.includes("enable") &&
      mcp.input?.hint?.includes("disable") &&
      mcp.input?.hint?.includes("reconnect"),
    "/mcp is missing expected subcommands",
  );
  assert(
    Array.isArray(mcp._meta?.ccbMcpServerNames),
    "/mcp metadata is missing MCP server-name candidates",
  );
  assert(
    mcp._meta.ccbMcpServerNames.includes("mcp-chrome"),
    "/mcp metadata is missing built-in MCP server candidates",
  );
  assert(
    mcp._meta.ccbMcpServerNames.includes("claude-in-chrome"),
    "/mcp metadata is missing claude-in-chrome built-in candidate",
  );
  assert(
    !mcp._meta.ccbMcpServerNames.includes("computer-use"),
    "/mcp metadata should not expose interactive computer-use in ACP headless sessions",
  );
  assert(
    Array.isArray(mcp._meta?.ccbMcpServers) &&
      mcp._meta.ccbMcpServers.some((server) => server?.name === "mcp-chrome"),
    "/mcp metadata is missing structured MCP server entries",
  );
  assert(
    mcp._meta.ccbMcpServers.some((server) => server?.name === "claude-in-chrome"),
    "/mcp metadata is missing structured claude-in-chrome entry",
  );

  const help = await prompt(session.sessionId, "/help", "/help");
  assert(help.result.stopReason === "end_turn", "/help did not end cleanly");
  assert(
    textFromUpdates(help.emitted).includes("/login"),
    "/help output did not include command catalog",
  );

  const invalidLogin = await prompt(
    session.sessionId,
    "/login unsupported_provider",
    "/login unsupported_provider",
  );
  assert(
    invalidLogin.result.stopReason === "end_turn",
    "invalid /login did not end cleanly",
  );
  assert(
    textFromUpdates(invalidLogin.emitted).includes("Unsupported /login option"),
    "invalid /login did not report a validation message",
  );

  elicitations.length = 0;
  const loginPrompt = await prompt(session.sessionId, "/login", "/login");
  assert(loginPrompt.result.stopReason === "end_turn", "/login did not end cleanly");
  const methodElicitation = elicitations[0];
  assert(methodElicitation, "/login did not request method elicitation");
  const methodOptions =
    methodElicitation.requestedSchema?.properties?.method?.oneOf ?? [];
  const methodValues = methodOptions.map((option) => option.const);
  for (const expected of [
    "claudeai",
    "console",
    "custom_platform",
    "openai_chat_api",
    "gemini_api",
    "platform",
  ]) {
    assert(methodValues.includes(expected), `/login method missing ${expected}`);
  }

  elicitations.length = 0;
  const providerLogin = await prompt(
    session.sessionId,
    "/login openai_chat_api",
    "/login openai_chat_api",
  );
  assert(
    providerLogin.result.stopReason === "end_turn",
    "/login openai_chat_api did not end cleanly",
  );
  const providerElicitation = elicitations[0];
  assert(providerElicitation, "/login openai_chat_api did not request provider settings");
  const properties = providerElicitation.requestedSchema?.properties ?? {};
  for (const expected of [
    "base_url",
    "api_key",
    "haiku_model",
    "sonnet_model",
    "opus_model",
  ]) {
    assert(
      Object.hasOwn(properties, expected),
      `/login openai_chat_api schema missing ${expected}`,
    );
  }

  const mcpSummary = await prompt(session.sessionId, "/mcp", "/mcp");
  assert(mcpSummary.result.stopReason === "end_turn", "/mcp did not end cleanly");
  assert(
    textFromUpdates(mcpSummary.emitted).includes("Manage MCP servers"),
    "/mcp summary did not include the MCP manager heading",
  );
  assert(
    textFromUpdates(mcpSummary.emitted).includes("Built-in MCPs (always available)"),
    "/mcp summary did not include the built-in MCP group",
  );
  assert(
    textFromUpdates(mcpSummary.emitted).includes("claude-in-chrome"),
    "/mcp summary did not include claude-in-chrome",
  );
  assert(
    !textFromUpdates(mcpSummary.emitted).includes("computer-use"),
    "/mcp summary should not include interactive computer-use in ACP headless sessions",
  );
  assert(
    !textFromUpdates(mcpSummary.emitted).includes("/mcp enable [server-name]"),
    "/mcp summary should not render executable subcommands as list entries",
  );

  let chromeToolsText = "";
  for (let attempt = 0; attempt < 10; attempt++) {
    const chromeTools = await prompt(
      session.sessionId,
      "/mcp tools claude-in-chrome",
      `/mcp tools claude-in-chrome attempt ${attempt + 1}`,
    );
    assert(
      chromeTools.result.stopReason === "end_turn",
      "/mcp tools claude-in-chrome did not end cleanly",
    );
    chromeToolsText = textFromUpdates(chromeTools.emitted);
    if (chromeToolsText.includes("tabs_context_mcp")) {
      break;
    }
    await delay(500);
  }
  assert(
    chromeToolsText.includes("tabs_context_mcp"),
    "/mcp tools claude-in-chrome did not expose Chrome MCP tool schemas",
  );

  const mcpStatus = await prompt(
    session.sessionId,
    "/mcp status mcp-chrome",
    "/mcp status mcp-chrome",
  );
  assert(
    mcpStatus.result.stopReason === "end_turn",
    "/mcp status mcp-chrome did not end cleanly",
  );
  assert(
    textFromUpdates(mcpStatus.emitted).includes('MCP server "mcp-chrome"'),
    "/mcp status did not return a server detail view",
  );

  const mcpTools = await prompt(
    session.sessionId,
    "/mcp tools mcp-chrome",
    "/mcp tools mcp-chrome",
  );
  assert(
    mcpTools.result.stopReason === "end_turn",
    "/mcp tools mcp-chrome did not end cleanly",
  );
  assert(
    textFromUpdates(mcpTools.emitted).includes('MCP server "mcp-chrome"') ||
      textFromUpdates(mcpTools.emitted).includes("Tools for mcp-chrome"),
    "/mcp tools did not complete through the ACP command path",
  );

  const mcpReconnectMissing = await prompt(
    session.sessionId,
    "/mcp reconnect __ccb_smoke_missing__",
    "/mcp reconnect missing",
  );
  assert(
    mcpReconnectMissing.result.stopReason === "end_turn",
    "/mcp reconnect missing did not end cleanly",
  );
  assert(
    textFromUpdates(mcpReconnectMissing.emitted).includes('MCP server "__ccb_smoke_missing__" not found'),
    "/mcp reconnect missing did not complete through the ACP command path",
  );

  const mcpReconnectDisabled = await prompt(
    session.sessionId,
    "/mcp reconnect mcp-chrome",
    "/mcp reconnect disabled",
  );
  assert(
    mcpReconnectDisabled.result.stopReason === "end_turn",
    "/mcp reconnect disabled did not end cleanly",
  );
  assert(
    textFromUpdates(mcpReconnectDisabled.emitted).includes('MCP server "mcp-chrome" is disabled'),
    "/mcp reconnect disabled should require enabling the server first",
  );

  const mcpEnable = await prompt(
    session.sessionId,
    "/mcp enable __ccb_smoke_missing__",
    "/mcp enable missing",
  );
  assert(
    mcpEnable.result.stopReason === "end_turn",
    "/mcp enable missing did not end cleanly",
  );
  assert(
    textFromUpdates(mcpEnable.emitted).includes('MCP server "__ccb_smoke_missing__" not found'),
    "/mcp enable missing did not complete through the ACP command path",
  );

  const mcpDisable = await prompt(
    session.sessionId,
    "/mcp disable __ccb_smoke_missing__",
    "/mcp disable missing",
  );
  assert(
    mcpDisable.result.stopReason === "end_turn",
    "/mcp disable missing did not end cleanly",
  );
  assert(
    textFromUpdates(mcpDisable.emitted).includes('MCP server "__ccb_smoke_missing__" not found'),
    "/mcp disable missing did not complete through the ACP command path",
  );

  const pendingToolCalls = updates.filter(
    (params) =>
      params.update?.sessionUpdate === "tool_call" &&
      params.update?.status === "pending",
  );
  assert(
    pendingToolCalls.length === 0,
    `local slash smoke left ${pendingToolCalls.length} pending tool call(s)`,
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        agent: init.agentInfo,
        sessionId: session.sessionId,
        commands: commands.length,
        checked: [
          "/help",
          "/login",
          "/login openai_chat_api",
          "/mcp",
          "/mcp tools claude-in-chrome",
          "/mcp status mcp-chrome",
          "/mcp tools mcp-chrome",
          "/mcp reconnect __ccb_smoke_missing__",
          "/mcp reconnect mcp-chrome",
          "/mcp enable __ccb_smoke_missing__",
          "/mcp disable __ccb_smoke_missing__",
        ],
        permissionRequests: permissionRequests.length,
      },
      null,
      2,
    ),
  );
  if (typeof connection.unstable_closeSession === "function") {
    await withTimeout(
      connection.unstable_closeSession({ sessionId: session.sessionId }),
      "closeSession",
      10_000,
    );
    sessionIdForCleanup = undefined;
  }
} catch (error) {
  console.error("[acp-smoke] failed:", error instanceof Error ? error.message : error);
  if (stderr.trim()) {
    console.error("[acp-smoke] agent stderr:");
    console.error(stderr.trim().slice(-6000));
  }
  process.exitCode = 1;
} finally {
  if (sessionIdForCleanup && typeof connection.unstable_closeSession === "function") {
    await connection
      .unstable_closeSession({ sessionId: sessionIdForCleanup })
      .catch((error) => {
        console.error(
          "[acp-smoke] closeSession failed:",
          error instanceof Error ? error.message : error,
        );
      });
  }
  child.kill("SIGTERM");
  await waitForChildExit(child, 5000);
  if (child.exitCode === null) {
    child.kill("SIGKILL");
    await waitForChildExit(child, 1000);
  }
  await removeTempDir(smokeCwd);
}
