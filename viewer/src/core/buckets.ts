export function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range))
  const frac = range / Math.pow(10, exp)
  let nice: number
  if (round) {
    if (frac < 1.5) nice = 1
    else if (frac < 3) nice = 2
    else if (frac < 7) nice = 5
    else nice = 10
  } else {
    if (frac <= 1) nice = 1
    else if (frac <= 2) nice = 2
    else if (frac <= 5) nice = 5
    else nice = 10
  }
  return nice * Math.pow(10, exp)
}

function clean(v: number): number {
  return Math.round(v * 1e6) / 1e6
}

export function computeBuckets(
  min: number,
  max: number,
  targetCount = 10,
): { edges: number[]; labels: string[] } {
  if (!(max > min)) {
    return { edges: [min, min], labels: [String(clean(min))] }
  }
  const range = niceNum(max - min, false)
  const step = niceNum(range / (targetCount - 1), true)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const count = Math.round((niceMax - niceMin) / step)
  const edges = Array.from({ length: count + 1 }, (_, i) => clean(niceMin + i * step))
  const labels = edges.slice(0, -1).map((_, i) => `${edges[i]}–${edges[i + 1]}`)
  return { edges, labels }
}

export function bucketIndexOf(value: number, edges: number[]): number {
  const n = edges.length - 1
  if (n <= 0) return 0
  if (value <= edges[0]) return 0
  if (value >= edges[n]) return n - 1
  for (let i = 0; i < n; i++) {
    if (value >= edges[i] && value < edges[i + 1]) return i
  }
  return n - 1
}
