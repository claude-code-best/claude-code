import { describe, expect, test } from "bun:test";
import type { AvailableCommand } from "../acp/types";
import {
  commandMatchesFilter,
  commandMatchesName,
  findCommandByName,
  getArgumentOptions,
  getSlashMenuState,
} from "../slashCommands";

const commands: AvailableCommand[] = [
  {
    name: "login",
    description: "Sign in",
    input: {
      hint: "[claudeai|console|custom_platform|openai_chat_api|gemini_api|platform]",
    },
    _meta: {
      ccbCanonicalName: "login",
    },
  },
  {
    name: "simplify",
    description: "Review and simplify recent changes",
    input: null,
    _meta: {
      ccbCanonicalName: "simplify",
      ccbAliases: ["deslop"],
    },
  },
  {
    name: "api",
    description: "Configure API provider",
    input: {
      hint: "[anthropic|openai|gemini|grok|bedrock|vertex|foundry|unset]",
    },
    _meta: {
      ccbCanonicalName: "provider",
      ccbAliasFor: "provider",
    },
  },
  {
    name: "mcp",
    description: "Manage MCP servers",
    input: {
      hint: "[server-name|status <server-name>|tools <server-name>|enable [server-name]|disable [server-name]|reconnect <server-name>]",
    },
    _meta: {
      ccbCanonicalName: "mcp",
      ccbMcpServerNames: ["filesystem", "chrome bridge", "claude-in-chrome"],
      ccbMcpServers: [
        {
          name: "filesystem",
          status: "connected",
          scope: "user",
          transport: "stdio",
          actions: ["status", "tools", "reconnect", "disable"],
        },
        {
          name: "chrome bridge",
          status: "disabled",
          scope: "dynamic",
          transport: "http",
          actions: ["status", "enable"],
        },
        {
          name: "claude-in-chrome",
          status: "connected",
          scope: "dynamic",
          transport: "stdio",
          actions: ["status", "tools", "reconnect", "disable"],
        },
      ],
    },
  },
  {
    name: "plan",
    description: "Plan work",
    input: {
      hint: "[open|<description>]",
    },
    _meta: {
      ccbCanonicalName: "plan",
    },
  },
  {
    name: "sandbox",
    description: "Manage sandbox rules",
    input: {
      hint: 'exclude "command pattern"',
    },
    _meta: {
      ccbCanonicalName: "sandbox",
    },
  },
];

