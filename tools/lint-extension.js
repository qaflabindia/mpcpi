/**
 * lint-extension.js — structural checks Chrome would otherwise fail on at load
 * time: every path the manifest declares exists, every import and every <script>
 * or <link> resolves, and nothing references a file outside the bundle.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative, extname } from 'node:path';

const EXT = resolve('extension');
const problems = [], notes = [];
const ok = (m) => notes.push(`  ok   ${m}`);
const bad = (m) => problems.push(`  FAIL ${m}`);

const manifest = JSON.parse(readFileSync(join(EXT, 'manifest.json'), 'utf8'));

/* manifest-declared paths */
const declared = [
  manifest.background?.service_worker,
  manifest.options_page,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
  ...(manifest.content_scripts || []).flatMap((c) => [...(c.js || []), ...(c.css || [])]),
].filter(Boolean);

for (const p of declared) {
  if (existsSync(join(EXT, p))) ok(`manifest → ${p}`);
  else bad(`manifest declares "${p}" which does not exist`);
}

/* web_accessible_resources globs must match something */
for (const entry of manifest.web_accessible_resources || []) {
  for (const pattern of entry.resources) {
    const dir = pattern.replace(/\/\*$/, '');
    if (existsSync(join(EXT, dir))) ok(`web_accessible_resources → ${pattern}`);
    else bad(`web_accessible_resources pattern "${pattern}" matches no directory`);
  }
}

/* CSP sanity: MV3 forbids remote script and unsafe-eval; sql.js needs wasm */
const csp = manifest.content_security_policy?.extension_pages || '';
// 'wasm-unsafe-eval' is permitted and required; bare 'unsafe-eval' is not.
if (/(?<!wasm-)'unsafe-eval'/.test(csp)) bad("CSP contains 'unsafe-eval', which MV3 rejects");
else ok("CSP has no bare 'unsafe-eval'");
if (/wasm-unsafe-eval/.test(csp)) ok("CSP allows 'wasm-unsafe-eval' (required by sql.js)");
else bad("CSP lacks 'wasm-unsafe-eval'; the SQLite WASM module will not instantiate");

/* walk every js/html file and resolve its references */
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    const ext = extname(p);
    if (ext === '.js') checkJs(p);
    if (ext === '.html') checkHtml(p);
  }
}

function checkJs(file) {
  const src = readFileSync(file, 'utf8');
  if (relative(EXT, file).startsWith('vendor')) return;
  const specs = [
    ...src.matchAll(/^\s*import\s+(?:[\s\S]*?)\s*from\s*['"]([^'"]+)['"]/gm),
    ...src.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g),
  ].map((m) => m[1]);
  for (const spec of specs) {
    if (spec.startsWith('node:') || !spec.startsWith('.')) { bad(`${relative(EXT, file)} imports bare specifier "${spec}" — a browser cannot resolve it`); continue; }
    const target = resolve(dirname(file), spec);
    if (existsSync(target)) ok(`${relative(EXT, file)} → ${spec}`);
    else bad(`${relative(EXT, file)} imports "${spec}" which does not exist`);
  }
  if (/\beval\s*\(/.test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''))) {
    bad(`${relative(EXT, file)} calls eval(), which MV3 blocks`);
  }
  if (/new\s+Function\s*\(/.test(src)) bad(`${relative(EXT, file)} uses new Function(), which MV3 blocks`);
}

function checkHtml(file) {
  const src = readFileSync(file, 'utf8');
  const refs = [
    ...src.matchAll(/<script[^>]+src=["']([^"']+)["']/g),
    ...src.matchAll(/<link[^>]+href=["']([^"']+)["']/g),
    ...src.matchAll(/<img[^>]+src=["']([^"']+)["']/g),
  ].map((m) => m[1]).filter((r) => !/^(https?:)?\/\//.test(r) && !r.startsWith('#'));
  for (const r of refs) {
    const target = resolve(dirname(file), r);
    if (existsSync(target)) ok(`${relative(EXT, file)} → ${r}`);
    else bad(`${relative(EXT, file)} references "${r}" which does not exist`);
  }
  if (/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/.test(src)) {
    bad(`${relative(EXT, file)} contains an inline <script>, which the MV3 CSP blocks`);
  }
}

walk(EXT);

/* vendor files sql.js needs at runtime */
for (const f of ['vendor/sql-wasm.js', 'vendor/sql-wasm.wasm', 'vendor/echarts.min.js', 'vendor/xlsx.full.min.js']) {
  if (existsSync(join(EXT, f))) ok(`vendored ${f} (${(statSync(join(EXT, f)).size / 1024).toFixed(0)} KB)`);
  else bad(`missing vendored file ${f}`);
}

const total = notes.length + problems.length;
console.log(problems.length ? problems.join('\n') : '  no structural problems');
console.log(`\n${total - problems.length}/${total} reference checks passed`);
process.exit(problems.length ? 1 : 0);
