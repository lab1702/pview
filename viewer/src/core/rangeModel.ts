export function valueToFraction(value: number, min: number, max: number): number {
  if (max <= min) return 0
  return Math.min(1, Math.max(0, (value - min) / (max - min)))
}

export function fractionToValue(fraction: number, min: number, max: number, step?: number): number {
  const f = Math.min(1, Math.max(0, fraction))
  let v = min + f * (max - min)
  if (step && step > 0) v = Math.round((v - min) / step) * step + min
  return Math.min(max, Math.max(min, v))
}

export function clampLow(low: number, high: number): number {
  return Math.min(low, high)
}

export function clampHigh(high: number, low: number): number {
  return Math.max(high, low)
}
