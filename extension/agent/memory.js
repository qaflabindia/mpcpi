/**
 * memory.js — episodic and semantic memory with an explicit context budget.
 *
 * Three jobs:
 *   1. remember   store a fact, a result or a user preference
 *   2. recall     retrieve what is relevant to the question at hand (BM25-lite)
 *   3. budget     decide what actually fits in the prompt, and drop the rest
 *
 * The budget step is the point. An agent that remembers everything and injects
 * all of it is not optimising context; it is filling it. Retrieval is scored,
 * ranked, truncated to a token allowance, and what was dropped is reported so
 * the behaviour stays inspectable.
 */

const STOP = new Set('a an the and or of to in for on with is are was were be been it its this that these those as at by from we you i not no but if then than so such which what when how why do does did can could should would may might will shall have has had'.split(' '));

export const tokenize = (s) => String(s || '').toLowerCase().match(/[a-z0-9_§.%-]{2,}/g)?.filter((t) => !STOP.has(t)) ?? [];

/** Four characters per token is close enough for budgeting and needs no tokenizer. */
export const estimateTokens = (s) => Math.ceil(String(s || '').length / 4);

export const MEMORY_KINDS = ['episodic', 'semantic', 'preference'];

export class Memory {
  constructor(store, { halfLifeDays = 30 } = {}) {
    this.store = store;
    this.halfLifeDays = halfLifeDays;
  }

  remember({ kind = 'semantic', topic = null, content, importance = 0.5, runId = null }) {
    if (!MEMORY_KINDS.includes(kind)) return { error: `kind must be one of ${MEMORY_KINDS.join(', ')}` };
    const text = String(content || '').trim();
    if (!text) return { error: 'content is empty' };
    if (text.length > 4000) return { error: 'a single memory may not exceed 4000 characters; summarise it first' };

    // Near-duplicate guard: same kind + topic + high token overlap updates in place.
    const candidates = this.store.all('SELECT id, content, importance FROM agent_memory WHERE kind = ? AND (topic IS ? OR topic = ?) ORDER BY id DESC LIMIT 25', [kind, topic, topic]);
    const nt = new Set(tokenize(text));
    for (const c of candidates) {
      const ct = new Set(tokenize(c.content));
      const inter = [...nt].filter((t) => ct.has(t)).length;
      const jac = inter / Math.max(1, nt.size + ct.size - inter);
      if (jac > 0.75) {
        this.store.run('UPDATE agent_memory SET content = ?, importance = ?, created_at = ? WHERE id = ?',
          [text, Math.max(importance, c.importance), new Date().toISOString(), c.id]);
        return { id: c.id, updated: true, reason: `merged with an existing memory (${(jac * 100).toFixed(0)}% overlap)` };
      }
    }

    this.store.run(
      'INSERT INTO agent_memory (created_at, kind, topic, content, tokens, importance, run_id) VALUES (?,?,?,?,?,?,?)',
      [new Date().toISOString(), kind, topic, text, estimateTokens(text), Math.max(0, Math.min(1, importance)), runId],
    );
    return { id: this.store.one('SELECT last_insert_rowid() AS id').id, created: true };
  }

  forget(id) { this.store.run('DELETE FROM agent_memory WHERE id = ?', [id]); return { id, forgotten: true }; }

