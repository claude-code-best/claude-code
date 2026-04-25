import type { AvailableCommand } from "./acp/types";

export type ArgumentOption = {
  value: string;
  label: string;
  insertText: string;
};

type McpServerMeta = {
  name: string;
  status?: string;
  scope?: string;
  transport?: string;
  actions?: string[];
};

const PLACEHOLDER_ARGUMENTS = new Set([
  "color",
  "conversation",
  "description",
  "filename",
  "instruction",
  "interval",
  "issue",
  "job-id",
  "message",
  "model",
  "name",
  "options",
  "path",
  "prompt",
  "question",
  "report",
  "server-name",
  "tag-name",
  "token_count",
]);

export function getStringMeta(command: AvailableCommand, key: string): string | null {
  const value = command._meta?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function getStringArrayMeta(command: AvailableCommand, key: string): string[] {
  const value = command._meta?.[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

export function getMcpServerMeta(command: AvailableCommand): McpServerMeta[] {
  const value = command._meta?.ccbMcpServers;
  if (!Array.isArray(value)) {
    return getStringArrayMeta(command, "ccbMcpServerNames").map((name) => ({ name }));
  }
  return value
    .map((item): McpServerMeta | null => {
      if (!item || typeof item !== "object") return null;
      const raw = item as Record<string, unknown>;
      if (typeof raw.name !== "string" || raw.name.length === 0) return null;
      return {
        name: raw.name,
        status: typeof raw.status === "string" ? raw.status : undefined,
        scope: typeof raw.scope === "string" ? raw.scope : undefined,
        transport: typeof raw.transport === "string" ? raw.transport : undefined,
        actions: Array.isArray(raw.actions)
          ? raw.actions.filter((action): action is string => typeof action === "string" && action.length > 0)
          : undefined,
      };
    })
    .filter((item): item is McpServerMeta => item !== null);
}

export function commandMatchesName(command: AvailableCommand, name: string): boolean {
  const normalized = name.toLowerCase();
  if (command.name.toLowerCase() === normalized) return true;
  if (getStringMeta(command, "ccbCanonicalName")?.toLowerCase() === normalized) return true;
  if (getStringMeta(command, "ccbAliasFor")?.toLowerCase() === normalized) return true;
  return getStringArrayMeta(command, "ccbAliases").some((alias) => alias.toLowerCase() === normalized);
}

export function findCommandByName(commands: AvailableCommand[], name: string): AvailableCommand | null {
  return commands.find((command) => commandMatchesName(command, name)) ?? null;
}

export function commandMatchesFilter(command: AvailableCommand, filter: string): boolean {
  const query = filter.trim().toLowerCase();
  if (!query) return true;

  const terms = [
    command.name,
    command.description,
    command.input?.hint ?? "",
    getStringMeta(command, "ccbCanonicalName") ?? "",
    getStringMeta(command, "ccbAliasFor") ?? "",
    ...getStringArrayMeta(command, "ccbAliases"),
  ];

  return terms.some((term) => term.toLowerCase().includes(query));
}

export function getArgumentOptions(
  hint: string | null | undefined,
  currentArgs = "",
  command?: AvailableCommand | null,
): ArgumentOption[] {
  if (!hint) return [];

  const argText = currentArgs.replace(/^\s+/, "");
  if (argText.includes("\n")) return [];
  const hasTrailingWhitespace = /\s$/.test(argText);
  const argTokens = argText.trim().length > 0 ? argText.trim().split(/\s+/) : [];

  const serverOptions = getMcpServerArgumentOptions(command, argText, argTokens, hasTrailingWhitespace);
  if (serverOptions !== null) {
    return serverOptions;
  }

  if (argTokens.length > 1 || (argTokens.length === 1 && hasTrailingWhitespace)) {
    return [];
  }
  const query = (argTokens[0] ?? "").toLowerCase();
  const seen = new Set<string>();
  const options: ArgumentOption[] = [];

  for (const rawPart of parseTopLevelOptions(hint)) {
    const label = rawPart.replace(/\s+/g, " ").trim();
    if (isLikelyPlaceholderLabel(label)) continue;
    const value = normalizeOptionValue(label);
    if (!value || PLACEHOLDER_ARGUMENTS.has(value.toLowerCase()) || seen.has(value)) {
      continue;
    }
    if (query && !value.toLowerCase().includes(query) && !label.toLowerCase().includes(query)) {
      continue;
    }
    seen.add(value);
    options.push({ value, label: label || value, insertText: value });
  }
  return options;
}

export function getSlashMenuState(
  value: string,
  commands: AvailableCommand[],
): { visible: boolean; filter: string; commandName?: string } {
  if (!value.startsWith("/") || value.includes("\n")) {
    return { visible: false, filter: "" };
  }

  const body = value.slice(1);
  const firstWhitespace = body.search(/\s/);
  if (firstWhitespace === -1) {
    return { visible: true, filter: body };
  }

  const commandName = body.slice(0, firstWhitespace);
  const command = findCommandByName(commands, commandName);
  if (!command) return { visible: false, filter: "" };

  const argText = body.slice(firstWhitespace + 1);
  if (getArgumentOptions(command.input?.hint, argText, command).length === 0) {
    return { visible: false, filter: "" };
  }

  return { visible: true, filter: argText, commandName };
}

function parseTopLevelOptions(hint: string): string[] {
  const source = unwrapWholeEnclosure(hint.trim()) ?? hint.trim();
  if (!source) return [];

  const options = splitTopLevelAlternatives(source);
  if (options.length > 1) return options;

  const single = options[0]?.trim();
  return single ? [single] : [];
}

function unwrapWholeEnclosure(value: string): string | null {
  if (value.length < 2) return null;
  const opener = value[0];
  const closer = opener === "[" ? "]" : opener === "<" ? ">" : null;
  if (!closer) return null;

  let squareDepth = 0;
  let angleDepth = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "[") squareDepth += 1;
    if (char === "]") squareDepth -= 1;
    if (char === "<") angleDepth += 1;
    if (char === ">") angleDepth -= 1;

    const closedOuter = opener === "[" ? squareDepth === 0 : angleDepth === 0;
    if (closedOuter) {
      return i === value.length - 1 ? value.slice(1, -1) : null;
    }
  }

  return null;
}

function splitTopLevelAlternatives(value: string): string[] {
  const parts: string[] = [];
  let squareDepth = 0;
  let angleDepth = 0;
  let start = 0;

  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "[") squareDepth += 1;
    else if (char === "]") squareDepth = Math.max(0, squareDepth - 1);
    else if (char === "<") angleDepth += 1;
    else if (char === ">") angleDepth = Math.max(0, angleDepth - 1);
    else if (char === "|" && squareDepth === 0 && angleDepth === 0) {
      parts.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }

  parts.push(value.slice(start).trim());
  return parts.filter(Boolean);
}

