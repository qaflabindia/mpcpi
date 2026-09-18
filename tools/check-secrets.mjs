/**
 * check-secrets.mjs — refuse to package anything that carries a credential.
 *
 * Runs over extension/ (what actually ships) and, in --all mode, the whole repo.
 * Two checks: filenames that look like secret stores, and file CONTENTS matching
 * known key shapes. The second matters more — a key pasted into a source comment
 * or a sample workbook would otherwise ship.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = process.cwd();
const SCAN = process.argv.includes('--all') ? ROOT : join(ROOT, 'extension');
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor']);

const NAME_PATTERNS = [/^keys?\..*/i, /\.env(\..*)?$/i, /\.pem$/i, /\.key$/i, /credentials/i, /\.secret$/i];

// Known credential shapes. Kept narrow enough to avoid firing on prose.
const CONTENT_PATTERNS = [
  ['Anthropic key', /sk-ant-[A-Za-z0-9_-]{24,}/],
  ['OpenAI key', /sk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['Google API key', /AIza[A-Za-z0-9_-]{30,}/],
  ['Google OAuth token', /\bAQ\.[A-Za-z0-9_-]{30,}/],
  ['Hugging Face token', /\bhf_[A-Za-z0-9]{30,}/],
  ['Groq key', /\bgsk_[A-Za-z0-9]{40,}/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
];

const findings = [];

function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const name of entries) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) { if (!SKIP_DIRS.has(name)) walk(p); continue; }
    const rel = relative(ROOT, p);

    if (NAME_PATTERNS.some((re) => re.test(basename(p)))) {
      findings.push({ rel, why: 'filename looks like a credential store' });
      continue;
    }
    if (st.size > 4_000_000) continue;
    let text;
    try { text = readFileSync(p, 'utf8'); } catch { continue; }
    for (const [label, re] of CONTENT_PATTERNS) {
      const m = re.exec(text);
      if (!m) continue;
      const line = text.slice(0, m.index).split('\n').length;
      findings.push({ rel, why: `${label} found at line ${line}` });
      break;
    }
  }
}

walk(SCAN);

const scope = relative(ROOT, SCAN) || '.';
if (findings.length) {
  console.error(`\nSECRETS FOUND in ${scope}/ — refusing to package:\n`);
  for (const f of findings) console.error(`  ${f.rel}\n      ${f.why}`);
  console.error('\nRemove them, or move them outside extension/. Never inline a key into source.\n');
  process.exit(1);
}
console.log(`no credentials found in ${scope}/ (${SCAN === ROOT ? 'whole repo' : 'shipped files'})`);
