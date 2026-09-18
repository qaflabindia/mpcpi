/**
 * skills.js — the part of the agent that changes at runtime.
 *
 * A "skill" is a small, declarative artifact the agent can author mid-session
 * and reuse later. Three kinds, all of them data rather than code:
 *
 *   formula    a derived metric written in the expr.js mini-language
 *   procedure  an ordered plan of existing tool calls with bound arguments
 *   prompt     a reusable instruction template with named slots
 *
 * The agent never gains code execution. Evolution happens through the registry:
 * skills accumulate a reward from their own success and are promoted, demoted
 * or retired on that evidence. A skill that keeps failing gets out of the way.
 *
 * Reward:  r <- r + alpha * (outcome - r)          exponential, recency-biased
 * Promote: reward >= 0.7 and invocations >= 3
 * Retire:  reward <= 0.25 and invocations >= 4
 */

import { compile } from './expr.js';

export const SKILL_KINDS = ['formula', 'procedure', 'prompt'];
const ALPHA = 0.35;
const PROMOTE = { reward: 0.70, invocations: 3 };
const RETIRE = { reward: 0.25, invocations: 4 };
const MAX_SKILLS = 200;

const nowIso = () => new Date().toISOString();

export class SkillRegistry {
  /** @param {Store} store — the sql.js Store from core/db.js */
  constructor(store) { this.store = store; }

  list({ status = null, kind = null } = {}) {
    const where = [], args = [];
    if (status) { where.push('status = ?'); args.push(status); }
    if (kind) { where.push('kind = ?'); args.push(kind); }
    const sql = `SELECT * FROM agent_skill ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY reward DESC, invocations DESC`;
    return this.store.all(sql, args).map(hydrate);
  }

  get(name) {
    const r = this.store.one('SELECT * FROM agent_skill WHERE name = ?', [name]);
    return r ? hydrate(r) : null;
  }

