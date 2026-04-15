import { readdir, readFile, writeFile, cp } from 'fs/promises'
import { join } from 'path'
import { getMacroDefines } from './scripts/defines.ts'

const outdir = 'dist'

// Step 1: Clean output directory
const { rmSync } = await import('fs')
rmSync(outdir, { recursive: true, force: true })

// Default features that match the official CLI build.
// Additional features can be enabled via FEATURE_<NAME>=1 env vars.
const DEFAULT_BUILD_FEATURES = [
  'AGENT_TRIGGERS_REMOTE',
  'CHICAGO_MCP',
  'VOICE_MODE',
  'SHOT_STATS',
  'PROMPT_CACHE_BREAK_DETECTION',
  'TOKEN_BUDGET',
  // P0: local features
  'AGENT_TRIGGERS',
  'ULTRATHINK',
  'BUILTIN_EXPLORE_PLAN_AGENTS',
  'LODESTONE',
  // P1: API-dependent features
  'EXTRACT_MEMORIES',
  'VERIFICATION_AGENT',
  'KAIROS_BRIEF',
  'AWAY_SUMMARY',
  'ULTRAPLAN',
  // P2: daemon + remote control server
  'DAEMON',
  // PR-package restored features
  'WORKFLOW_SCRIPTS',
  'HISTORY_SNIP',
  'CONTEXT_COLLAPSE',
  'MONITOR_TOOL',
  'FORK_SUBAGENT',
//   'UDS_INBOX',
  'KAIROS',
  'COORDINATOR_MODE',
  'LAN_PIPES',
  // 'REVIEW_ARTIFACT', // API 请求无响应，需进一步排查 schema 兼容性
  // P3: poor mode (disable extract_memories + prompt_suggestion)
  'POOR',
]

// Collect FEATURE_* env vars → Bun.build features
const envFeatures = Object.keys(process.env)
  .filter(k => k.startsWith('FEATURE_'))
  .map(k => k.replace('FEATURE_', ''))
const features = [...new Set([...DEFAULT_BUILD_FEATURES, ...envFeatures])]

// Step 2: Bundle with splitting
const result = await Bun.build({
  entrypoints: ['src/entrypoints/cli.tsx'],
  outdir,
  target: 'bun',
  splitting: true,
  define: getMacroDefines(),
  features,
})

if (!result.success) {
  console.error('Build failed:')
  for (const log of result.logs) {
    console.error(log)
  }
  process.exit(1)
}

// Step 3: Post-process — replace Bun-only `import.meta.require` with Node.js compatible version
const files = await readdir(outdir)
const IMPORT_META_REQUIRE = 'var __require = import.meta.require;'
const COMPAT_REQUIRE = `var __require = typeof import.meta.require === "function" ? import.meta.require : (await import("module")).createRequire(import.meta.url);`

let patched = 0
for (const file of files) {
  if (!file.endsWith('.js')) continue
  const filePath = join(outdir, file)
  const content = await readFile(filePath, 'utf-8')
  if (content.includes(IMPORT_META_REQUIRE)) {
    await writeFile(
      filePath,
      content.replace(IMPORT_META_REQUIRE, COMPAT_REQUIRE),
    )
    patched++
  }
}

console.log(
  `Bundled ${result.outputs.length} files to ${outdir}/ (patched ${patched} for Node.js compat)`,
)

// Step 4: Copy native .node addon files (audio-capture)
const vendorDir = join(outdir, 'vendor', 'audio-capture')
await cp('vendor/audio-capture', vendorDir, { recursive: true })
console.log(`Copied vendor/audio-capture/ → ${vendorDir}/`)

// Step 5: Bundle download-ripgrep script as standalone JS for postinstall
const rgScript = await Bun.build({
  entrypoints: ['scripts/download-ripgrep.ts'],
  outdir,
  target: 'node',
})
if (!rgScript.success) {
  console.error('Failed to bundle download-ripgrep script:')
  for (const log of rgScript.logs) {
    console.error(log)
  }
  // Non-fatal — postinstall fallback to bun run scripts/download-ripgrep.ts
} else {
  console.log(`Bundled download-ripgrep script to ${outdir}/`)
}

