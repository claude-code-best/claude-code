#!/usr/bin/env node
/**
 * postinstall patch: fixes net.BlockList.addAddress() which is not implemented
 * in Bun v1.2.x, causing a crash at module load time in sandbox-runtime.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(ROOT, 'node_modules/@anthropic-ai/sandbox-runtime/dist/sandbox/parent-proxy.js');

if (!existsSync(target)) process.exit(0);

const original = readFileSync(target, 'utf-8');
const patched = original
  .replace(/\bbl\.addSubnet\b(?!\?)/g, 'bl.addSubnet?.')
  .replace(/\bbl\.addAddress\b(?!\?)/g, 'bl.addAddress?.');

if (patched !== original) {
  writeFileSync(target, patched);
  console.log('postinstall: patched @anthropic-ai/sandbox-runtime');
}