  /** Validate a proposed skill without storing it. Called before every create. */
  validate({ name, kind, description, spec }) {
    const problems = [];
    if (!/^[a-z][a-z0-9_]{2,47}$/.test(String(name || ''))) problems.push('name must be lower_snake_case, 3-48 characters, starting with a letter');
    if (!SKILL_KINDS.includes(kind)) problems.push(`kind must be one of ${SKILL_KINDS.join(', ')}`);
    if (!description || String(description).length < 10) problems.push('description must explain when to use the skill (10+ characters)');
    if (!spec || typeof spec !== 'object') problems.push('spec must be an object');

    if (kind === 'formula') {
      if (!spec?.expression) problems.push('a formula skill needs spec.expression');
      else {
        const c = compile(spec.expression);
        if (!c.ok) problems.push(`expression does not parse: ${c.error}`);
        else {
          const declared = new Set(spec.inputs || []);
          const undeclared = c.deps.filter((d) => !declared.has(d));
          if (spec.inputs && undeclared.length) problems.push(`expression reads undeclared inputs: ${undeclared.join(', ')}`);
          if (!spec.inputs) spec.inputs = c.deps;
        }
      }
      if (spec?.unit === undefined) problems.push('a formula skill must declare spec.unit so its output is not ambiguous');
    }

    if (kind === 'procedure') {
      if (!Array.isArray(spec?.steps) || !spec.steps.length) problems.push('a procedure skill needs a non-empty spec.steps array');
      else spec.steps.forEach((s, i) => {
        if (!s.tool) problems.push(`step ${i + 1} has no tool`);
        if (s.arguments && typeof s.arguments !== 'object') problems.push(`step ${i + 1} arguments must be an object`);
      });
      if (spec?.steps?.length > 12) problems.push('a procedure may not exceed 12 steps; decompose it instead');
    }

    if (kind === 'prompt') {
      if (!spec?.template) problems.push('a prompt skill needs spec.template');
      const slots = [...String(spec?.template || '').matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      if (!spec.slots) spec.slots = slots;
      const missing = slots.filter((s) => !spec.slots.includes(s));
      if (missing.length) problems.push(`template uses undeclared slots: ${missing.join(', ')}`);
    }

    return { ok: problems.length === 0, problems, spec };
  }

  create({ name, kind, description, spec, origin = 'agent' }) {
    const v = this.validate({ name, kind, description, spec });
    if (!v.ok) return { error: 'skill rejected', problems: v.problems };

    const count = this.store.one('SELECT COUNT(*) AS n FROM agent_skill')?.n ?? 0;
    if (count >= MAX_SKILLS) {
      const worst = this.store.one("SELECT name FROM agent_skill WHERE status='retired' ORDER BY reward ASC LIMIT 1");
      if (worst) this.store.run('DELETE FROM agent_skill WHERE name = ?', [worst.name]);
      else return { error: `skill registry is full (${MAX_SKILLS}) and nothing is retired; retire a skill first` };
    }

    const existing = this.get(name);
    if (existing) {
      this.store.run('UPDATE agent_skill SET kind=?, description=?, spec_json=?, updated_at=? WHERE name=?',
        [kind, description, JSON.stringify(v.spec), nowIso(), name]);
      return { ...this.get(name), replaced: true };
    }
    this.store.run(
      'INSERT INTO agent_skill (name, created_at, updated_at, kind, description, spec_json, origin, reward, status) VALUES (?,?,?,?,?,?,?,?,?)',
      [name, nowIso(), nowIso(), kind, description, JSON.stringify(v.spec), origin, 0.5, 'candidate'],
    );
    return { ...this.get(name), created: true };
  }

  /** Run a formula skill over a scope. Procedures and prompts are executed by
   *  the agent loop, which owns the tool registry. */
  runFormula(name, scope) {
    const s = this.get(name);
    if (!s) return { error: `no skill named "${name}"` };
    if (s.kind !== 'formula') return { error: `"${name}" is a ${s.kind} skill, not a formula` };
    const c = compile(s.spec.expression);
    if (!c.ok) { this.record(name, false); return { error: `skill "${name}" no longer compiles: ${c.error}` }; }
    const missing = c.deps.filter((d) => resolvePath(d, scope) === undefined);
    if (missing.length) { this.record(name, false); return { error: `missing inputs for "${name}": ${missing.join(', ')}`, required: c.deps }; }
    const r = c.run(scope);
    this.record(name, r.ok && Number.isFinite(r.value));
    return r.ok ? { value: r.value, unit: s.spec.unit, expression: s.spec.expression, inputs: c.deps } : { error: r.error };
  }

  /** Record an outcome and re-evaluate the skill's lifecycle status. */
  record(name, success) {
    const s = this.get(name);
    if (!s) return null;
    const reward = s.reward + ALPHA * ((success ? 1 : 0) - s.reward);
    const invocations = s.invocations + 1;
    const successes = s.successes + (success ? 1 : 0);
    const failures = s.failures + (success ? 0 : 1);

    let status = s.status;
    if (status !== 'retired' && reward >= PROMOTE.reward && invocations >= PROMOTE.invocations) status = 'promoted';
    if (reward <= RETIRE.reward && invocations >= RETIRE.invocations) status = 'retired';
    if (status === 'retired' && reward > 0.5) status = 'candidate';   // rehabilitation is possible

    this.store.run(
      'UPDATE agent_skill SET reward=?, invocations=?, successes=?, failures=?, status=?, updated_at=? WHERE name=?',
      [reward, invocations, successes, failures, status, nowIso(), name],
    );
    return { name, reward, invocations, status, changed: status !== s.status };
  }

  retire(name, reason = 'manual') {
    this.store.run("UPDATE agent_skill SET status='retired', updated_at=? WHERE name=?", [nowIso(), name]);
    return { name, status: 'retired', reason };
  }

  delete(name) { this.store.run('DELETE FROM agent_skill WHERE name = ?', [name]); return { name, deleted: true }; }

  /**
   * The skills worth putting in the prompt right now. Retired skills are
   * excluded; promoted ones come first. This is the context-optimisation half
   * of "the agent evolves": the prompt grows with what works and sheds what
   * does not, instead of accumulating forever.
   */
  activeForPrompt(limit = 12) {
    return this.list()
      .filter((s) => s.status !== 'retired')
      .sort((a, b) => (b.status === 'promoted') - (a.status === 'promoted') || b.reward - a.reward)
      .slice(0, limit)
      .map((s) => ({
        name: s.name, kind: s.kind, description: s.description,
        signature: s.kind === 'formula' ? `${s.name}(${(s.spec.inputs || []).join(', ')}) -> ${s.spec.unit}`
          : s.kind === 'prompt' ? `${s.name}(${(s.spec.slots || []).join(', ')})`
            : `${s.name}() // ${s.spec.steps?.length ?? 0} steps`,
        reward: Number(s.reward.toFixed(3)),
        status: s.status,
      }));
  }

  stats() {
    const rows = this.list();
    return {
      total: rows.length,
      promoted: rows.filter((s) => s.status === 'promoted').length,
      candidate: rows.filter((s) => s.status === 'candidate').length,
      retired: rows.filter((s) => s.status === 'retired').length,
      meanReward: rows.length ? Number((rows.reduce((a, s) => a + s.reward, 0) / rows.length).toFixed(3)) : null,
      byKind: Object.fromEntries(SKILL_KINDS.map((k) => [k, rows.filter((s) => s.kind === k).length])),
    };
  }
}

function hydrate(r) {
  let spec = {};
  try { spec = JSON.parse(r.spec_json); } catch { spec = { __unparsed: r.spec_json }; }
  return {
    name: r.name, kind: r.kind, description: r.description, spec,
    createdAt: r.created_at, updatedAt: r.updated_at, origin: r.origin,
    invocations: r.invocations ?? 0, successes: r.successes ?? 0, failures: r.failures ?? 0,
    reward: r.reward ?? 0.5, status: r.status ?? 'candidate',
    successRate: r.invocations ? Number((r.successes / r.invocations).toFixed(3)) : null,
  };
}

function resolvePath(path, scope) {
  let cur = scope;
  for (const p of path.split('.')) { if (cur == null) return undefined; cur = cur[p]; }
  return cur;
}

/** Skills the tool ships with, so the registry is useful before the agent has
 *  authored anything. They are ordinary skills and can be retired like any other. */
export const SEED_SKILLS = [
  {
    name: 'fiscal_stress_flag', kind: 'formula',
    description: 'Flags a participant whose interest burden and refinancing need are both elevated relative to the §12 reference. Returns 0-1; above 0.6 warrants a band review.',
    spec: {
      expression: 'clamp((interestRevenue - 0.10) / 0.20, 0, 1) * 0.6 + clamp((refinancingNeed - 0.15) / 0.35, 0, 1) * 0.4',
      inputs: ['interestRevenue', 'refinancingNeed'], unit: 'index 0-1',
    },
  },
  {
    name: 'unhedged_exposure_bps', kind: 'formula',
    description: 'The 95% one-sided FX cost of the unhedged portion of a trade over its settlement horizon, in basis points. Use to sanity-check the §23 premium line of an invoice.',
    spec: {
      expression: 'bps(1.644854 * sigma * sqrt(settlementDays / 252) * (1 - hedgeRatio))',
      inputs: ['sigma', 'settlementDays', 'hedgeRatio'], unit: 'basis points',
    },
  },
  {
    name: 'netting_value_per_day', kind: 'formula',
    description: 'Liquidity cost avoided per day by multilateral netting, given gross flow, compression and the funding rate. Answers whether the clearing layer earns its operational cost.',
    spec: {
      expression: 'gross * efficiency * fundingRate / 365',
      inputs: ['gross', 'efficiency', 'fundingRate'], unit: 'numeraire units per day',
    },
  },
  {
    name: 'divergence_review', kind: 'prompt',
    description: 'Template for explaining a leading/lagging divergence to a treasury reader without jargon.',
    spec: {
      template: 'Participant {{participant}} shows a leading index of {{leading}} against a lagging index of {{lagging}} (divergence {{divergence}}). Explain in three sentences what the market is pricing that the published fundamentals do not yet show, name the two indicators driving it, and state what a treasurer with a {{horizon}}-day exposure should do differently. Do not recommend a trade.',
      slots: ['participant', 'leading', 'lagging', 'divergence', 'horizon'],
    },
  },
];
