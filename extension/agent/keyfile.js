/**
 * keyfile.js — parse a plain key file into provider assignments.
 *
 * Accepts the shape people actually keep keys in:
 *
 *     # Claude API Key
 *     sk-ant-...
 *
 *     OPENAI_API_KEY=sk-proj-...
 *     google: AIza...
 *
 * A heading, an env-style assignment or a `label: value` line all work, and a
 * bare key on its own line is matched on its prefix.
 *
 * Nothing here logs, stores or transmits. It returns a structure the caller
 * hands to the service worker; the raw text never leaves the page it was read in.
 */

/** Recognised key shapes, most specific first. */
const SHAPES = [
  { provider: 'anthropic',   re: /^sk-ant-[A-Za-z0-9_-]{20,}$/,        label: 'Anthropic' },
  { provider: 'openai',      re: /^sk-proj-[A-Za-z0-9_-]{20,}$/,       label: 'OpenAI (project)' },
  { provider: 'openai',      re: /^sk-[A-Za-z0-9]{20,}$/,              label: 'OpenAI' },
  { provider: 'huggingface', re: /^hf_[A-Za-z0-9]{20,}$/,              label: 'Hugging Face' },
  { provider: 'compatible',  re: /^gsk_[A-Za-z0-9]{40,}$/,             label: 'Groq (OpenAI-compatible)' },
  { provider: 'google',      re: /^AIza[A-Za-z0-9_-]{30,}$/,           label: 'Google API key' },
];

/** Hints from the surrounding label, used only when the shape is ambiguous. */
const LABEL_HINTS = [
  [/claude|anthropic/i, 'anthropic'],
  [/openai|gpt|chatgpt/i, 'openai'],
  [/gemini|google/i, 'google'],
  [/hugging\s*face|^hf\b/i, 'huggingface'],
  [/ollama/i, 'ollama'],
  [/groq|together|openrouter|vllm|lm\s*studio|compatible/i, 'compatible'],
];

export const maskKey = (k) => {
  const s = String(k ?? '');
  if (s.length <= 12) return '•'.repeat(s.length);
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
};

const looksLikeKey = (s) =>
  /^[A-Za-z0-9_.\-]{20,}$/.test(s) && /[0-9]/.test(s) && !/\s/.test(s);

/**
 * @returns {{entries: Array, warnings: string[]}} entries carry
 *   {label, key, provider, detectedAs, confidence, note}
 */
export function parseKeyFile(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const entries = [];
  const warnings = [];
  let heading = null;

  const classify = (key, label) => {
    for (const s of SHAPES) {
      if (s.re.test(key)) return { provider: s.provider, detectedAs: s.label, confidence: 'shape' };
    }
    for (const [re, provider] of LABEL_HINTS) {
      if (re.test(label || '')) return { provider, detectedAs: `from the label "${label}"`, confidence: 'label' };
    }
    return { provider: null, detectedAs: 'unrecognised', confidence: 'none' };
  };

  const push = (label, key) => {
    const k = key.trim().replace(/^["']|["',]$/g, '');
    if (!looksLikeKey(k)) return;
    const c = classify(k, label);
    const e = { label: (label || '').trim() || '(unlabelled)', key: k, ...c };

    // A label that disagrees with the key's shape is worth saying out loud
    // rather than silently trusting one of them.
    if (c.confidence === 'shape') {
      const hinted = LABEL_HINTS.find(([re]) => re.test(label || ''))?.[1];
      if (hinted && hinted !== c.provider) {
        e.note = `labelled "${label.trim()}" but the key has ${c.detectedAs} format; assigned on format`;
        warnings.push(`"${label.trim()}" looks like a ${c.detectedAs} key, not ${hinted}.`);
      }
    }
    if (c.confidence === 'none') {
      e.note = 'format not recognised — pick a provider or skip it';
      warnings.push(`"${e.label}" is not a key format this tool recognises; assign it manually or leave it out.`);
    }

    // An OAuth access token is not an API key. Gemini's REST endpoint
    // authenticates with x-goog-api-key and an AIza... key; an AQ.../ya29....
    // bearer token will be rejected, and it is short-lived besides.
    if (/^(AQ\.|ya29\.)/.test(k)) {
      e.provider = null;
      e.note = 'this is an OAuth access token, not an API key — it will not authenticate against the Gemini REST endpoint, and it expires';
      warnings.push(`"${e.label}" is an OAuth access token rather than an API key. Gemini needs a key beginning AIza… from aistudio.google.com/app/apikey.`);
    }
    entries.push(e);
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (/^#{1,6}\s+/.test(line)) { heading = line.replace(/^#{1,6}\s+/, ''); continue; }

    let m = /^([A-Za-z0-9_.\- ]{2,40})\s*[:=]\s*(.+)$/.exec(line);
    if (m && looksLikeKey(m[2].trim().replace(/^["']|["',]$/g, ''))) { push(m[1], m[2]); continue; }

    m = /^[-*]\s+(.*)$/.exec(line);
    if (m) {
      const inner = /^([A-Za-z0-9_.\- ]{2,40})\s*[:=]\s*(.+)$/.exec(m[1]);
      if (inner) { push(inner[1], inner[2]); continue; }
      push(heading, m[1]);
      continue;
    }

    push(heading, line);
  }

  // Same provider claimed twice: the later one wins, but say so.
  const seen = new Map();
  for (const e of entries) {
    if (!e.provider) continue;
    if (seen.has(e.provider)) {
      warnings.push(`Two keys map to ${e.provider} ("${seen.get(e.provider)}" and "${e.label}"). The one you tick last is the one that is stored.`);
    }
    seen.set(e.provider, e.label);
  }

  return { entries, warnings };
}
