function hlsToRgb(h: number, l: number, s: number): [number, number, number] {
  if (s === 0) {
    const v = Math.floor(l * 255)
    return [v, v, v]
  }
  const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s
  const m1 = 2 * l - m2
  const channel = (hue: number): number => {
    let x = hue % 1
    if (x < 0) x += 1
    let c: number
    if (x < 1 / 6) c = m1 + (m2 - m1) * x * 6
    else if (x < 1 / 2) c = m2
    else if (x < 2 / 3) c = m1 + (m2 - m1) * (2 / 3 - x) * 6
    else c = m1
    return Math.floor(c * 255)
  }
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)]
}

// The per-item background palette. MUST stay byte-identical to the Python tile
// generator (`_bg_color`/`_GOLDEN_RATIO_CONJUGATE` in src/pview/images.py), or a
// card's atlas tile and its detail-card background will diverge: the same id has
// to yield the same color on both sides. `hlsToRgb` above is a port of Python's
// colorsys.hls_to_rgb; keep the lightness/saturation here in sync with that file.
const GOLDEN_RATIO_CONJUGATE = 0.61803398875
const BG_LIGHTNESS = 0.45
const BG_SATURATION = 0.55

export function generatedColor(id: number): string {
  const hue = (id * GOLDEN_RATIO_CONJUGATE) % 1
  const [r, g, b] = hlsToRgb(hue, BG_LIGHTNESS, BG_SATURATION)
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return `#${hex(r)}${hex(g)}${hex(b)}`
}
