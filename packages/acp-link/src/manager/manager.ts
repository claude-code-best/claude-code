import type { AcpInstance, InstanceSummary, LogEntry } from "./types.js";

function log(tag: string, msg: string) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${tag}] ${msg}`);
}

const MAX_LOG_LINES = 2000;
const SHUTDOWN_TIMEOUT_MS = 5000;

export class ProcessManager {
  private instances = new Map<string, AcpInstance>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private processes = new Map<string, any>();

  create(group: string, command: string): AcpInstance {
    const id = crypto.randomUUID();
    const instance: AcpInstance = {
      id,
      group,
      command,
      status: "running",
      pid: undefined,
      startTime: Date.now(),
      exitCode: null,
      logs: [],
      subscribers: new Set(),
    };

    const args = this.parseCommand(command);
    const fullArgs = ["--group", group, ...args];

    const proc = Bun.spawn(["acp-link", ...fullArgs], {
      stdout: "pipe",
      stderr: "pipe",
      env: { ...Bun.env, ACP_CHILD: "1" },
    });

    instance.pid = proc.pid;
    this.instances.set(id, instance);
    this.processes.set(id, proc);
    log("manager", `created instance ${id.slice(0, 8)} group=${group} pid=${proc.pid} cmd="acp-link ${fullArgs.join(" ")}"`);

    this.pipeStream(proc.stdout, id, "stdout");
    this.pipeStream(proc.stderr, id, "stderr");

    proc.exited.then((code) => {
      instance.status = code === 0 ? "stopped" : "failed";
      instance.exitCode = code;
      instance.pid = undefined;
      this.processes.delete(id);
      log("manager", `instance ${id.slice(0, 8)} ${instance.status} exit=${code}`);
      this.notifyStatus(instance);
    });

    return instance;
  }

  stop(id: string): boolean {
    const proc = this.processes.get(id);
    if (!proc) return false;
    const inst = this.instances.get(id);
    log("manager", `stopping instance ${id.slice(0, 8)} pid=${proc.pid}`);
    proc.kill("SIGTERM");
    // Immediately mark as stopped to prevent stale state
    if (inst) {
      inst.status = "stopped";
    }
    return true;
  }

  remove(id: string): boolean {
    const instance = this.instances.get(id);
    if (!instance) return false;
    if (instance.status === "running") return false;
    instance.subscribers.clear();
    this.instances.delete(id);
    log("manager", `removed instance ${id.slice(0, 8)} group=${instance.group}`);
    return true;
  }

  list(): InstanceSummary[] {
    return Array.from(this.instances.values()).map(this.toSummary);
  }

  get(id: string): AcpInstance | undefined {
    return this.instances.get(id);
  }

  subscribe(id: string, callback: (entry: LogEntry) => void): () => void {
    const instance = this.instances.get(id);
    if (!instance) return () => {};
    instance.subscribers.add(callback);
    return () => instance.subscribers.delete(callback);
  }

  async shutdownAll(): Promise<void> {
    const running = Array.from(this.processes.entries());
    if (running.length === 0) return;

    log("manager", `shutting down ${running.length} running instance(s)...`);
    for (const [id, proc] of running) {
      try {
        proc.kill("SIGTERM");
        log("manager", `sent SIGTERM to ${id.slice(0, 8)} pid=${proc.pid}`);
      } catch {
        // already dead
      }
    }

    const timeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS));
    await Promise.race([
      Promise.all(running.map(([, proc]) => proc.exited.catch(() => {}))),
      timeout,
    ]);

    for (const [id, proc] of running) {
      try {
        proc.kill("SIGKILL");
        log("manager", `sent SIGKILL to ${id.slice(0, 8)}`);
      } catch {
        // already dead
      }
    }
    log("manager", "all instances shut down");
  }

  private parseCommand(command: string): string[] {
    const args: string[] = [];
    let current = "";
    let inQuote: string | null = null;

    for (const ch of command) {
      if (inQuote) {
        if (ch === inQuote) {
          inQuote = null;
        } else {
          current += ch;
        }
      } else if (ch === '"' || ch === "'") {
        inQuote = ch;
      } else if (ch === " " || ch === "\t") {
        if (current) {
          args.push(current);
          current = "";
        }
      } else {
        current += ch;
      }
    }
    if (current) args.push(current);
    return args;
  }

  private pipeStream(
    readable: ReadableStream<Uint8Array>,
    instanceId: string,
    stream: "stdout" | "stderr",
  ) {
    const reader = readable.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const processChunk = () => {
      reader
        .read()
        .then(({ done, value }) => {
          if (done) {
            if (buffer) this.appendLog(instanceId, buffer, stream);
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line) this.appendLog(instanceId, line, stream);
          }
          processChunk();
        })
        .catch(() => {
          // stream ended or error
        });
    };
    processChunk();
  }

  private appendLog(instanceId: string, text: string, stream: "stdout" | "stderr") {
    const instance = this.instances.get(instanceId);
    if (!instance) return;

    const entry: LogEntry = { timestamp: Date.now(), stream, text };
    instance.logs.push(entry);
    if (instance.logs.length > MAX_LOG_LINES) {
      instance.logs.splice(0, instance.logs.length - MAX_LOG_LINES);
    }

    for (const sub of instance.subscribers) {
      try {
        sub(entry);
      } catch {
        // subscriber error, remove it
        instance.subscribers.delete(sub);
      }
    }
  }

  private notifyStatus(instance: AcpInstance) {
    const statusEntry: LogEntry = {
      timestamp: Date.now(),
      stream: "stderr",
      text: `[${instance.status}] exit code: ${instance.exitCode}`,
    };
    for (const sub of instance.subscribers) {
      try {
        sub(statusEntry);
      } catch {
        instance.subscribers.delete(sub);
      }
    }
  }

  private toSummary(inst: AcpInstance): InstanceSummary {
    return {
      id: inst.id,
      group: inst.group,
      command: inst.command,
      status: inst.status,
      pid: inst.pid,
      startTime: inst.startTime,
      exitCode: inst.exitCode,
    };
  }
}
