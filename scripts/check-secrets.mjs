#!/usr/bin/env node
// Blocks commits/pushes that contain credentials. No dependencies.
//   node scripts/check-secrets.mjs --staged    (pre-commit hook)
//   node scripts/check-secrets.mjs --history   (before the first push)
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const PATTERNS = [
  ['Anthropic API key', /sk-ant-[A-Za-z0-9_-]{20,}/],
  ['Supabase secret key', /sb_secret_[A-Za-z0-9_-]{10,}/],
  ['Resend API key', /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9_]{8,}/],
  ['Google OAuth client secret', /GOCSPX-[A-Za-z0-9_-]{10,}/],
  ['JSON Web Token', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ['Private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  // Postgres URL with an inline password that is not a YOUR_ placeholder
  ['Database URL with password', /postgres(?:ql)?:\/\/[^:\s/'"]+:(?!YOUR_)[^@\s'"]{3,}@/],
];

// .env files except the committed placeholder templates
export const isForbiddenFile = (path) =>
  /(^|\/)\.env(\.|$)/.test(path) && !/(^|\/)\.env\.example$/.test(path);

export function findSecrets(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, i) => {
    for (const [name, re] of PATTERNS) if (re.test(line)) hits.push({ name, line: i + 1 });
  });
  return hits;
}

const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 28 });

function scanStaged() {
  const problems = [];
  const files = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean);
  for (const file of files) {
    if (isForbiddenFile(file)) { problems.push(`${file}: .env files must never be committed`); continue; }
    let content;
    try { content = git('show', `:${file}`); } catch { continue; }
    if (content.includes('\0')) continue; // binary
    for (const h of findSecrets(content)) problems.push(`${file}:${h.line}: ${h.name}`);
  }
  return problems;
}

function scanHistory() {
  const problems = [];
  for (const file of git('log', '--all', '--name-only', '--format=').split('\n').filter(Boolean)) {
    if (isForbiddenFile(file)) problems.push(`${file}: .env file in history`);
  }
  // Only added lines, so a secret removed later is still reported.
  let commit = '';
  for (const line of git('log', '--all', '-p', '--no-color', '--format=@@commit %H').split('\n')) {
    if (line.startsWith('@@commit ')) { commit = line.slice(9, 17); continue; }
    if (!line.startsWith('+') || line.startsWith('+++')) continue;
    for (const h of findSecrets(line.slice(1))) problems.push(`commit ${commit}: ${h.name}`);
  }
  return [...new Set(problems)];
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = process.argv[2];
  if (mode !== '--staged' && mode !== '--history') {
    console.error('usage: check-secrets.mjs --staged | --history');
    process.exit(2);
  }
  const problems = mode === '--staged' ? scanStaged() : scanHistory();
  if (problems.length) {
    console.error('Secret scan FAILED. Remove these before committing/pushing:');
    for (const p of problems) console.error('  - ' + p);
    process.exit(1);
  }
  console.log(`Secret scan passed (${mode.slice(2)}).`);
}
