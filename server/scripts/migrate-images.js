// Copies product photos hosted by Base44 into the product-images bucket and
// rewrites products.image_url. URLs on other sites are left untouched.
//
//   node scripts/migrate-images.js --target=staging --expect-ref=<id> --hosts=<host1,host2> [--commit]
//
// Each file is downloaded, size-checked (<= 5 MB) and content-sniffed (PNG, JPEG,
// WebP, GIF only, never SVG) before upload. Failures are listed, never invented.
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { guardOrExit, parseFlags } from './lib/target-guard.js';
import { connect } from './lib/db.js';
import { sniffImage, MAX_IMAGE_BYTES } from '../src/routes/uploads.js';

const { target, commit } = await guardOrExit();
const flags = parseFlags(process.argv.slice(2));
// The storage hosts Base44 used must be read from your export and listed explicitly.
if (typeof flags.hosts !== 'string') { console.error('--hosts=<comma-separated Base44 image hosts, from the export> is required'); process.exit(1); }
const hosts = flags.hosts.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
const bucket = process.env.STORAGE_PRODUCT_IMAGES_BUCKET || 'product-images';
const isBase44 = (u) => {
  try {
    const url = new URL(u);
    const h = url.hostname.toLowerCase();
    return url.protocol === 'https:' && hosts.some((x) => h === x || h.endsWith(`.${x}`));
  } catch { return false; }
};

const db = await connect();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const done = []; const failed = []; const skipped = [];
try {
  const { rows } = await db.query("SELECT id, name, image_url FROM public.products WHERE image_url IS NOT NULL AND image_url <> '' ORDER BY id");
  for (const p of rows) {
    if (!isBase44(p.image_url)) { skipped.push(p.id); continue; }
    try {
      const res = await fetch(p.image_url, { redirect: 'follow', signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = Buffer.from(await res.arrayBuffer());
      if (body.length > MAX_IMAGE_BYTES) throw new Error(`${body.length} bytes > 5 MB`);
      const kind = sniffImage(body);
      if (!kind) throw new Error('not a PNG/JPEG/WebP/GIF image');
      const path = `${p.id}/${createHash('sha1').update(body).digest('hex')}.${kind.ext}`;
      if (commit) {
        const { error } = await supabase.storage.from(bucket).upload(path, body, { contentType: kind.mime, upsert: true });
        if (error) throw new Error(`upload: ${error.message}`);
        const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        // only rewrite if nobody changed the URL meanwhile
        await db.query('UPDATE public.products SET image_url = $2 WHERE id = $1 AND image_url = $3', [p.id, url, p.image_url]);
      }
      done.push({ id: p.id, name: p.name, path });
    } catch (err) {
      failed.push({ id: p.id, name: p.name, url: p.image_url, reason: err.message });
    }
  }
} finally {
  await db.end();
}

console.log(`[images] ${target} ${commit ? 'COMMIT' : 'dry-run'}: ${done.length} ${commit ? 'migrated' : 'would migrate'}, ${skipped.length} not on Base44 (left as is), ${failed.length} failed`);
for (const f of failed) console.log(`  - FAILED ${f.name} (${f.id}): ${f.reason} — ${f.url}`);
if (failed.length) process.exitCode = 1;
