// Brings old Base44 shift-report PDFs into the private shift-reports bucket and
// links them to their shift (checklist A3). Nothing is ever invented: files that
// cannot be matched or retrieved are listed for your decision.
//
//   node scripts/migrate-reports.js --target=staging --expect-ref=<id> \
//     [--dir=<folder of PDFs>] [--urls=<text file, one URL per line>] [--map=<map.json>] [--commit]
//
// Matching: the original name is shift-report-{shift_id}.pdf (src/utils/shiftReport.js).
// Files Base44 renamed can be matched by hand in --map: { "<file name or URL>": "<shift_id>" }.
// A shift that already has a report keeps it (never overwritten).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { guardOrExit, parseFlags } from './lib/target-guard.js';
import { connect } from './lib/db.js';

const MAX_BYTES = 10 * 1024 * 1024;
const { target, commit } = await guardOrExit();
const flags = parseFlags(process.argv.slice(2));
const map = typeof flags.map === 'string' ? JSON.parse(readFileSync(resolve(flags.map), 'utf8')) : {};
const bucket = process.env.STORAGE_SHIFT_REPORTS_BUCKET || 'shift-reports';

const shiftIdFromName =(name) => /shift-report-([A-Za-z0-9_-]+)\.pdf$/i.exec(name)?.[1] ?? null;

const sources = [];
if (typeof flags.dir === 'string') {
  const dir = resolve(flags.dir);
  for (const f of readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.pdf'))) sources.push({ name: f, load: async () => readFileSync(join(dir, f)) });
}
if (typeof flags.urls === 'string' && existsSync(resolve(flags.urls))) {
  for (const url of readFileSync(resolve(flags.urls), 'utf8').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    sources.push({
      name: url,
      load: async () => {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return Buffer.from(await res.arrayBuffer());
      },
    });
  }
}
if (!sources.length) { console.error('Give --dir=<folder of PDFs> and/or --urls=<file of URLs>'); process.exit(1); }

const db = await connect();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const linked = []; const unmatched = []; const failed = []; const kept = [];
try {
  for (const src of sources) {
    const shiftId = map[src.name] ?? map[basename(src.name)] ?? shiftIdFromName(basename(new URL(src.name, 'file:///').pathname));
    if (!shiftId) { unmatched.push(src.name); continue; }
    const shift = (await db.query('SELECT id, report_path FROM public.shifts WHERE id = $1', [shiftId])).rows[0];
    if (!shift) { unmatched.push(`${src.name} (shift ${shiftId} not in database)`); continue; }
    if (shift.report_path) { kept.push(`${src.name} -> shift ${shiftId} already has ${shift.report_path}`); continue; }
    try {
      const body = await src.load();
      if (body.length > MAX_BYTES) throw new Error(`${body.length} bytes > 10 MB`);
      if (body.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('not a PDF');
      const path = `${shiftId}/migrated.pdf`;
      if (commit) {
        const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: 'application/pdf', upsert: false });
        if (error) throw new Error(`upload: ${error.message}`);
        await db.query('UPDATE public.shifts SET report_path = $2 WHERE id = $1 AND report_path IS NULL', [shiftId, path]);
      }
      linked.push(`${src.name} -> ${path}`);
    } catch (err) {
      failed.push(`${src.name}: ${err.message}`);
    }
  }
} finally {
  await db.end();
}

console.log(`[reports] ${target} ${commit ? 'COMMIT' : 'dry-run'}: ${linked.length} ${commit ? 'linked' : 'would link'}, ${kept.length} kept existing, ${unmatched.length} unmatched, ${failed.length} failed`);
for (const s of unmatched) console.log(`  - UNMATCHED (add to --map if you know the shift): ${s}`);
for (const s of failed) console.log(`  - FAILED: ${s}`);
for (const s of kept) console.log(`  - kept: ${s}`);
if (failed.length || unmatched.length) process.exitCode = 1;
