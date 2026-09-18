/**
 * num.js — numeric primitives shared by every MPCPI computation module.
 * Dependency-free ES module. Deterministic. No I/O.
 */

export const EPS = 1e-12;

export const isNum = (x) => typeof x === 'number' && Number.isFinite(x);
export const num = (x, fallback = NaN) => {
  if (isNum(x)) return x;
  if (typeof x === 'string') {
    const cleaned = x.replace(/[\s,_]/g, '').replace(/%$/, '');
    const v = Number(cleaned);
    if (Number.isFinite(v)) return x.trim().endsWith('%') ? v / 100 : v;
  }
  return fallback;
};

export const clamp = (x, lo, hi) => (x < lo ? lo : x > hi ? hi : x);
export const sum = (a) => a.reduce((s, v) => s + v, 0);
export const mean = (a) => (a.length ? sum(a) / a.length : NaN);

export function variance(a, ddof = 1) {
  if (a.length <= ddof) return NaN;
  const m = mean(a);
  return a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - ddof);
}
export const sd = (a, ddof = 1) => Math.sqrt(variance(a, ddof));

export function quantile(a, p) {
  if (!a.length) return NaN;
  const s = [...a].sort((x, y) => x - y);
  const h = (s.length - 1) * clamp(p, 0, 1);
  const lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}
export const median = (a) => quantile(a, 0.5);

/** Median absolute deviation, scaled to be a consistent estimator of sigma for normal data. */
export function mad(a) {
  const m = median(a);
  return 1.4826 * median(a.map((v) => Math.abs(v - m)));
}

export const winsorize = (x, lo, hi) => clamp(x, lo, hi);

/** Exponentially weighted moving volatility of a log-return series (RiskMetrics style). */
export function ewmaVol(returns, lambda = 0.94, annualiseDays = 252) {
  if (!returns.length) return NaN;
  let v = variance(returns.slice(0, Math.min(20, returns.length)), 0);
  if (!Number.isFinite(v)) v = 0;
  for (const r of returns) v = lambda * v + (1 - lambda) * r * r;
  return Math.sqrt(v * annualiseDays);
}

/** Abramowitz & Stegun 7.1.26 error function; |eps| < 1.5e-7. */
export function erf(x) {
  const s = Math.sign(x); x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export const normCdf = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Acklam's inverse normal CDF; |eps| < 1.15e-9. */
export function normInv(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pl = 0.02425, ph = 1 - pl;
  let q, r;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p > ph) { q = Math.sqrt(-2 * Math.log(1-p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  q = p - 0.5; r = q * q;
  return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
}

/** Student-t two-sided p-value via a normal approximation refined for small df. */
export function tPValue(t, df) {
  const x = Math.abs(t);
  if (!Number.isFinite(x)) return NaN;
  // Normal approximation with the Cornish–Fisher style df correction.
  const z = x * (1 - 1 / (4 * df)) / Math.sqrt(1 + x * x / (2 * df));
  return 2 * (1 - normCdf(z));
}

export const zeros = (n) => new Float64Array(n);
export const matrix = (n, m) => Array.from({ length: n }, () => new Float64Array(m));

/**
 * Solve A x = b by Gauss–Jordan elimination with partial pivoting.
 * A is mutated. Returns null when the system is numerically singular.
 */
export function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => Float64Array.from([...row, b[i]]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-11) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let c = col; c <= n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return Float64Array.from({ length: n }, (_, i) => M[i][n]);
}

/** Full inverse of a square matrix by Gauss–Jordan. Returns null if singular. */
export function inverse(A) {
  const n = A.length;
  const M = A.map((row, i) => {
    const r = new Float64Array(2 * n);
    r.set(row, 0); r[n + i] = 1;
    return r;
  });
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-11) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    for (let c = 0; c < 2 * n; c++) M[col][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((r) => Float64Array.from(r.subarray(n)));
}

/**
 * Ordinary least squares with an intercept added by the caller.
 * X: n x k design matrix (array of arrays). y: length-n vector.
 * Returns coefficients, standard errors, t stats, p values, R2 and residuals.
 */
export function ols(X, y, names = null) {
  const n = X.length;
  if (!n) return null;
  const k = X[0].length;
  if (n <= k) return { error: `insufficient observations: n=${n}, k=${k}` };
  const XtX = matrix(k, k), Xty = zeros(k);
  for (let i = 0; i < n; i++) {
    for (let a = 0; a < k; a++) {
      Xty[a] += X[i][a] * y[i];
      for (let b = a; b < k; b++) XtX[a][b] += X[i][a] * X[i][b];
    }
  }
  for (let a = 0; a < k; a++) for (let b = 0; b < a; b++) XtX[a][b] = XtX[b][a];
  const XtXinv = inverse(XtX.map((r) => Array.from(r)));
  if (!XtXinv) return { error: 'design matrix is singular (collinear regressors)' };
  const beta = zeros(k);
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) beta[a] += XtXinv[a][b] * Xty[b];
  const fitted = new Float64Array(n), resid = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let f = 0;
    for (let a = 0; a < k; a++) f += X[i][a] * beta[a];
    fitted[i] = f; resid[i] = y[i] - f;
  }
  const rss = sum(Array.from(resid, (r) => r * r));
  const ybar = mean(Array.from(y));
  const tss = sum(Array.from(y, (v) => (v - ybar) ** 2));
  const df = n - k;
  const s2 = rss / df;
  const se = Float64Array.from({ length: k }, (_, a) => Math.sqrt(Math.max(0, s2 * XtXinv[a][a])));
  const coefficients = Array.from({ length: k }, (_, a) => ({
    name: names?.[a] ?? `x${a}`,
    beta: beta[a],
    se: se[a],
    t: se[a] > 0 ? beta[a] / se[a] : NaN,
    p: se[a] > 0 ? tPValue(beta[a] / se[a], df) : NaN,
    ci95: [beta[a] - 1.959964 * se[a], beta[a] + 1.959964 * se[a]],
  }));
  return {
    n, k, df, coefficients,
    r2: tss > 0 ? 1 - rss / tss : NaN,
    adjR2: tss > 0 ? 1 - (rss / df) / (tss / (n - 1)) : NaN,
    sigma: Math.sqrt(s2),
    residuals: Array.from(resid),
    fitted: Array.from(fitted),
  };
}

/** Pearson correlation. */
export function corr(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - ma, db = b[i] - mb;
    sab += da * db; saa += da * da; sbb += db * db;
  }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : NaN;
}

/** Lag-1 autocorrelation — used as the persistence statistic for clearing balances (§20). */
export function autocorr1(series) {
  if (series.length < 3) return NaN;
  return corr(series.slice(0, -1), series.slice(1));
}

export const round = (x, d = 6) => (Number.isFinite(x) ? Number(x.toFixed(d)) : x);
export const pct = (x, d = 2) => (Number.isFinite(x) ? `${(x * 100).toFixed(d)}%` : '—');
