/**
 * expr.js — a tiny arithmetic expression language, parsed to an AST and
 * interpreted. NOT eval, NOT new Function: an evolving agent must be able to
 * define new derived metrics at runtime without ever gaining code execution.
 *
 * Grammar:
 *   expr    := ternary
 *   ternary := or ('?' expr ':' expr)?
 *   or      := and ('||' and)*
 *   and     := cmp ('&&' cmp)*
 *   cmp     := sum (('<'|'<='|'>'|'>='|'=='|'!=') sum)*
 *   sum     := product (('+'|'-') product)*
 *   product := unary (('*'|'/'|'%') unary)*
 *   unary   := ('-'|'+'|'!') unary | power
 *   power   := atom ('^' unary)?
 *   atom    := number | string | ident | ident '(' args ')' | '(' expr ')'
 *
 * Identifiers resolve against a supplied scope object; dotted paths are allowed.
 * Function calls resolve only against the whitelist below.
 */

export const FUNCTIONS = {
  abs: Math.abs, min: Math.min, max: Math.max, sqrt: Math.sqrt, exp: Math.exp,
  ln: Math.log, log10: Math.log10, pow: Math.pow, floor: Math.floor, ceil: Math.ceil,
  round: (x, d = 0) => { const f = 10 ** d; return Math.round(x * f) / f; },
  sign: Math.sign, sin: Math.sin, cos: Math.cos, tan: Math.tan, atan: Math.atan,
  clamp: (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x),
  if: (c, a, b) => (c ? a : b),
  coalesce: (...a) => a.find((x) => x !== null && x !== undefined && !(typeof x === 'number' && Number.isNaN(x))) ?? null,
  sum: (...a) => a.flat().reduce((s, v) => s + Number(v || 0), 0),
  mean: (...a) => { const f = a.flat().map(Number).filter(Number.isFinite); return f.length ? f.reduce((s, v) => s + v, 0) / f.length : NaN; },
  count: (...a) => a.flat().length,
  bps: (x) => x * 1e4,
  pct: (x) => x * 100,
};

const CONSTANTS = { PI: Math.PI, E: Math.E, true: true, false: false, null: null, NaN: NaN, Infinity: Infinity };

class Lexer {
  constructor(src) { this.s = src; this.i = 0; this.toks = []; }
  error(msg) { throw new SyntaxError(`${msg} at position ${this.i} in "${this.s}"`); }
  all() {
    const ops = ['<=', '>=', '==', '!=', '&&', '||', '<', '>', '+', '-', '*', '/', '%', '^', '(', ')', ',', '?', ':', '!'];
    while (this.i < this.s.length) {
      const c = this.s[this.i];
      if (/\s/.test(c)) { this.i++; continue; }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(this.s[this.i + 1]))) {
        const m = /^[0-9]*\.?[0-9]+([eE][+-]?[0-9]+)?%?/.exec(this.s.slice(this.i));
        if (!m) this.error('malformed number');
        const raw = m[0];
        this.toks.push({ t: 'num', v: raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw) });
        this.i += raw.length; continue;
      }
      if (c === '"' || c === "'") {
        const end = this.s.indexOf(c, this.i + 1);
        if (end < 0) this.error('unterminated string');
        this.toks.push({ t: 'str', v: this.s.slice(this.i + 1, end) });
        this.i = end + 1; continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        const m = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(this.s.slice(this.i));
        this.toks.push({ t: 'id', v: m[0] });
        this.i += m[0].length; continue;
      }
      const op = ops.find((o) => this.s.startsWith(o, this.i));
      if (!op) this.error(`unexpected character "${c}"`);
      this.toks.push({ t: 'op', v: op });
      this.i += op.length;
    }
    this.toks.push({ t: 'eof' });
    return this.toks;
  }
}

class Parser {
  constructor(toks) { this.k = toks; this.p = 0; }
  peek() { return this.k[this.p]; }
  eat(t, v) {
    const tok = this.k[this.p];
    if (tok.t !== t || (v !== undefined && tok.v !== v)) throw new SyntaxError(`expected ${v ?? t}, found ${tok.v ?? tok.t}`);
    this.p++; return tok;
  }
  isOp(v) { const t = this.k[this.p]; return t.t === 'op' && t.v === v; }

  parse() { const e = this.ternary(); if (this.peek().t !== 'eof') throw new SyntaxError(`unexpected "${this.peek().v}"`); return e; }

