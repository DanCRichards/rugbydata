// Minimal, hand-rolled linear scale + tick helpers. No charting library.

export interface LinearScale {
  (value: number): number;
  domain: [number, number];
  range: [number, number];
}

/** A linear scale mapping [domainMin, domainMax] -> [rangeMin, rangeMax]. */
export function linearScale(
  domainMin: number,
  domainMax: number,
  rangeMin: number,
  rangeMax: number,
): LinearScale {
  const span = domainMax - domainMin || 1;
  const fn = ((v: number) => rangeMin + ((v - domainMin) / span) * (rangeMax - rangeMin)) as LinearScale;
  fn.domain = [domainMin, domainMax];
  fn.range = [rangeMin, rangeMax];
  return fn;
}

/** Compute a padded [min, max] domain from data, guarding against zero span. */
export function niceDomain(values: number[], padFrac = 0.08): [number, number] {
  if (values.length === 0) return [0, 1];
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    const bump = Math.abs(min) * 0.1 || 1;
    return [min - bump, max + bump];
  }
  const pad = (max - min) * padFrac;
  min -= pad;
  max += pad;
  return [min, max];
}

/** Evenly spaced tick values across a domain (count inclusive of ends). */
export function ticks(min: number, max: number, count = 5): number[] {
  if (count < 2) return [min, max];
  const step = (max - min) / (count - 1);
  return Array.from({ length: count }, (_, i) => min + step * i);
}

export function formatTick(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 100) return v.toFixed(0);
  if (a >= 10) return v.toFixed(1);
  return v.toFixed(2).replace(/\.?0+$/, "");
}