describe("slash command discovery", () => {
  test("finds commands by canonical name and aliases", () => {
    expect(findCommandByName(commands, "login")?.name).toBe("login");
    expect(findCommandByName(commands, "provider")?.name).toBe("api");
    expect(findCommandByName(commands, "deslop")?.name).toBe("simplify");
  });

  test("matches names case-insensitively", () => {
    expect(commandMatchesName(commands[0], "LOGIN")).toBe(true);
    expect(commandMatchesName(commands[1], "DESLOP")).toBe(true);
  });

  test("filters by name, alias, description, and hint", () => {
    expect(commandMatchesFilter(commands[0], "openai")).toBe(true);
    expect(commandMatchesFilter(commands[1], "review")).toBe(true);
    expect(commandMatchesFilter(commands[1], "deslop")).toBe(true);
    expect(commandMatchesFilter(commands[2], "vertex")).toBe(true);
  });

  test("extracts login sub-options from command hint", () => {
    const values = getArgumentOptions(commands[0].input?.hint).map((o) => o.value);
    expect(values).toEqual([
      "claudeai",
      "console",
      "custom_platform",
      "openai_chat_api",
      "gemini_api",
      "platform",
    ]);
  });

  test("extracts nested command sub-options without treating placeholders as choices", () => {
    const options = getArgumentOptions(commands[3].input?.hint);
    expect(options.map((o) => o.value)).toEqual(["status", "tools", "enable", "disable", "reconnect"]);
    expect(options.map((o) => o.label)).toEqual([
      "status <server-name>",
      "tools <server-name>",
      "enable [server-name]",
      "disable [server-name]",
      "reconnect <server-name>",
    ]);

    expect(getArgumentOptions(commands[4].input?.hint).map((o) => o.value)).toEqual(["open"]);
    expect(getArgumentOptions("[<model>|off]").map((o) => o.value)).toEqual(["off"]);
    expect(getArgumentOptions(commands[5].input?.hint).map((o) => o.value)).toEqual(["exclude"]);
  });

  test("does not turn plain placeholder hints into selectable subcommands", () => {
    expect(getArgumentOptions("[conversation id or search term]")).toEqual([]);
    expect(getArgumentOptions("[issue description]")).toEqual([]);
    expect(getArgumentOptions("[token_count]")).toEqual([]);
    expect(getArgumentOptions("[interval] <prompt>")).toEqual([]);
  });

  test("filters argument options for the current argument token only", () => {
    expect(getArgumentOptions(commands[3].input?.hint, "d").map((o) => o.value)).toEqual(["disable"]);
    expect(getArgumentOptions(commands[3].input?.hint, "disable ").map((o) => o.value)).toEqual([]);
    expect(getArgumentOptions(commands[3].input?.hint, "disable server").map((o) => o.value)).toEqual([]);
  });

  test("offers MCP server names as second-level argument options", () => {
    const mcp = commands[3];
    expect(getArgumentOptions(mcp.input?.hint, "", mcp).map((o) => o.value)).toEqual([
      "filesystem",
      "chrome bridge",
      "claude-in-chrome",
    ]);
    expect(getArgumentOptions(mcp.input?.hint, "c", mcp).map((o) => o.value)).toEqual([
      "chrome bridge",
      "claude-in-chrome",
    ]);
    expect(getArgumentOptions(mcp.input?.hint, "dis", mcp)).toEqual([]);
    expect(getArgumentOptions(mcp.input?.hint, "disable ", mcp)).toEqual([
      { value: "filesystem", label: "connected · user · stdio", insertText: "disable filesystem" },
      { value: "claude-in-chrome", label: "connected · dynamic · stdio", insertText: "disable claude-in-chrome" },
    ]);
    expect(getArgumentOptions(mcp.input?.hint, "enable ", mcp)).toEqual([
      { value: "chrome bridge", label: "disabled · dynamic · http", insertText: "enable chrome bridge" },
    ]);
    expect(getArgumentOptions(mcp.input?.hint, "reconnect chrome", mcp)).toEqual([
      { value: "claude-in-chrome", label: "connected · dynamic · stdio", insertText: "reconnect claude-in-chrome" },
    ]);
    expect(getArgumentOptions(mcp.input?.hint, "status chrome b", mcp)).toEqual([
      { value: "chrome bridge", label: "disabled · dynamic · http", insertText: "status chrome bridge" },
    ]);
    expect(getArgumentOptions(mcp.input?.hint, "reconnect chrome b", mcp)).toEqual([]);
    expect(getArgumentOptions(mcp.input?.hint, "filesystem ", mcp)).toEqual([
      { value: "status", label: "Show server status", insertText: "status filesystem" },
      { value: "tools", label: "List server tools", insertText: "tools filesystem" },
      { value: "reconnect", label: "Reconnect server", insertText: "reconnect filesystem" },
      { value: "disable", label: "Disable server", insertText: "disable filesystem" },
    ]);
    expect(getArgumentOptions(mcp.input?.hint, "chrome bridge ", mcp)).toEqual([
      { value: "status", label: "Show server status", insertText: "status chrome bridge" },
      { value: "enable", label: "Enable server", insertText: "enable chrome bridge" },
    ]);
    expect(getArgumentOptions(mcp.input?.hint, "disable filesystem ", mcp)).toEqual([]);
  });

  test("keeps slash menu open for first-level command arguments", () => {
    expect(getSlashMenuState("/mcp ", commands)).toEqual({
      visible: true,
      filter: "",
      commandName: "mcp",
    });
    expect(getSlashMenuState("/mcp dis", commands)).toEqual({
      visible: false,
      filter: "",
    });
    expect(getSlashMenuState("/mcp c", commands)).toEqual({
      visible: true,
      filter: "c",
      commandName: "mcp",
    });
    expect(getSlashMenuState("/mcp disable ", commands)).toEqual({
      visible: true,
      filter: "disable ",
      commandName: "mcp",
    });
    expect(getSlashMenuState("/mcp reconnect chrome", commands)).toEqual({
      visible: true,
      filter: "reconnect chrome",
      commandName: "mcp",
    });
    expect(getSlashMenuState("/mcp reconnect chrome b", commands)).toEqual({
      visible: false,
      filter: "",
    });
    expect(getSlashMenuState("/mcp disable filesystem ", commands)).toEqual({
      visible: false,
      filter: "",
    });
  });
});
