import { buildCommand, numberParser } from "@stricli/core";
import type { LocalContext } from "./context.js";

export const command = buildCommand({
  docs: {
    brief: "Start the ACP proxy server",
    fullDescription:
      "Starts a WebSocket proxy server that bridges clients to ACP agents. " +
      "The agent command is spawned as a subprocess and communicates via stdin/stdout.\n\n" +
      "Use -- to pass arguments to the agent:\n" +
      "  acp-link /path/to/agent -- --verbose --model gpt-4\n\n" +
      "For remote access, set ACP_AUTH_TOKEN environment variable or let it auto-generate.",
  },
  parameters: {
    flags: {
      port: {
        kind: "parsed",
        parse: numberParser,
        brief: "Port to listen on",
        default: "9315",
      },
      host: {
        kind: "parsed",
        parse: String,
        brief: "Host to bind to (use 0.0.0.0 for remote access)",
        default: "localhost",
      },
      debug: {
        kind: "boolean",
        brief: "Enable debug logging to file",
        default: false,
      },
      "no-auth": {
        kind: "boolean",
        brief: "DANGEROUS: Disable authentication (not recommended)",
        default: false,
      },
      https: {
        kind: "boolean",
        brief: "Enable HTTPS with auto-generated self-signed certificate",
        default: false,
      },
    },
    positional: {
      kind: "array",
      parameter: {
        brief: "Agent command and arguments (use -- before agent flags)",
        parse: String,
        placeholder: "command",
      },
      minimum: 1,
    },
  },
  func: async function (
    this: LocalContext,
    flags: { port: number; host: string; debug: boolean; "no-auth": boolean; https: boolean },
    ...args: readonly string[]
  ) {
    const port = flags.port;
    const host = flags.host;
    const debug = flags.debug;
    const noAuth = flags["no-auth"];
    const https = flags.https;
    const [command, ...agentArgs] = args;
    const cwd = process.cwd();

    // Determine auth token
    // Priority: ACP_AUTH_TOKEN env var > auto-generate (unless --no-auth)
    let token: string | undefined;
    if (noAuth) {
      console.warn("⚠️  WARNING: Authentication disabled. This is dangerous for remote access!");
      token = undefined;
    } else {
      token = process.env.ACP_AUTH_TOKEN;
      if (!token) {
        // Auto-generate random token
        const { randomBytes } = await import("node:crypto");
        token = randomBytes(32).toString("hex");
      }
    }

    // Initialize logger
    const { initLogger } = await import("../logger.js");
    initLogger({ debug });

    // Import and run the server
    const { startServer } = await import("../server.js");
    await startServer({ port, host, command: command!, args: [...agentArgs], cwd, debug, token, https });
  },
});
