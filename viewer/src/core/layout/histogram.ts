import type { Facet, Item } from '../bundle'
import { computeBuckets, bucketIndexOf } from '../buckets'
import type { LayoutTarget } from './grid'

export interface HistogramResult {
  targets: Map<number, LayoutTarget>
  bars: { label: string; x: number; count: number }[]
  bounds: { w: number; h: number }
}

export function histogramLayout(
  orderedIds: number[],
  items: Item[],
  facet: Facet,
  opts: { tileSize: number; gap: number; barGap: number; dateFormat?: (ms: number) => string },
): HistogramResult {
  const byId = new Map(items.map((it) => [it.id, it]))
  const { tileSize, gap, barGap } = opts

  let barLabels: string[]
  let indexOf: (value: unknown) => number

  if (facet.type === 'category') {
    barLabels = [...facet.values]
    const lut = new Map(facet.values.map((v, i) => [v, i]))
    indexOf = (value) => lut.get(String(value)) ?? -1
  } else if (facet.type === 'numeric') {
    const { edges, labels } = computeBuckets(facet.min, facet.max)
    barLabels = labels
    indexOf = (value) => {
      const v = Number(value)
      return Number.isNaN(v) ? -1 : bucketIndexOf(v, edges)
    }
  } else if (facet.type === 'date') {
    const fmt = opts.dateFormat ?? ((ms: number) => new Date(ms).toISOString().slice(0, 10))
    const { edges } = computeBuckets(Date.parse(facet.min), Date.parse(facet.max))
    barLabels = edges.slice(0, -1).map((e) => fmt(e))
    indexOf = (value) => {
      const v = Date.parse(String(value))
      return Number.isNaN(v) ? -1 : bucketIndexOf(v, edges)
    }
  } else {
    barLabels = []
    indexOf = () => -1
  }

  const nBars = barLabels.length
  const heights = new Array<number>(nBars).fill(0)
  const targets = new Map<number, LayoutTarget>()
  const step = tileSize + gap
  const barStep = tileSize + barGap

  for (const id of orderedIds) {
    const item = byId.get(id)
    if (!item) continue
    const bi = indexOf(item.values[facet.name])
    if (bi < 0 || bi >= nBars) continue
    const k = heights[bi]++
    targets.set(id, { x: bi * barStep + tileSize / 2, y: -(k * step) - tileSize / 2, scale: 1 })
  }

  const bars = barLabels.map((label, i) => ({
    label,
    x: i * barStep + tileSize / 2,
    count: heights[i],
  }))
  const maxCount = heights.reduce((m, h) => Math.max(m, h), 0)
  const bounds = {
    w: nBars > 0 ? nBars * barStep - barGap : 0,
    h: maxCount > 0 ? maxCount * step - gap : 0,
  }
  return { targets, bars, bounds }
}