function isLikelyPlaceholderLabel(label: string): boolean {
  return /\s/.test(label) && !/["'`[\]<>()]/.test(label);
}

function getMcpServerArgumentOptions(
  command: AvailableCommand | null | undefined,
  argText: string,
  argTokens: string[],
  hasTrailingWhitespace: boolean,
): ArgumentOption[] | null {
  if (!command || !commandMatchesName(command, "mcp")) return null;

  // Keep this list in sync with src/services/acp/agent.ts:mcpActionsFor.
  const actionValues = ["status", "tools", "enable", "disable", "reconnect"];
  const actionLabels = new Map([
    ["status", "Show server status"],
    ["tools", "List server tools"],
    ["enable", "Enable server"],
    ["disable", "Disable server"],
    ["reconnect", "Reconnect server"],
  ]);
  const servers = getMcpServerMeta(command);
  const first = argTokens[0] ?? "";

  if (argTokens.length === 0) {
    return servers.map(serverToOption);
  }

  if (actionValues.includes(first)) {
    const query = argText.slice(first.length).trim();
    if (query && hasTrailingWhitespace && findMcpServerByName(servers, query)) {
      return [];
    }
    return servers
      .filter((server) => serverSupportsAction(server, first))
      .filter((server) => !query || serverMatchesQuery(server, query))
      .map((server) => ({
        value: server.name,
        label: serverLabel(server),
        insertText: `${first} ${server.name}`,
      }));
  }

  const server = findMcpServerByName(servers, argText.trimEnd());
  if (server && hasTrailingWhitespace) {
    return mcpServerActions(server, actionValues)
      .map((action) => ({
        value: action,
        label: actionLabels.get(action) ?? action,
        insertText: `${action} ${server.name}`,
      }));
  }

  if (!hasTrailingWhitespace) {
    const query = argText.toLowerCase();
    return servers.filter((entry) => entry.name.toLowerCase().includes(query)).map(serverToOption);
  }

  return [];
}

function findMcpServerByName(servers: McpServerMeta[], name: string): McpServerMeta | undefined {
  const normalized = name.toLowerCase();
  return servers.find((server) => server.name.toLowerCase() === normalized);
}

function serverMatchesQuery(server: McpServerMeta, query: string): boolean {
  const normalized = query.toLowerCase();
  return server.name.toLowerCase().includes(normalized) || serverLabel(server).toLowerCase().includes(normalized);
}

function mcpServerActions(server: McpServerMeta, fallbackActions: string[]): string[] {
  return server.actions?.length ? server.actions : fallbackActions;
}

function serverSupportsAction(server: McpServerMeta, action: string): boolean {
  return !server.actions?.length || server.actions.includes(action);
}

function serverToOption(server: McpServerMeta): ArgumentOption {
  return {
    value: server.name,
    label: serverLabel(server),
    insertText: server.name,
  };
}

function serverLabel(server: McpServerMeta): string {
  const parts = [server.status, server.scope, server.transport].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : server.name;
}

function normalizeOptionValue(label: string): string {
  const firstToken = label
    .replace(/^[\s"'`[{(<]+/, "")
    .replace(/[\s"'`\]})>]+$/, "")
    .split(/\s+/)[0];
  return firstToken?.replace(/^[^\w-]+|[^\w-]+$/g, "") ?? "";
}
