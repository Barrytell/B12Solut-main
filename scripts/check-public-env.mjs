#!/usr/bin/env node
// Runs before `vite build`: every VITE_ variable ends up in the public bundle,
// so refuse any that looks like a secret (Vercel env, CI env and .env files alike).
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = resolve(import.meta.dirname, '..');
const SECRET_NAME = /SECRET|SERVICE|PASSWORD|PRIVATE|ACCESS_TOKEN|DATABASE/i;
const SECRET_VALUE = [
  /^sb_secret_/, /sk-ant-/, /\bre_[A-Za-z0-9]{8,}_/, /^GOCSPX-/, /postgres(ql)?:\/\//,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

function jwtRole(value) {
  const parts = value.split('.');
  if (parts.length !== 3 || !value.startsWith('eyJ')) return null;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString()).role ?? null; } catch { return null; }
}

/** Returns a problem string per offending variable. */
export function checkPublicEnv(vars) {
  const problems = [];
  for (const [name, raw] of Object.entries(vars)) {
    if (!name.startsWith('VITE_')) continue;
    const value = String(raw ?? '').trim();
    if (SECRET_NAME.test(name)) problems.push(`${name}: name suggests a secret; secrets must not use the VITE_ prefix`);
    else if (SECRET_VALUE.some((re) => re.test(value))) problems.push(`${name}: value looks like a secret key or credential`);
    else if (jwtRole(value) === 'service_role') problems.push(`${name}: value is a service_role key`);
  }
  return problems;
}

// Same files Vite reads for `vite build` (mode production).
function readEnvFiles() {
  const vars = {};
  for (const f of ['.env', '.env.local', '.env.production', '.env.production.local']) {
    const p = join(ROOT, f);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (m) vars[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return vars;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkPublicEnv({ ...readEnvFiles(), ...process.env });
  if (problems.length) {
    console.error('Public env check FAILED (VITE_ variables are visible to every browser):');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log('Public env check passed.');
}
