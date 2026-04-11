#!/usr/bin/env bun
/**
 * 代码健康度检查脚本
 *
 * 汇总项目各维度指标，输出健康度报告：
 * - 代码规模（文件数、代码行数）
 * - Lint 问题数（Biome）
 * - 测试结果（Bun test）
 * - 冗余代码（Knip）
 * - 构建状态
 */

import { $ } from "bun";

const DIVIDER = "─".repeat(60);

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
// 1. 代码规模
// ---------------------------------------------------------------------------
async function checkCodeSize() {
	const tsFiles = await $`find src -name '*.ts' -o -name '*.tsx' | grep -v node_modules`.text();
	const fileCount = tsFiles.trim().split("\n").filter(Boolean).length;
	add("TypeScript 文件数", fileCount, "info");

	const loc = await $`find src -name '*.ts' -o -name '*.tsx' | grep -v node_modules | xargs wc -l | tail -1`.text();
	const totalLines = loc.trim().split(/\s+/)[0] ?? "?";
	add("总代码行数 (src/)", totalLines, "info");
}

// ---------------------------------------------------------------------------
// 2. Lint 检查
// ---------------------------------------------------------------------------
async function checkLint() {
	try {
		// Use 'bunx' which resolves to bunx.exe on Windows
		const result = await $`bunx biome check src/ 2>&1`.quiet().nothrow().text();
		const errorMatch = result.match(/Found (\d+) errors?/);
		const warnMatch = result.match(/Found (\d+) warnings?/);
		const errors = errorMatch ? Number.parseInt(errorMatch[1]) : 0;
		const warnings = warnMatch ? Number.parseInt(warnMatch[1]) : 0;
		add("Lint 错误", errors, errors === 0 ? "ok" : errors < 100 ? "warn" : "info");
		add("Lint 警告", warnings, warnings === 0 ? "ok" : "info");
	} catch {
		add("Lint 检查", "执行失败", "error");
	}
}

// ---------------------------------------------------------------------------
// 3. 测试
// ---------------------------------------------------------------------------
async function checkTests() {
	try {
		// Use 'bun test' which resolves correctly on Windows
		const result = await $`bun test 2>&1`.quiet().nothrow().text();
		const passMatch = result.match(/(\d+) pass/);
		const failMatch = result.match(/(\d+) fail/);
		const pass = passMatch ? Number.parseInt(passMatch[1]) : 0;
		const fail = failMatch ? Number.parseInt(failMatch[1]) : 0;
		add("测试通过", pass, pass > 0 ? "ok" : "warn");
		add("测试失败", fail, fail === 0 ? "ok" : "error");
	} catch {
		add("测试", "执行失败", "error");
	}
}

// ---------------------------------------------------------------------------
// 4. 冗余代码
// ---------------------------------------------------------------------------
async function checkUnused() {
	try {
		// Use 'bunx knip-bun' which resolves correctly on Windows
		const result = await $`bunx knip-bun 2>&1`.quiet().nothrow().text();
		const unusedFiles = result.match(/Unused files \((\d+)\)/);
		const unusedExports = result.match(/Unused exports \((\d+)\)/);
		const unusedDeps = result.match(/Unused dependencies \((\d+)\)/);
		add("未使用文件", unusedFiles?.[1] ?? "0", "info");
		add("未使用导出", unusedExports?.[1] ?? "0", "info");
		add("未使用依赖", unusedDeps?.[1] ?? "0", unusedDeps && Number(unusedDeps[1]) > 0 ? "warn" : "ok");
	} catch {
		add("冗余代码检查", "执行失败", "error");
	}
}

// ---------------------------------------------------------------------------
// 5. 构建
// ---------------------------------------------------------------------------
async function checkBuild() {
	try {
		// Use 'bun run build' which resolves correctly on Windows
		const result = await $`bun run build 2>&1`.quiet().nothrow();
		if (result.exitCode === 0) {
			// 获取产物大小
			const stat = Bun.file("dist/cli.js");
			const mb = (stat.size / 1024 / 1024).toFixed(1);
			const size = `${mb} MB`;
			add("构建状态", "成功", "ok");
			add("产物大小 (dist/cli.js)", size, "info");
		} else {
			add("构建状态", "失败", "error");
		}
	} catch {
		add("构建", "执行失败", "error");
	}
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
console.log("");
console.log(DIVIDER);
console.log("  代码健康度检查报告");
console.log(`  ${new Date().toLocaleString("zh-CN")}`);
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
	console.log(`  结果: ${errorCount} 个错误, ${warnCount} 个警告`);
} else if (warnCount > 0) {
	console.log(`  结果: 无错误, ${warnCount} 个警告`);
} else {
	console.log("  结果: 全部通过");
}
console.log(DIVIDER);
console.log("");

process.exit(errorCount > 0 ? 1 : 0);
