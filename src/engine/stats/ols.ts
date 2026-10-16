/**
 * Ordinary least squares with the (XᵀX)⁻¹ matrix kept, so prediction intervals
 * come from the model itself rather than from an arbitrary widening rule.
 */

export interface OlsFit {
  readonly beta: readonly number[];
  readonly fitted: readonly number[];
  readonly residuals: readonly number[];
  /** Residual standard error with n − p degrees of freedom. */
  readonly sigma: number;
  readonly r2: number;
  readonly xtxInverse: readonly (readonly number[])[];
  readonly n: number;
  readonly p: number;
}

/** Gauss–Jordan inversion with partial pivoting. Returns null for singular matrices. */
export function invert(matrix: readonly (readonly number[])[]): number[][] | null {
  const n = matrix.length;
  const a = matrix.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < 1e-12) return null;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    const div = a[col][col];
    for (let j = 0; j < 2 * n; j += 1) a[col][j] /= div;
    for (let r = 0; r < n; r += 1) {
      if (r === col) continue;
      const factor = a[r][col];
      if (factor === 0) continue;
      for (let j = 0; j < 2 * n; j += 1) a[r][j] -= factor * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

export function ols(x: readonly (readonly number[])[], y: readonly number[]): OlsFit | null {
  const n = y.length;
  const p = x[0]?.length ?? 0;
  if (n <= p || p === 0) return null;

  const xtx = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => x.reduce((s, row) => s + row[i] * row[j], 0)),
  );
  const xty = Array.from({ length: p }, (_, i) => x.reduce((s, row, k) => s + row[i] * y[k], 0));
  const xtxInverse = invert(xtx);
  if (!xtxInverse) return null;

  const beta = xtxInverse.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));
  const fitted = x.map((row) => row.reduce((s, v, j) => s + v * beta[j], 0));
  const residuals = y.map((v, i) => v - fitted[i]);
  const sse = residuals.reduce((s, r) => s + r * r, 0);
  const mean = y.reduce((s, v) => s + v, 0) / n;
  const sst = y.reduce((s, v) => s + (v - mean) ** 2, 0);

  return {
    beta,
    fitted,
    residuals,
    sigma: Math.sqrt(sse / (n - p)),
    r2: sst > 0 ? Math.max(0, 1 - sse / sst) : 0,
    xtxInverse,
    n,
    p,
  };
}

/** Standard error of a new observation at design row `x0`: σ·√(1 + x0ᵀ(XᵀX)⁻¹x0). */
export function predictionStdError(fit: OlsFit, x0: readonly number[]): number {
  const leverage = x0.reduce((s, xi, i) => s + xi * fit.xtxInverse[i].reduce((t, v, j) => t + v * x0[j], 0), 0);
  return fit.sigma * Math.sqrt(1 + Math.max(0, leverage));
}

/** Simple regression y = a + b·x, used for short series. */
export function linearFit(xs: readonly number[], ys: readonly number[]): OlsFit | null {
  return ols(xs.map((x) => [1, x]), ys);
}
