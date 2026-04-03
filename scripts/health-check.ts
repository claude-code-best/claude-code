#!/usr/bin/env bun
/**
 * Code health check script
 *
 * Aggregates project metrics across multiple dimensions and outputs a health report:
 * - Code size (file count, lines of code)
 * - Lint issues (Biome)
 * - Test results (Bun test)
 * - Dead code (Knip)
 * - Build status
 */

import { $ } from "bun";

const DIVIDER = "\u2500".repeat(60);

interface Metric {
	label: string;
	value: string | number;
	status: "ok" | "warn" | "error" | "info";
}

const metrics: Metric[] = [];

function add(label: string, value: string | number, status: Metric["status"] = "info") {
	metrics.push({ label, value, status });
}

function icon(status: Metric["status"]): string {
	switch (status) {
		case "ok":
			return "[OK]";
		case "warn":
			return "[!!]";
		case "error":
			return "[XX]";
		case "info":
			return "[--]";
	}
}

// ---------------------------------------------------------------------------
// 1. Code Size
// ---------------------------------------------------------------------------
async function checkCodeSize() {
	const tsFiles = await $`find src -name '*.ts' -o -name '*.tsx' | grep -v node_modules`.text();
	const fileCount = tsFiles.trim().split("\n").filter(Boolean).length;
	add("TypeScript files", fileCount, "info");

	const loc = await $`find src -name '*.ts' -o -name '*.tsx' | grep -v node_modules | xargs wc -l | tail -1`.text();
	const totalLines = loc.trim().split(/\s+/)[0] ?? "?";
	add("Total LOC (src/)", totalLines, "info");
}

// ---------------------------------------------------------------------------
// 2. Lint Check
// ---------------------------------------------------------------------------
async function checkLint() {
	try {
		const result = await $`bunx biome check src/ 2>&1`.quiet().nothrow().text();
		const errorMatch = result.match(/Found (\d+) errors?/);
		const warnMatch = result.match(/Found (\d+) warnings?/);
		const errors = errorMatch ? Number.parseInt(errorMatch[1]) : 0;
		const warnings = warnMatch ? Number.parseInt(warnMatch[1]) : 0;
		add("Lint errors", errors, errors === 0 ? "ok" : errors < 100 ? "warn" : "info");
		add("Lint warnings", warnings, warnings === 0 ? "ok" : "info");
	} catch {
		add("Lint check", "execution failed", "error");
	}
}

// ---------------------------------------------------------------------------
// 3. Tests
// ---------------------------------------------------------------------------
async function checkTests() {
	try {
		const result = await $`bun test 2>&1`.quiet().nothrow().text();
		const passMatch = result.match(/(\d+) pass/);
		const failMatch = result.match(/(\d+) fail/);
		const pass = passMatch ? Number.parseInt(passMatch[1]) : 0;
		const fail = failMatch ? Number.parseInt(failMatch[1]) : 0;
		add("Tests passed", pass, pass > 0 ? "ok" : "warn");
		add("Tests failed", fail, fail === 0 ? "ok" : "error");
	} catch {
		add("Tests", "execution failed", "error");
	}
}

// ---------------------------------------------------------------------------
// 4. Dead Code
// ---------------------------------------------------------------------------
async function checkUnused() {
	try {
		const result = await $`bunx knip-bun 2>&1`.quiet().nothrow().text();
		const unusedFiles = result.match(/Unused files \((\d+)\)/);
		const unusedExports = result.match(/Unused exports \((\d+)\)/);
		const unusedDeps = result.match(/Unused dependencies \((\d+)\)/);
		add("Unused files", unusedFiles?.[1] ?? "0", "info");
		add("Unused exports", unusedExports?.[1] ?? "0", "info");
		add("Unused deps", unusedDeps?.[1] ?? "0", unusedDeps && Number(unusedDeps[1]) > 0 ? "warn" : "ok");
	} catch {
		add("Dead code check", "execution failed", "error");
	}
}

// ---------------------------------------------------------------------------
// 5. Build
// ---------------------------------------------------------------------------
async function checkBuild() {
	try {
		const result = await $`bun run build 2>&1`.quiet().nothrow();
		if (result.exitCode === 0) {
			// Get artifact size
			const stat = Bun.file("dist/cli.js");
			const mb = (stat.size / 1024 / 1024).toFixed(1);
			const size = `${mb} MB`;
			add("Build status", "success", "ok");
			add("Artifact size (dist/cli.js)", size, "info");
		} else {
			add("Build status", "failed", "error");
		}
	} catch {
		add("Build", "execution failed", "error");
	}
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log("");
console.log(DIVIDER);
console.log("  Code Health Check Report");
console.log(`  ${new Date().toISOString()}`);
console.log(DIVIDER);

await checkCodeSize();
await checkLint();
await checkTests();
await checkUnused();
await checkBuild();

console.log("");
for (const m of metrics) {
	const tag = icon(m.status);
	console.log(`  ${tag}  ${m.label.padEnd(20)} ${m.value}`);
}

const errorCount = metrics.filter((m) => m.status === "error").length;
const warnCount = metrics.filter((m) => m.status === "warn").length;

console.log("");
console.log(DIVIDER);
if (errorCount > 0) {
	console.log(`  Result: ${errorCount} error(s), ${warnCount} warning(s)`);
} else if (warnCount > 0) {
	console.log(`  Result: No errors, ${warnCount} warning(s)`);
} else {
	console.log("  Result: All passed");
}
console.log(DIVIDER);
console.log("");

process.exit(errorCount > 0 ? 1 : 0);
