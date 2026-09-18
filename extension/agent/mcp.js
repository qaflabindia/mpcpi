/**
 * mcp.js — Model Context Protocol client.
 *
 * Speaks JSON-RPC 2.0 over Streamable HTTP (POST with an optional SSE reply)
 * and plain HTTP+SSE. stdio servers are out of reach from a browser extension,
 * so the options page tells the user to front those with an HTTP bridge rather
 * than pretending they will work.
 *
 * Remote MCP servers are UNTRUSTED. Their tool names, descriptions and results
 * are data, never instructions. `sanitiseDescription` strips the obvious
 * injection shapes and the agent prompt states the rule explicitly; the tool
 * gate in tools.js still requires approval for anything that leaves the machine.
 */

const PROTOCOL_VERSION = '2025-06-18';
const CLIENT_INFO = { name: 'mpcpi', version: '1.0.0' };

export class McpClient {
  constructor({ name, url, headers = {}, timeoutMs = 30000 }) {
    this.name = name;
    this.url = url;
    this.headers = headers;
    this.timeoutMs = timeoutMs;
    this.sessionId = null;
    this.initialized = false;
    this.serverInfo = null;
    this.capabilities = null;
    this.nextId = 1;
    this.toolCache = null;
  }

  async rpc(method, params = undefined, { notification = false } = {}) {
    const body = notification
      ? { jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) }
      : { jsonrpc: '2.0', id: this.nextId++, method, ...(params !== undefined ? { params } : {}) };

    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': PROTOCOL_VERSION,
      ...this.headers,
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    let res;
    try {
      res = await fetch(this.url, { method: 'POST', headers, body: JSON.stringify(body), signal: ctrl.signal });
    } catch (e) {
      clearTimeout(timer);
      throw new Error(e.name === 'AbortError' ? `MCP server "${this.name}" timed out after ${this.timeoutMs}ms` : `MCP server "${this.name}" unreachable at ${this.url}: ${e.message}`);
    }
    clearTimeout(timer);

    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    if (notification) return null;
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`MCP "${this.name}" ${method} → HTTP ${res.status}: ${t.slice(0, 300)}`);
    }

    const ct = res.headers.get('content-type') || '';
    let payload;
    if (ct.includes('text/event-stream')) payload = parseSseForResponse(await res.text(), body.id);
    else payload = await res.json();

    if (payload?.error) throw new Error(`MCP "${this.name}" ${method} → ${payload.error.code}: ${payload.error.message}`);
    return payload?.result ?? null;
  }

  async initialize() {
    const result = await this.rpc('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { roots: { listChanged: false }, sampling: {} },
      clientInfo: CLIENT_INFO,
    });
    this.serverInfo = result?.serverInfo ?? null;
    this.capabilities = result?.capabilities ?? {};
    await this.rpc('notifications/initialized', {}, { notification: true }).catch(() => {});
    this.initialized = true;
    return { serverInfo: this.serverInfo, capabilities: this.capabilities, protocolVersion: result?.protocolVersion };
  }

  async listTools(force = false) {
    if (this.toolCache && !force) return this.toolCache;
    if (!this.initialized) await this.initialize();
    const out = [];
    let cursor;
    do {
      const r = await this.rpc('tools/list', cursor ? { cursor } : {});
      for (const t of r?.tools || []) {
        out.push({
          name: t.name,
          server: this.name,
          qualifiedName: `mcp__${this.name}__${t.name}`,
          description: sanitiseDescription(t.description || ''),
          parameters: t.inputSchema || { type: 'object', properties: {} },
          annotations: t.annotations || null,
          // Conservative default: assume a tool changes the world unless the
          // server explicitly declares it read-only.
          readOnly: t.annotations?.readOnlyHint === true,
        });
      }
      cursor = r?.nextCursor;
    } while (cursor);
    this.toolCache = out;
    return out;
  }

  async callTool(name, args) {
    if (!this.initialized) await this.initialize();
    const r = await this.rpc('tools/call', { name, arguments: args ?? {} });
    const text = (r?.content || [])
      .map((c) => (c.type === 'text' ? c.text : c.type === 'resource' ? `[resource ${c.resource?.uri}]` : `[${c.type}]`))
      .join('\n');
    return {
      isError: !!r?.isError,
      text,
      structured: r?.structuredContent ?? null,
      content: r?.content ?? [],
      __untrusted: true,
      __source: `mcp:${this.name}:${name}`,
    };
  }

  async listResources() {
    if (!this.initialized) await this.initialize();
    if (!this.capabilities?.resources) return [];
    const r = await this.rpc('resources/list', {});
    return (r?.resources || []).map((x) => ({ ...x, description: sanitiseDescription(x.description || ''), server: this.name }));
  }

  async readResource(uri) {
    if (!this.initialized) await this.initialize();
    const r = await this.rpc('resources/read', { uri });
    return { contents: r?.contents || [], __untrusted: true, __source: `mcp:${this.name}:${uri}` };
  }

  async listPrompts() {
    if (!this.initialized) await this.initialize();
    if (!this.capabilities?.prompts) return [];
    const r = await this.rpc('prompts/list', {});
    return (r?.prompts || []).map((x) => ({ ...x, description: sanitiseDescription(x.description || ''), server: this.name }));
  }

  async close() {
    if (!this.sessionId) return;
    try {
      await fetch(this.url, { method: 'DELETE', headers: { 'mcp-session-id': this.sessionId, ...this.headers } });
    } catch { /* server may not support explicit teardown */ }
    this.sessionId = null;
    this.initialized = false;
  }
}

