// Builds dist/zoho-mail-checker-<version>.zip for the Chrome Web Store.
// - Only runtime files (no tests, design, store material or docs other than LICENSE/PRIVACY).
// - Files known to git (tracked or not ignored); a release build also requires a clean tree.
// - Drops the manifest "key": it only pins the extension ID for unpacked development builds;
//   the Web Store assigns its own ID and does not accept the field.
// Usage: npm run pack
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INCLUDE = [/^manifest\.json$/, /^service_worker\.js$/, /^(LICENSE|PRIVACY\.md)$/,
  /^_locales\//, /^background\//, /^icons\//, /^lib\//, /^offscreen\//, /^options\//, /^popup\//];

const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim();
if (dirty && !process.argv.includes('--allow-dirty')) {
  console.error('Uncommitted changes: commit first (or pass --allow-dirty for a test build).\n' + dirty);
  process.exit(1);
}

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => INCLUDE.some((re) => re.test(f))).sort();

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
delete manifest.key;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.version !== manifest.version) throw new Error(`version mismatch: package ${pkg.version} vs manifest ${manifest.version}`);

/* ---------- minimal ZIP writer (deflate, no external dependency) ---------- */
const local = [];
const central = [];
let offset = 0;
const dosTime = 0x0000; // 00:00:00
const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1; // fixed date: reproducible archives

for (const f of files) {
  const data = f === 'manifest.json'
    ? Buffer.from(JSON.stringify(manifest, null, 2) + '\n')
    : fs.readFileSync(path.join(root, f));
  const deflated = zlib.deflateRawSync(data, { level: 9 });
  const crc = zlib.crc32(data);
  const name = Buffer.from(f);

  const lh = Buffer.alloc(30);
  lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(8, 8);
  lh.writeUInt16LE(dosTime, 10); lh.writeUInt16LE(dosDate, 12); lh.writeUInt32LE(crc, 14);
  lh.writeUInt32LE(deflated.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26);
  local.push(lh, name, deflated);

  const ch = Buffer.alloc(46);
  ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8);
  ch.writeUInt16LE(8, 10); ch.writeUInt16LE(dosTime, 12); ch.writeUInt16LE(dosDate, 14); ch.writeUInt32LE(crc, 16);
  ch.writeUInt32LE(deflated.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28);
  ch.writeUInt32LE(offset, 42);
  central.push(ch, name);
  offset += lh.length + name.length + deflated.length;
}
const cd = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const out = path.join(root, 'dist', `zoho-mail-checker-${manifest.version}.zip`);
fs.writeFileSync(out, Buffer.concat([...local, cd, end]));
console.log(`${path.relative(root, out)}: ${files.length} files, ${(fs.statSync(out).size / 1024).toFixed(1)} KB, manifest key removed`);
