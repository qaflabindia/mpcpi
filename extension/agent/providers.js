/**
 * providers.js — one interface, many model vendors.
 *
 * Every adapter takes the same normalised request:
 *   { system, messages:[{role,content}], tools:[{name,description,parameters}],
 *     temperature, maxTokens, json }
 * and returns the same normalised response:
 *   { text, toolCalls:[{id,name,arguments}], usage:{input,output}, raw, stop }
 *
 * The differences between vendors are confined to `toRequest` and `fromResponse`.
 * Adding a provider means adding one entry here and nothing else in the codebase.
 *
 * All network calls run in the service worker, never in the panel, so that keys
 * never touch a page context and CORS is decided by host_permissions.
 */

export const PROVIDERS = {
  /* ─────────────────────────── Anthropic ─────────────────────────── */
  anthropic: {
    label: 'Anthropic (Claude)',
    kind: 'cloud',
    defaultBaseUrl: 'https://api.anthropic.com',
    defaultModel: 'claude-sonnet-5',
    models: ['claude-opus-5', 'claude-sonnet-5', 'claude-fable-5-1', 'claude-haiku-4-5-20251001'],
    keyName: 'x-api-key',
    docs: 'https://console.anthropic.com/settings/keys',
    endpoint: (base) => `${base.replace(/\/$/, '')}/v1/messages`,
    headers: (key) => ({
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      // Required for any browser-origin request to the Anthropic API.
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    toRequest: (r) => {
      const body = {
        model: r.model,
        max_tokens: r.maxTokens ?? 4096,
        // Only sent when the caller explicitly set it. Several newer models
        // reject `temperature` outright, and sending a default nobody asked
        // for turns a working request into a 400.
        ...(r.temperature === undefined || r.temperature === null ? {} : { temperature: r.temperature }),
        messages: r.messages.map((m) => ({
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content,
        })),
      };
      if (r.system) body.system = r.system;
      if (r.tools?.length) {
        body.tools = r.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters }));
        if (r.toolChoice === 'required') body.tool_choice = { type: 'any' };
      }
      return body;
    },
    fromResponse: (j) => ({
      text: (j.content || []).filter((c) => c.type === 'text').map((c) => c.text).join(''),
      toolCalls: (j.content || []).filter((c) => c.type === 'tool_use').map((c) => ({ id: c.id, name: c.name, arguments: c.input })),
      usage: { input: j.usage?.input_tokens ?? null, output: j.usage?.output_tokens ?? null },
      stop: j.stop_reason,
      raw: j,
    }),
    /** Anthropic requires tool results to be echoed back as a user turn. */
    toolResultMessage: (calls, results) => ({
      role: 'user',
      content: calls.map((c, i) => ({
        type: 'tool_result',
        tool_use_id: c.id,
        content: typeof results[i] === 'string' ? results[i] : JSON.stringify(results[i]),
        is_error: !!results[i]?.__error,
      })),
    }),
    assistantToolMessage: (resp) => ({ role: 'assistant', content: resp.raw.content }),
  },

  /* ─────────────────────────── OpenAI ─────────────────────────── */
  openai: {
    label: 'OpenAI',
    kind: 'cloud',
    defaultBaseUrl: 'https://api.openai.com',
    defaultModel: 'gpt-4.1',
    models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-4o-mini', 'o4-mini'],
    keyName: 'Authorization',
    docs: 'https://platform.openai.com/api-keys',
    endpoint: (base) => `${base.replace(/\/$/, '')}/v1/chat/completions`,
    headers: (key) => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` }),
    toRequest: (r) => {
      const messages = [];
      if (r.system) messages.push({ role: 'system', content: r.system });
      messages.push(...r.messages);
      const body = { model: r.model, messages, max_tokens: r.maxTokens ?? 4096 };
      if (r.temperature !== undefined && r.temperature !== null) body.temperature = r.temperature;
      if (r.json) body.response_format = { type: 'json_object' };
      if (r.tools?.length) {
        body.tools = r.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
        body.tool_choice = r.toolChoice === 'required' ? 'required' : 'auto';
      }
      return body;
    },
    fromResponse: (j) => {
      const m = j.choices?.[0]?.message ?? {};
      return {
        text: m.content ?? '',
        toolCalls: (m.tool_calls || []).map((c) => ({ id: c.id, name: c.function.name, arguments: safeJson(c.function.arguments) })),
        usage: { input: j.usage?.prompt_tokens ?? null, output: j.usage?.completion_tokens ?? null },
        stop: j.choices?.[0]?.finish_reason,
        raw: j,
      };
    },
    toolResultMessage: (calls, results) => calls.map((c, i) => ({
      role: 'tool', tool_call_id: c.id,
      content: typeof results[i] === 'string' ? results[i] : JSON.stringify(results[i]),
    })),
    assistantToolMessage: (resp) => resp.raw.choices[0].message,
  },

  /* ─────────────────────────── Google ─────────────────────────── */
  google: {
    label: 'Google (Gemini)',
    kind: 'cloud',
    defaultBaseUrl: 'https://generativelanguage.googleapis.com',
    defaultModel: 'gemini-2.5-pro',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
    keyName: 'x-goog-api-key',
    docs: 'https://aistudio.google.com/app/apikey',
    endpoint: (base, model) => `${base.replace(/\/$/, '')}/v1beta/models/${model}:generateContent`,
    headers: (key) => ({ 'content-type': 'application/json', 'x-goog-api-key': key }),
    toRequest: (r) => {
      const body = {
        contents: r.messages.map((m) => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: typeof m.content === 'string' ? [{ text: m.content }] : m.content,
        })),
        generationConfig: {
          maxOutputTokens: r.maxTokens ?? 4096,
          ...(r.temperature === undefined || r.temperature === null ? {} : { temperature: r.temperature }),
        },
      };
      if (r.system) body.systemInstruction = { parts: [{ text: r.system }] };
      if (r.json) body.generationConfig.responseMimeType = 'application/json';
      if (r.tools?.length) {
        body.tools = [{ functionDeclarations: r.tools.map((t) => ({ name: t.name, description: t.description, parameters: stripSchema(t.parameters) })) }];
      }
      return body;
    },
    fromResponse: (j) => {
      const parts = j.candidates?.[0]?.content?.parts || [];
      return {
        text: parts.filter((p) => p.text).map((p) => p.text).join(''),
        toolCalls: parts.filter((p) => p.functionCall).map((p, i) => ({ id: `gc_${i}`, name: p.functionCall.name, arguments: p.functionCall.args })),
        usage: { input: j.usageMetadata?.promptTokenCount ?? null, output: j.usageMetadata?.candidatesTokenCount ?? null },
        stop: j.candidates?.[0]?.finishReason,
        raw: j,
      };
    },
    toolResultMessage: (calls, results) => ({
      role: 'user',
      content: calls.map((c, i) => ({ functionResponse: { name: c.name, response: { result: results[i] } } })),
    }),
    assistantToolMessage: (resp) => ({ role: 'assistant', content: resp.raw.candidates[0].content.parts }),
  },

  /* ─────────────────────────── Ollama (local) ─────────────────────────── */
  ollama: {
    label: 'Ollama (local)',
    kind: 'local',
    defaultBaseUrl: 'http://localhost:11434',
    defaultModel: 'llama3.1',
    models: ['llama3.1', 'qwen2.5', 'mistral-nemo', 'deepseek-r1', 'phi4'],
    keyName: null,
    docs: 'https://ollama.com/download',
    /** Ollama must be started with OLLAMA_ORIGINS set for an extension origin
     *  to reach it. The options page surfaces this verbatim. */
    corsNote: 'Start Ollama with OLLAMA_ORIGINS="chrome-extension://*" so the extension origin is allowed.',
    endpoint: (base) => `${base.replace(/\/$/, '')}/api/chat`,
    headers: () => ({ 'content-type': 'application/json' }),
    toRequest: (r) => {
      const messages = [];
      if (r.system) messages.push({ role: 'system', content: r.system });
      messages.push(...r.messages);
      const body = { model: r.model, messages, stream: false, options: { num_predict: r.maxTokens ?? 4096, ...(r.temperature === undefined || r.temperature === null ? {} : { temperature: r.temperature }) } };
      if (r.json) body.format = 'json';
      if (r.tools?.length) body.tools = r.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
      return body;
    },
    fromResponse: (j) => ({
      text: j.message?.content ?? '',
      toolCalls: (j.message?.tool_calls || []).map((c, i) => ({ id: `ol_${i}`, name: c.function.name, arguments: typeof c.function.arguments === 'string' ? safeJson(c.function.arguments) : c.function.arguments })),
      usage: { input: j.prompt_eval_count ?? null, output: j.eval_count ?? null },
      stop: j.done_reason,
      raw: j,
    }),
    toolResultMessage: (calls, results) => calls.map((c, i) => ({ role: 'tool', content: typeof results[i] === 'string' ? results[i] : JSON.stringify(results[i]) })),
    assistantToolMessage: (resp) => resp.raw.message,
    listModels: async (base) => {
      const r = await fetch(`${base.replace(/\/$/, '')}/api/tags`);
      const j = await r.json();
      return (j.models || []).map((m) => m.name);
    },
  },

  /* ─────────────────────── Hugging Face router ─────────────────────── */
  huggingface: {
    label: 'Hugging Face',
    kind: 'cloud',
    defaultBaseUrl: 'https://router.huggingface.co',
    defaultModel: 'meta-llama/Llama-3.3-70B-Instruct',
    models: ['meta-llama/Llama-3.3-70B-Instruct', 'Qwen/Qwen2.5-72B-Instruct', 'mistralai/Mistral-Small-24B-Instruct-2501'],
    keyName: 'Authorization',
    docs: 'https://huggingface.co/settings/tokens',
    endpoint: (base) => `${base.replace(/\/$/, '')}/v1/chat/completions`,
    headers: (key) => ({ 'content-type': 'application/json', authorization: `Bearer ${key}` }),
    toRequest: (r) => PROVIDERS.openai.toRequest(r),
    fromResponse: (j) => PROVIDERS.openai.fromResponse(j),
    toolResultMessage: (c, r) => PROVIDERS.openai.toolResultMessage(c, r),
    assistantToolMessage: (r) => PROVIDERS.openai.assistantToolMessage(r),
  },

  /* ───────── Any OpenAI-compatible endpoint (vLLM, LM Studio, Groq, …) ───────── */
  compatible: {
    label: 'OpenAI-compatible endpoint',
    kind: 'custom',
    defaultBaseUrl: 'http://localhost:1234',
    defaultModel: 'local-model',
    models: [],
    keyName: 'Authorization',
    docs: null,
    note: 'Point this at vLLM, LM Studio, LocalAI, Together, Groq or OpenRouter — anything that speaks /v1/chat/completions.',
    endpoint: (base) => `${base.replace(/\/$/, '')}/v1/chat/completions`,
    headers: (key) => (key ? { 'content-type': 'application/json', authorization: `Bearer ${key}` } : { 'content-type': 'application/json' }),
    toRequest: (r) => PROVIDERS.openai.toRequest(r),
    fromResponse: (j) => PROVIDERS.openai.fromResponse(j),
    toolResultMessage: (c, r) => PROVIDERS.openai.toolResultMessage(c, r),
    assistantToolMessage: (r) => PROVIDERS.openai.assistantToolMessage(r),
    listModels: async (base, key) => {
      const r = await fetch(`${base.replace(/\/$/, '')}/v1/models`, { headers: key ? { authorization: `Bearer ${key}` } : {} });
      const j = await r.json();
      return (j.data || []).map((m) => m.id);
    },
  },
};

function safeJson(s) { try { return typeof s === 'string' ? JSON.parse(s) : s; } catch { return { __unparsed: s }; } }

/** Gemini rejects several JSON Schema keywords the other vendors accept. */
function stripSchema(schema) {
  if (!schema || typeof schema !== 'object') return schema;
  const drop = new Set(['additionalProperties', '$schema', 'default', 'examples', 'const', 'exclusiveMinimum', 'exclusiveMaximum']);
  const walk = (n) => {
    if (Array.isArray(n)) return n.map(walk);
    if (n && typeof n === 'object') {
      const out = {};
      for (const [k, v] of Object.entries(n)) if (!drop.has(k)) out[k] = walk(v);
      return out;
    }
    return n;
  };
  return walk(schema);
}

/**
 * Parameters a provider may reject outright, mapped to where they live in each
 * vendor's body. Model families change which sampling parameters they accept,
 * and a hard failure on a parameter the caller did not care about is a bad
 * trade — so a 400 naming one of these is recovered from once, with the
 * parameter removed, and the recovery is reported rather than hidden.
 */
const STRIPPABLE = ['temperature', 'top_p', 'top_k', 'frequency_penalty', 'presence_penalty'];

function stripParam(body, name) {
  const next = structuredClone(body);
  let removed = false;
  const drop = (o) => { if (o && typeof o === 'object' && name in o) { delete o[name]; removed = true; } };
  drop(next);
  drop(next.generationConfig);
  drop(next.options);
  return removed ? next : null;
}

/** Which strippable parameter, if any, does this error message blame? */
function offendingParam(message) {
  const m = String(message || '').toLowerCase();
  if (!/(deprecat|not supported|unsupported|unrecognized|unknown|invalid|cannot be used|does not support)/.test(m)) return null;
  return STRIPPABLE.find((p) => m.includes(p)) ?? null;
}

/** One chat completion. Runs in the service worker. */
export async function complete(cfg, request) {
  const p = PROVIDERS[cfg.provider];
  if (!p) throw new Error(`unknown provider "${cfg.provider}"`);
  const base = cfg.baseUrl || p.defaultBaseUrl;
  const model = request.model || cfg.model || p.defaultModel;
  if (p.keyName && !cfg.apiKey && p.kind === 'cloud') throw new Error(`${p.label} needs an API key. Add one in Settings.`);

  const url = p.endpoint(base, model);
  const body = p.toRequest({ ...request, model });
  const started = Date.now();

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers: p.headers(cfg.apiKey), body: JSON.stringify(body) });
  } catch (e) {
    const hint = p.kind === 'local'
      ? ` Is the server running at ${base}? ${p.corsNote || ''}`
      : ' Check the network, and that the host is allowed in the manifest.';
    throw new Error(`Could not reach ${p.label} at ${base}.${hint} (${e.message})`);
  }

  let textBody = await res.text();
  const recovered = [];

  if (!res.ok) {
    let detail = textBody.slice(0, 600);
    try { const j = JSON.parse(textBody); detail = j.error?.message || j.message || detail; } catch {}

    const bad = res.status === 400 ? offendingParam(detail) : null;
    const retryBody = bad ? stripParam(body, bad) : null;
    if (retryBody) {
      recovered.push(`${bad} removed: ${model} rejected it`);
      try {
        res = await fetch(url, { method: 'POST', headers: p.headers(cfg.apiKey), body: JSON.stringify(retryBody) });
        textBody = await res.text();
      } catch (e) {
        throw new Error(`${p.label} returned 400 (${detail}); the retry without ${bad} could not be sent: ${e.message}`);
      }
      if (!res.ok) {
        let d2 = textBody.slice(0, 600);
        try { const j = JSON.parse(textBody); d2 = j.error?.message || j.message || d2; } catch {}
        throw new Error(`${p.label} returned ${res.status}: ${d2}`);
      }
    } else {
      throw new Error(`${p.label} returned ${res.status}: ${detail}`);
    }
  }

  let j;
  try { j = JSON.parse(textBody); }
  catch { throw new Error(`${p.label} returned a non-JSON body: ${textBody.slice(0, 200)}`); }

  const out = p.fromResponse(j);
  out.latencyMs = Date.now() - started;
  out.provider = cfg.provider;
  out.model = model;
  if (recovered.length) out.recovered = recovered;
  return out;
}

/** Cheap reachability + credential check for the settings page. */
export async function testProvider(cfg) {
  const started = Date.now();
  try {
    const r = await complete(cfg, { messages: [{ role: 'user', content: 'Reply with the single word: ready' }], maxTokens: 16 });
    return { ok: true, latencyMs: Date.now() - started, model: r.model, reply: (r.text || '').trim().slice(0, 60), usage: r.usage, recovered: r.recovered ?? null };
  } catch (e) {
    return { ok: false, error: String(e.message || e), latencyMs: Date.now() - started };
  }
}

export async function listModels(cfg) {
  const p = PROVIDERS[cfg.provider];
  if (!p) return { error: 'unknown provider' };
  if (p.listModels) {
    try { return { models: await p.listModels(cfg.baseUrl || p.defaultBaseUrl, cfg.apiKey) }; }
    catch (e) { return { error: String(e.message || e), models: p.models }; }
  }
  return { models: p.models };
}

export const providerList = () => Object.entries(PROVIDERS).map(([id, p]) => ({
  id, label: p.label, kind: p.kind, defaultBaseUrl: p.defaultBaseUrl, defaultModel: p.defaultModel,
  models: p.models, needsKey: p.kind === 'cloud', docs: p.docs, note: p.note ?? p.corsNote ?? null,
}));