  /**
   * BM25-lite lexical retrieval with a recency decay and an importance prior.
   * No embeddings: an offline-capable extension should not require a model call
   * to remember something, and for a few hundred short notes lexical scoring is
   * both adequate and explainable.
   */
  recall(query, { kind = null, limit = 8, minScore = 0.05 } = {}) {
    const rows = this.store.all(
      `SELECT * FROM agent_memory ${kind ? 'WHERE kind = ?' : ''} ORDER BY id DESC LIMIT 500`,
      kind ? [kind] : [],
    );
    if (!rows.length) return [];

    const qt = tokenize(query);
    if (!qt.length) return rows.slice(0, limit).map((r) => ({ ...r, score: 0 }));

    const N = rows.length;
    const df = new Map();
    const docs = rows.map((r) => {
      const t = tokenize(`${r.topic || ''} ${r.content}`);
      for (const u of new Set(t)) df.set(u, (df.get(u) || 0) + 1);
      return t;
    });
    const avgLen = docs.reduce((s, d) => s + d.length, 0) / N || 1;
    const k1 = 1.2, b = 0.75;
    const now = Date.now();

    const scored = rows.map((r, i) => {
      const d = docs[i];
      const tf = new Map();
      for (const t of d) tf.set(t, (tf.get(t) || 0) + 1);
      let bm = 0;
      for (const q of qt) {
        const f = tf.get(q) || 0;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(q) || 0) + 0.5) / ((df.get(q) || 0) + 0.5));
        bm += idf * (f * (k1 + 1)) / (f + k1 * (1 - b + b * (d.length / avgLen)));
      }
      const ageDays = (now - Date.parse(r.created_at)) / 86400000;
      const recency = Math.pow(0.5, Math.max(0, ageDays) / this.halfLifeDays);
      const useBoost = 1 + Math.log1p(r.uses || 0) * 0.15;
      // Preferences are sticky by design: a stated user preference should not
      // decay out of context merely because it was stated a month ago.
      const decay = r.kind === 'preference' ? Math.max(recency, 0.6) : recency;
      const score = bm * (0.35 + 0.65 * decay) * (0.5 + r.importance) * useBoost;
      return { ...r, bm25: Number(bm.toFixed(4)), recency: Number(decay.toFixed(3)), score: Number(score.toFixed(4)) };
    });

    return scored.filter((r) => r.score >= minScore).sort((a, b2) => b2.score - a.score).slice(0, limit);
  }

  touch(ids) {
    for (const id of ids) this.store.run('UPDATE agent_memory SET uses = uses + 1, last_used = ? WHERE id = ?', [new Date().toISOString(), id]);
  }

  /**
   * Select memories that fit a token allowance, highest score first, and report
   * what was left out. The caller gets a block ready to paste into a system
   * prompt plus an honest account of the truncation.
   */
  budget(query, { maxTokens = 900, kind = null, limit = 20 } = {}) {
    const hits = this.recall(query, { kind, limit });
    const kept = [], dropped = [];
    let used = 0;
    for (const h of hits) {
      const t = h.tokens || estimateTokens(h.content);
      if (used + t <= maxTokens) { kept.push(h); used += t; }
      else dropped.push({ id: h.id, topic: h.topic, tokens: t, score: h.score });
    }
    this.touch(kept.map((k) => k.id));
    return {
      block: kept.length
        ? kept.map((k) => `- [${k.kind}${k.topic ? '/' + k.topic : ''}] ${k.content}`).join('\n')
        : '',
      kept: kept.map((k) => ({ id: k.id, kind: k.kind, topic: k.topic, score: k.score, tokens: k.tokens })),
      dropped,
      tokensUsed: used,
      tokenBudget: maxTokens,
      note: dropped.length ? `${dropped.length} lower-scoring memories were left out to stay inside the ${maxTokens}-token allowance.` : null,
    };
  }

  /** Age out low-value memories so the store does not grow without bound. */
  consolidate({ keepPerKind = 300, minImportance = 0.2 } = {}) {
    const removed = [];
    for (const kind of MEMORY_KINDS) {
      const rows = this.store.all(
        'SELECT id, importance, uses, created_at FROM agent_memory WHERE kind = ? ORDER BY importance DESC, uses DESC, id DESC',
        [kind],
      );
      const now = Date.now();
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const ageDays = (now - Date.parse(r.created_at)) / 86400000;
        const stale = ageDays > this.halfLifeDays * 3 && (r.uses || 0) === 0 && r.importance < minImportance;
        if (i >= keepPerKind || (stale && kind !== 'preference')) {
          this.store.run('DELETE FROM agent_memory WHERE id = ?', [r.id]);
          removed.push({ id: r.id, kind, reason: i >= keepPerKind ? 'over the per-kind cap' : 'stale, unused and low importance' });
        }
      }
    }
    return { removed: removed.length, detail: removed.slice(0, 20) };
  }

  stats() {
    return {
      total: this.store.one('SELECT COUNT(*) AS n FROM agent_memory')?.n ?? 0,
      byKind: Object.fromEntries(MEMORY_KINDS.map((k) => [k, this.store.one('SELECT COUNT(*) AS n FROM agent_memory WHERE kind = ?', [k])?.n ?? 0])),
      tokens: this.store.one('SELECT SUM(tokens) AS t FROM agent_memory')?.t ?? 0,
      mostUsed: this.store.all('SELECT topic, content, uses FROM agent_memory ORDER BY uses DESC LIMIT 5'),
    };
  }
}
