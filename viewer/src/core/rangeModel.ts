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

// Bound a handle to the facet range AND keep it on the correct side of the
// other handle: the low handle stays in [min, high], the high handle in
// [low, max]. Without the min/max clamp, keyboard nudges could push a value
// past the data range (off the track, recoverable only by many key presses).
export function clampLow(low: number, high: number, min: number): number {
  return Math.min(Math.max(low, min), high)
}

export function clampHigh(high: number, low: number, max: number): number {
  return Math.max(Math.min(high, max), low)
}