  ternary() {
    const c = this.or();
    if (this.isOp('?')) { this.p++; const a = this.ternary(); this.eat('op', ':'); const b = this.ternary(); return { n: 'cond', c, a, b }; }
    return c;
  }
  or() { let l = this.and(); while (this.isOp('||')) { this.p++; l = { n: 'bin', op: '||', l, r: this.and() }; } return l; }
  and() { let l = this.cmp(); while (this.isOp('&&')) { this.p++; l = { n: 'bin', op: '&&', l, r: this.cmp() }; } return l; }
  cmp() {
    let l = this.sum();
    while (['<', '<=', '>', '>=', '==', '!='].some((o) => this.isOp(o))) { const op = this.k[this.p++].v; l = { n: 'bin', op, l, r: this.sum() }; }
    return l;
  }
  sum() { let l = this.product(); while (this.isOp('+') || this.isOp('-')) { const op = this.k[this.p++].v; l = { n: 'bin', op, l, r: this.product() }; } return l; }
  product() { let l = this.unary(); while (this.isOp('*') || this.isOp('/') || this.isOp('%')) { const op = this.k[this.p++].v; l = { n: 'bin', op, l, r: this.unary() }; } return l; }
  unary() {
    if (this.isOp('-') || this.isOp('+') || this.isOp('!')) { const op = this.k[this.p++].v; return { n: 'un', op, x: this.unary() }; }
    return this.power();
  }
  power() { const b = this.atom(); if (this.isOp('^')) { this.p++; return { n: 'bin', op: '^', l: b, r: this.unary() }; } return b; }
  atom() {
    const t = this.peek();
    if (t.t === 'num') { this.p++; return { n: 'lit', v: t.v }; }
    if (t.t === 'str') { this.p++; return { n: 'lit', v: t.v }; }
    if (t.t === 'id') {
      this.p++;
      if (this.isOp('(')) {
        this.p++;
        const args = [];
        if (!this.isOp(')')) { args.push(this.ternary()); while (this.isOp(',')) { this.p++; args.push(this.ternary()); } }
        this.eat('op', ')');
        return { n: 'call', name: t.v, args };
      }
      return { n: 'ref', path: t.v };
    }
    if (this.isOp('(')) { this.p++; const e = this.ternary(); this.eat('op', ')'); return e; }
    throw new SyntaxError(`unexpected token "${t.v ?? t.t}"`);
  }
}

export function parse(src) {
  if (typeof src !== 'string' || !src.trim()) throw new SyntaxError('empty expression');
  if (src.length > 2000) throw new SyntaxError('expression exceeds 2000 characters');
  return new Parser(new Lexer(src).all()).parse();
}

function resolve(path, scope) {
  if (path in CONSTANTS) return CONSTANTS[path];
  let cur = scope;
  for (const part of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') throw new Error(`"${part}" is not accessible`);
    cur = cur[part];
  }
  return cur;
}

export function evaluate(ast, scope = {}, depth = 0) {
  if (depth > 100) throw new Error('expression nested too deeply');
  switch (ast.n) {
    case 'lit': return ast.v;
    case 'ref': {
      const v = resolve(ast.path, scope);
      if (v === undefined) throw new Error(`unknown identifier "${ast.path}"`);
      return v;
    }
    case 'un': {
      const x = evaluate(ast.x, scope, depth + 1);
      return ast.op === '-' ? -x : ast.op === '+' ? +x : !x;
    }
    case 'bin': {
      if (ast.op === '&&') return evaluate(ast.l, scope, depth + 1) && evaluate(ast.r, scope, depth + 1);
      if (ast.op === '||') return evaluate(ast.l, scope, depth + 1) || evaluate(ast.r, scope, depth + 1);
      const a = evaluate(ast.l, scope, depth + 1), b = evaluate(ast.r, scope, depth + 1);
      switch (ast.op) {
        case '+': return a + b; case '-': return a - b; case '*': return a * b;
        case '/': return b === 0 ? NaN : a / b;
        case '%': return b === 0 ? NaN : a % b;
        case '^': return a ** b;
        case '<': return a < b; case '<=': return a <= b; case '>': return a > b; case '>=': return a >= b;
        case '==': return a === b; case '!=': return a !== b;
        default: throw new Error(`unknown operator ${ast.op}`);
      }
    }
    case 'cond': return evaluate(ast.c, scope, depth + 1) ? evaluate(ast.a, scope, depth + 1) : evaluate(ast.b, scope, depth + 1);
    case 'call': {
      const fn = FUNCTIONS[ast.name];
      if (!fn) throw new Error(`unknown function "${ast.name}". Available: ${Object.keys(FUNCTIONS).join(', ')}`);
      return fn(...ast.args.map((a) => evaluate(a, scope, depth + 1)));
    }
    default: throw new Error(`unknown node "${ast.n}"`);
  }
}

/** Free identifiers an expression reads — used to validate a skill's inputs. */
export function dependencies(ast, acc = new Set()) {
  if (!ast || typeof ast !== 'object') return acc;
  if (ast.n === 'ref' && !(ast.path in CONSTANTS)) acc.add(ast.path);
  for (const k of ['l', 'r', 'x', 'c', 'a', 'b']) if (ast[k]) dependencies(ast[k], acc);
  for (const a of ast.args || []) dependencies(a, acc);
  return acc;
}

/** Compile once, run many. Returns {ok, run, deps} or {ok:false, error}. */
export function compile(src) {
  try {
    const ast = parse(src);
    const deps = [...dependencies(ast)];
    return {
      ok: true, source: src, ast, deps,
      run: (scope) => {
        try { return { ok: true, value: evaluate(ast, scope) }; }
        catch (e) { return { ok: false, error: String(e.message || e) }; }
      },
    };
  } catch (e) {
    return { ok: false, error: String(e.message || e), source: src };
  }
}
