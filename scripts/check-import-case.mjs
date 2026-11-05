#!/usr/bin/env node
// Fails when an import's letter case differs from the file on disk.
// Windows/macOS resolve such imports; Linux (Vercel, Railway, CI) does not.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const SRC = join(ROOT, 'src');
const EXTS = ['', '.js', '.jsx', '.ts', '.tsx', '.mjs', '.json', '.css'];
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;

const listing = new Map();
const entries = (dir) => {
  if (!listing.has(dir)) listing.set(dir, readdirSync(dir));
  return listing.get(dir);
};

// True when every path segment exists with exactly this case.
function existsExact(abs) {
  const parts = relative(ROOT, abs).split(sep);
  let dir = ROOT;
  for (const part of parts) {
    if (!entries(dir).includes(part)) return false;
    dir = join(dir, part);
  }
  return true;
}

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };

function check(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) base = join(SRC, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec);
  else return null; // package import
  const candidates = [
    ...EXTS.map((e) => base + e),
    ...EXTS.slice(1).map((e) => join(base, 'index' + e)),
  ];
  const found = candidates.find(isFile);
  if (!found) return `cannot resolve '${spec}'`;
  return existsExact(found) ? null : `'${spec}' differs in letter case from the file on disk`;
}

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(jsx?|tsx?|mjs)$/.test(name)) yield p;
  }
}

const problems = [];
for (const file of walk(SRC)) {
  for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
    const err = check(m[1] || m[2] || m[3], file);
    if (err) problems.push(`${relative(ROOT, file)}: ${err}`);
  }
}

if (problems.length) {
  console.error('Import check FAILED:\n' + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log('Import case check passed.');