// Step 6: Generate cli-bun and cli-node executable entry points
const cliBun = join(outdir, 'cli-bun.js')
const cliNode = join(outdir, 'cli-node.js')

await writeFile(cliBun, '#!/usr/bin/env bun\nimport "./cli.js"\n')

// Node.js entry needs a Bun API polyfill because Bun.build({ target: 'bun' })
// emits globalThis.Bun references that crash at import time under plain Node.js.
//
// Polyfill coverage:
//   - Bun.which              → PATH + accessSync lookup
//   - Bun.hash               → FNV-1a 32-bit (compatible with Bun.hash for strings)
//   - Bun.$                  → stub (only used by computer-use-input/darwin)
//   - Bun.spawn              → child_process.spawn (async, returns Subprocess-like)
//   - Bun.spawnSync          → child_process.spawnSync (sync, returns SpawnSyncResult)
//   - Bun.file               → fs.promises.readFile wrapper returning Blob-like object
//   - Bun.gc                 → no-op (Node's V8 GC is automatic)
//   - Bun.generateHeapSnapshot → v8.getHeapSnapshot()
//   - Bun.embeddedFiles      → [] (never present in npm package)
const NODE_BUN_POLYFILL = `#!/usr/bin/env node
// Bun API polyfill for Node.js runtime — makes target: 'bun' output runnable under Node.js
if (typeof globalThis.Bun === "undefined") {
  const cp = await import("child_process");
  const { resolve, delimiter } = await import("path");
  const { accessSync, constants: { X_OK }, statSync } = await import("fs");
  const fsp = await import("fs/promises");

  // ── Bun.which ─────────────────────────────────────────────────────────
  // 沿 PATH 查找可执行文件路径
  function which(bin) {
    const isWin = process.platform === "win32";
    const pathExt = isWin ? (process.env.PATHEXT || ".EXE").split(";") : [""];
    for (const dir of (process.env.PATH || "").split(delimiter)) {
      for (const ext of pathExt) {
        const candidate = resolve(dir, bin + ext);
        try { accessSync(candidate, X_OK); return candidate; } catch {}
      }
    }
    return null;
  }

  // ── Bun.hash ──────────────────────────────────────────────────────────
  // FNV-1a 32-bit 散列，与 Bun.hash 行为对齐
  function hash(data, seed) {
    if (typeof data !== "string") return 0;
    let h = ((seed || 0) ^ 0x811c9dc5) >>> 0;
    for (let i = 0; i < data.length; i++) {
      h ^= data.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
  }

  // ── Bun.$ ─────────────────────────────────────────────────────────────
  // Bun shell template tag，仅在 computer-use-input/darwin 中使用
  // 提供 stub 使顶层解构 var { $ } = globalThis.Bun 不崩溃
  function $(parts, ...args) {
    throw new Error("Bun.$ shell API is not available in Node.js. Use Bun runtime for this feature.");
  }

  // ── Bun.spawn ─────────────────────────────────────────────────────────
  // 异步子进程启动，返回与 Bun.Subprocess 兼容的对象
  //
  // 调用签名（本代码库实际使用的模式）：
  //   Bun.spawn([cmd, ...args], { stdin, stdout, stderr, env, argv0 })
  //   Bun.spawn({ cmd: [cmd, ...args], stdin, stdout, stderr })  — 不存在，但防错
  //
  // 返回值需支持：
  //   proc.stdin    → Writable (当 stdin: 'pipe' 时)
  //   proc.stdout   → ReadableStream<Uint8Array> (当 stdout: 'pipe' 时)
  //   proc.stderr   → ReadableStream<Uint8Array> (当 stderr: 'pipe' 时)
  //   proc.exited   → Promise<number> (退出码)
  //   proc.kill()   → 终止进程
  //   proc.pid      → 进程 ID
  function spawn(cmdOrOpts, opts) {
    let cmd, spawnOpts;
    if (Array.isArray(cmdOrOpts)) {
      cmd = cmdOrOpts;
      spawnOpts = opts || {};
    } else {
      const o = cmdOrOpts || {};
      cmd = o.cmd;
      spawnOpts = o;
    }
    if (!Array.isArray(cmd) || cmd.length === 0) {
      throw new TypeError("Bun.spawn requires a non-empty command array");
    }

    // 解析 stdin/stdout/stderr 管道配置
    const toStdio = (v) => {
      if (v === "pipe") return "pipe";
      if (v === "ignore") return "ignore";
      if (v === "inherit") return "inherit";
      return v == null ? "pipe" : "pipe";
    };

    const nodeOpts = {
      stdio: [toStdio(spawnOpts.stdin), toStdio(spawnOpts.stdout), toStdio(spawnOpts.stderr)],
      env: spawnOpts.env || process.env,
      windowsHide: true,
    };

    // 处理 argv0：Bun 用 argv0 重命名进程，Node 中通过 spawn 的第一个参数传递
    const executable = spawnOpts.argv0 || cmd[0];
    const args = spawnOpts.argv0 ? cmd : cmd.slice(1);

    const child = cp.spawn(executable, args, nodeOpts);

    // 构建 Bun 兼容的 stdin 封装
    let bunStdin = null;
    if (spawnOpts.stdin === "pipe" || spawnOpts.stdin == null) {
      bunStdin = child.stdin;
    }

    // 构建 Bun 兼容的 stdout/stderr 封装
    // Bun.spawn 返回 ReadableStream<Uint8Array>，Node 返回 Readable
    // 需要转换以支持 .getReader() 和 new Response(stream).text()
    function toReadableStream(nodeReadable) {
      if (!nodeReadable) return null;
      if (nodeReadable instanceof ReadableStream) return nodeReadable;
      return new ReadableStream({
        start(controller) {
          nodeReadable.on("data", (chunk) => controller.enqueue(new Uint8Array(chunk)));
          nodeReadable.on("end", () => controller.close());
          nodeReadable.on("error", (err) => controller.error(err));
        },
        cancel() {
          nodeReadable.destroy();
        },
      });
    }

    const bunStdout = toReadableStream(child.stdout);
    const bunStderr = toReadableStream(child.stderr);

    // 构建 exited Promise
    const exited = new Promise((resolve) => {
      child.on("close", (code) => resolve(code ?? 0));
    });

    return {
      stdin: bunStdin,
      stdout: bunStdout,
      stderr: bunStderr,
      exited,
      pid: child.pid,
      kill(sig) { child.kill(sig || "SIGTERM"); },
      get exitCode() { return child.exitCode; },
    };
  }

  // ── Bun.spawnSync ─────────────────────────────────────────────────────
  // 同步子进程执行，返回与 Bun.SpawnSyncResult 兼容的对象
  //
  // 调用签名（本代码库实际使用的模式）：
  //   Bun.spawnSync({ cmd: [cmd, ...args], stdin, stdout, stderr, env, timeout })
  //   Bun.spawnSync({ cmd: [cmd, ...args], stdin: Buffer, stdout: 'pipe' })
  //
  // 返回值需支持：
  //   result.stdout   → Uint8Array | null
  //   result.stderr   → Uint8Array | null
  //   result.exitCode → number
  function spawnSync(optsOrCmd) {
    let cmd, syncOpts;
    if (optsOrCmd && typeof optsOrCmd === "object" && !Array.isArray(optsOrCmd)) {
      syncOpts = optsOrCmd;
      cmd = syncOpts.cmd;
    } else {
      throw new TypeError("Bun.spawnSync requires an options object with 'cmd' property");
    }
    if (!Array.isArray(cmd) || cmd.length === 0) {
      throw new TypeError("Bun.spawnSync requires a non-empty cmd array");
    }

    const toStdio = (v) => {
      if (v === "pipe") return "pipe";
      if (v === "ignore") return "ignore";
      if (v === "inherit") return "inherit";
      return v == null ? "pipe" : "pipe";
    };

    const nodeOpts = {
      stdio: [toStdio(syncOpts.stdin), toStdio(syncOpts.stdout), toStdio(syncOpts.stderr)],
      env: syncOpts.env || process.env,
      windowsHide: true,
      timeout: syncOpts.timeout,
    };

    // 如果 stdin 是 Buffer 或 string，将其作为输入传入
    if (Buffer.isBuffer(syncOpts.stdin) || typeof syncOpts.stdin === "string") {
      nodeOpts.input = Buffer.from(syncOpts.stdin);
      nodeOpts.stdio[0] = "pipe";
    }

    const result = cp.spawnSync(cmd[0], cmd.slice(1), nodeOpts);

    return {
      stdout: result.stdout ? Uint8Array.from(Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout)) : null,
      stderr: result.stderr ? Uint8Array.from(Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(result.stderr)) : null,
      exitCode: result.status ?? 1,
      success: result.status === 0,
    };
  }

  // ── Bun.file ──────────────────────────────────────────────────────────
  // 返回类 BunFile 对象，支持 .arrayBuffer()、.text()、.json()、.exists()
  // 本代码库中仅 linux.ts 使用：Bun.file(path).arrayBuffer()
  function bunFile(filePath) {
    return {
      async arrayBuffer() {
        const buf = await fsp.readFile(filePath);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      },
      async text() {
        return await fsp.readFile(filePath, "utf-8");
      },
      async json() {
        return JSON.parse(await fsp.readFile(filePath, "utf-8"));
      },
      async exists() {
        try { await fsp.access(filePath); return true; } catch { return false; }
      },
      get size() {
        try { return statSync(filePath).size; } catch { return 0; }
      },
    };
  }

  // ── Bun.gc ────────────────────────────────────────────────────────────
  // Node.js 的 V8 GC 是自动的，无需手动触发；暴露为 no-op
  function gc() {}

  // ── Bun.generateHeapSnapshot ──────────────────────────────────────────
  // Node.js 用 v8.getHeapSnapshot() 替代
  function generateHeapSnapshot() {
    const v8 = require("v8");
    const stream = v8.getHeapSnapshot();
    const chunks = [];
    for (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks).toString("utf-8");
  }

  // ── Bun.embeddedFiles ─────────────────────────────────────────────────
  // npm 包中不存在嵌入文件
  const embeddedFiles = [];

  // ── Bun.semver ────────────────────────────────────────────────────────
  // Bun 内置 semver 比较，产物中通过 typeof Bun 守卫调用
  // 用 semver 包的子集实现 order 和 satisfies
  // semver.order(a, b): 1 if a>b, 0 if a==b, -1 if a<b
  const semver = {
    order(a, b) {
      const pa = parseSemver(a);
      const pb = parseSemver(b);
      if (!pa || !pb) return 0;
      const cmp = pa[0] - pb[0] || pa[1] - pb[1] || pa[2] - pb[2];
      return cmp > 0 ? 1 : cmp < 0 ? -1 : 0;
    },
    satisfies(version, range) {
      // 简化的 range 解析：支持 >=x.y.z, ^x.y.z, ~x.y.z, x.y.z, >x.y.z, <x.y.z, <=x.y.z, x.y.z - a.b.c
      const pv = parseSemver(version);
      if (!pv) return false;
      const r = range.trim();
      // 范围用 || 分隔
      const ors = r.split("||").map(s => s.trim());
      for (const part of ors) {
        if (satisfiesRange(pv, part)) return true;
      }
      return false;
    },
  };

  // 解析 x.y.z 为 [major, minor, patch]，忽略 pre-release
  function parseSemver(v) {
    if (!v) return null;
    const m = String(v).match(/(\\d+)\\.(\\d+)\\.(\\d+)/);
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
  }

  function satisfiesRange(pv, range) {
    // 空范围或 * 匹配所有
    if (!range || range === "*") return true;
    // 空格分隔的 AND 条件
    const conditions = range.split(/\\s+/).filter(Boolean);
    for (const cond of conditions) {
      if (!satisfiesCondition(pv, cond)) return false;
    }
    return true;
  }

  function satisfiesCondition(pv, cond) {
    if (cond === "*") return true;
    // ^x.y.z — 兼容 major
    let m = cond.match(/^\\^(\\d+)\\.(\\d+)\\.(\\d+)/);
    if (m) {
      const [_, M, m2, p] = m.map(Number);
      return pv[0] === M && (pv[0] > 0 ? pv[1] >= m2 || (pv[1] === m2 && pv[2] >= p) : pv[1] === m2 && pv[2] >= p) || pv[0] === M && pv[1] > m2;
    }
    // ~x.y.z — 兼容 major.minor
    m = cond.match(/^~(>?=?(\\d+)\\.(\\d+)\\.(\\d+))/);
    if (m) {
      const raw = m[1];
      const cm = raw.match(/(\\d+)\\.(\\d+)\\.(\\d+)/);
      if (cm) {
        const [_, M, m2] = cm.map(Number);
        return pv[0] === M && pv[1] === m2 && pv[2] >= Number(cm[3]);
      }
    }
    // ~x.y
    m = cond.match(/^~(\\d+)\\.(\\d+)/);
    if (m) {
      const [_, M, m2] = m.map(Number);
      return pv[0] === M && pv[1] === m2;
    }
    // >=x.y.z
    m = cond.match(/^>=(\\d+)\\.(\\d+)\\.(\\d+)/);
    if (m) {
      const [_, M, m2, p] = m.map(Number);
      return pv[0] > M || (pv[0] === M && pv[1] > m2) || (pv[0] === M && pv[1] === m2 && pv[2] >= p);
    }
    // >x.y.z
    m = cond.match(/^>(\\d+)\\.(\\d+)\\.(\\d+)/);
    if (m) {
      const [_, M, m2, p] = m.map(Number);
      return pv[0] > M || (pv[0] === M && pv[1] > m2) || (pv[0] === M && pv[1] === m2 && pv[2] > p);
    }
    // <=x.y.z
    m = cond.match(/^<=(\\d+)\\.(\\d+)\\.(\\d+)/);
    if (m) {
      const [_, M, m2, p] = m.map(Number);
      return pv[0] < M || (pv[0] === M && pv[1] < m2) || (pv[0] === M && pv[1] === m2 && pv[2] <= p);
    }
    // <x.y.z
    m = cond.match(/^<(\\d+)\\.(\\d+)\\.(\\d+)/);
    if (m) {
      const [_, M, m2, p] = m.map(Number);
      return pv[0] < M || (pv[0] === M && pv[1] < m2) || (pv[0] === M && pv[1] === m2 && pv[2] < p);
    }
    // 精确匹配 x.y.z
    m = cond.match(/^(\\d+)\\.(\\d+)\\.(\\d+)$/);
    if (m) {
      const [_, M, m2, p] = m.map(Number);
      return pv[0] === M && pv[1] === m2 && pv[2] === p;
    }
    // x.y.z - a.b.c 范围
    m = cond.match(/^(\\d+\\.\\d+\\.\\d+)\\s*-\\s*(\\d+\\.\\d+\\.\\d+)$/);
    if (m) {
      const lo = parseSemver(m[1]);
      const hi = parseSemver(m[2]);
      if (!lo || !hi) return false;
      const ordLo = semver.order([pv[0], pv[1], pv[2]].join("."), lo.join(".")) >= 0;
      const ordHi = semver.order([pv[0], pv[1], pv[2]].join("."), hi.join(".")) <= 0;
      return ordLo && ordHi;
    }
    // 无法识别，宽松通过
    return true;
  }

  // ── Bun.YAML ──────────────────────────────────────────────────────────
  // Bun 内置 YAML 解析器，产物中通过 typeof Bun 守卫调用
  // 降级到 yaml 包（已作为依赖存在）
  const YAML = {
    parse(input) {
      try {
        const yaml = require("yaml");
        return yaml.parse(input);
      } catch {
        throw new Error("Bun.YAML polyfill: 'yaml' package not available. Install it or use Bun runtime.");
      }
    },
  };

  // ── Bun.version ───────────────────────────────────────────────────────
  // Bun 运行时版本字符串，用于 typeof 检测
  const version = "1.2.0-polyfill";

  // ── Bun.stringWidth ───────────────────────────────────────────────────
  // 东亚宽度感知的字符串显示宽度，产物中有 typeof 守卫降级
  // 提供基础实现，按 CJK 字符双宽计算
  function stringWidth(str) {
    let w = 0;
    for (const ch of str) {
      const code = ch.codePointAt(0);
      if (code >= 0x1100 && (
        code <= 0x115F ||
        code === 0x2329 || code === 0x232A ||
        (code >= 0x2E80 && code <= 0xA4CF && code !== 0x303F) ||
        (code >= 0xAC00 && code <= 0xD7A3) ||
        (code >= 0xF900 && code <= 0xFAFF) ||
        (code >= 0xFE10 && code <= 0xFE19) ||
        (code >= 0xFE30 && code <= 0xFE6F) ||
        (code >= 0xFF01 && code <= 0xFF60) ||
        (code >= 0xFFE0 && code <= 0xFFE6) ||
        (code >= 0x1F300 && code <= 0x1F9FF) ||
        (code >= 0x20000 && code <= 0x2FFFD) ||
        (code >= 0x30000 && code <= 0x3FFFD)
      )) {
        w += 2;
      } else if (code >= 0x20) {
        w += 1;
      }
    }
    return w;
  }

  // ── Bun.wrapAnsi ──────────────────────────────────────────────────────
  // ANSI 转义序列感知的自动换行，产物中有 typeof 守卫降级到 null
  // 提供 stub 即可
  const wrapAnsi = null;

  // ── Bun.listen ────────────────────────────────────────────────────────
  // Daemon 模式专用 TCP 监听，feature-gated (DAEMON)
  // Node.js 中用 net.Server 替代
  function listen(opts) {
    const net = require("net");
    const server = net.createServer((socket) => {
      if (opts.socket && opts.socket.data) {
        socket.data = { ...opts.socket.data() };
      }
      if (opts.socket && opts.socket.open) {
        opts.socket.open(socket);
      }
      socket.on("data", (data) => {
        if (opts.socket && opts.socket.data) {
          opts.socket.data(socket, data);
        }
      });
      socket.on("close", () => {
        if (opts.socket && opts.socket.close) {
          opts.socket.close(socket);
        }
      });
      socket.on("error", () => {});
    });
    server.listen(opts.port || 0, opts.hostname || "0.0.0.0", () => {
      const addr = server.address();
      server.port = addr.port;
    });
    return server;
  }

  globalThis.Bun = {
    which,
    $,
    hash,
    spawn,
    spawnSync,
    file: bunFile,
    gc,
    generateHeapSnapshot,
    embeddedFiles,
    semver,
    YAML,
    version,
    stringWidth,
    wrapAnsi,
    listen,
  };
}
import "./cli.js"
`
await writeFile(cliNode, NODE_BUN_POLYFILL)
// NOTE: when new Bun-specific globals appear in bundled output, add them here.

// Make both executable
const { chmodSync } = await import('fs')
chmodSync(cliBun, 0o755)
chmodSync(cliNode, 0o755)

console.log(`Generated ${cliBun} (shebang: bun) and ${cliNode} (shebang: node)`)
