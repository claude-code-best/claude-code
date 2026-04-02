import { describe, expect, test } from "bun:test";

// Test Commander.js option parsing independently from main.tsx initialization.
// main.tsx has heavy bootstrap dependencies; we test the CLI argument parsing
// patterns it uses to ensure correct behavior.

const { Command } = require("/Users/konghayao/code/ai/claude-code/node_modules/.old_modules-13e6b62a502cda34/commander/index.js");

function createTestProgram(): Command {
  const program = new Command();
  program
    .name("claude-code")
    .description("CLI test")
    .exitOverride() // prevent process.exit during tests
    .option("-p, --print", "pipe mode")
    .option("--resume", "resume session")
    .option("-v, --verbose", "verbose output")
    .option("--model <model>", "model to use")
    .option("--system-prompt <prompt>", "system prompt")
    .option("--allowedTools <tools...>", "allowed tools")
    .option("--max-turns <n>", "max conversation turns", parseInt)
    .version("1.0.0", "-V, --version", "display version");
  return program;
}

describe("CLI arguments: option parsing", () => {
  test("no flags returns empty opts", () => {
    const program = createTestProgram();
    program.parse(["node", "test"]);
    expect(program.opts()).toEqual({});
  });

  test("-p sets print flag", () => {
    const program = createTestProgram();
    program.parse(["node", "test", "-p"]);
    expect(program.opts().print).toBe(true);
  });

  test("--print is equivalent to -p", () => {
    const program = createTestProgram();
    program.parse(["node", "test", "--print"]);
    expect(program.opts().print).toBe(true);
  });

  test("--resume sets resume flag", () => {
    const program = createTestProgram();
    program.parse(["node", "test", "--resume"]);
    expect(program.opts().resume).toBe(true);
  });

  test("-v sets verbose flag", () => {
    const program = createTestProgram();
    program.parse(["node", "test", "-v"]);
    expect(program.opts().verbose).toBe(true);
  });

  test("--model captures string value", () => {
    const program = createTestProgram();
    program.parse(["node", "test", "--model", "claude-opus-4-6"]);
    expect(program.opts().model).toBe("claude-opus-4-6");
  });

  test("--system-prompt captures string value", () => {
    const program = createTestProgram();
    program.parse(["node", "test", "--system-prompt", "Be concise"]);
    expect(program.opts().systemPrompt).toBe("Be concise");
  });

  test("--max-turns parses integer value", () => {
    const program = createTestProgram();
    program.parse(["node", "test", "--max-turns", "10"]);
    expect(program.opts().maxTurns).toBe(10);
  });

  test("multiple flags can be combined", () => {
    const program = createTestProgram();
    program.parse(["node", "test", "-p", "-v", "--model", "opus"]);
    expect(program.opts().print).toBe(true);
    expect(program.opts().verbose).toBe(true);
    expect(program.opts().model).toBe("opus");
  });

  test("--version throws Commander.CommandError with exit code 0", () => {
    const program = createTestProgram();
    let error: any;
    try {
      program.parse(["node", "test", "--version"]);
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    expect(error.code).toBe("commander.version");
    expect(error.exitCode).toBe(0);
  });

  test("unknown flags throw CommanderError", () => {
    const program = createTestProgram();
    expect(() => program.parse(["node", "test", "--nonexistent"])).toThrow();
  });
});