/** Pull the JSON-RPC response with the matching id out of an SSE body. */
function parseSseForResponse(text, wantId) {
  let last = null;
  for (const block of text.split(/\n\n+/)) {
    const data = block.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
    if (!data) continue;
    try {
      const j = JSON.parse(data);
      if (j.id === wantId) return j;
      last = j;
    } catch { /* non-JSON keepalive */ }
  }
  return last;
}

/**
 * Remote descriptions are shown to a model. Strip the shapes that try to
 * impersonate the harness or claim authority the server does not have.
 */
export function sanitiseDescription(s) {
  let out = String(s).slice(0, 2000);
  const patterns = [
    /<\/?(system|system-reminder|important|instructions?|assistant|human)[^>]*>/gi,
    /\b(ignore|disregard|forget)\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|rules?)/gi,
    /\byou\s+(are|must|should)\s+now\b/gi,
    /\b(the\s+)?(user|owner|admin|anthropic|system)\s+(has\s+)?(already\s+)?(approved|authorized|authorised|pre-?approved)\b/gi,
  ];
  for (const p of patterns) out = out.replace(p, '[redacted by MPCPI: instruction-shaped text in an MCP description]');
  return out;
}

/** Manages the configured set of servers. */
export class McpRegistry {
  constructor() { this.clients = new Map(); }

  async add({ name, url, headers }) {
    if (!/^https?:\/\//i.test(url)) throw new Error('MCP server URL must be http(s). A stdio server needs an HTTP bridge in front of it.');
    const c = new McpClient({ name, url, headers });
    const info = await c.initialize();
    const tools = await c.listTools();
    this.clients.set(name, c);
    return { name, url, ...info, toolCount: tools.length, tools };
  }

  remove(name) { const c = this.clients.get(name); c?.close(); return this.clients.delete(name); }
  get(name) { return this.clients.get(name) ?? null; }
  list() { return [...this.clients.values()].map((c) => ({ name: c.name, url: c.url, initialized: c.initialized, server: c.serverInfo, toolCount: c.toolCache?.length ?? 0 })); }

  async allTools() {
    const out = [];
    for (const c of this.clients.values()) {
      try { out.push(...await c.listTools()); }
      catch (e) { out.push({ name: `__error__${c.name}`, server: c.name, error: String(e.message || e) }); }
    }
    return out.filter((t) => !t.error);
  }

  async call(qualifiedName, args) {
    const m = /^mcp__([^_]+(?:_[^_]+)*)__(.+)$/.exec(qualifiedName);
    if (!m) throw new Error(`"${qualifiedName}" is not an MCP tool name`);
    const [, server, tool] = m;
    const c = this.clients.get(server);
    if (!c) throw new Error(`MCP server "${server}" is not connected`);
    return c.callTool(tool, args);
  }

  async health() {
    const rows = [];
    for (const c of this.clients.values()) {
      const t0 = Date.now();
      try { await c.rpc('ping', {}); rows.push({ name: c.name, ok: true, latencyMs: Date.now() - t0 }); }
      catch (e) {
        try { await c.listTools(true); rows.push({ name: c.name, ok: true, latencyMs: Date.now() - t0, note: 'no ping method; tools/list succeeded' }); }
        catch (e2) { rows.push({ name: c.name, ok: false, error: String(e2.message || e2) }); }
      }
    }
    return rows;
  }
}
