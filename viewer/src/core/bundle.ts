export type Facet =
  | { name: string; type: 'numeric'; min: number; max: number }
  | { name: string; type: 'date'; min: string; max: string }
  | { name: string; type: 'category'; values: string[] }
  | { name: string; type: 'text' }

export interface AtlasMeta {
  file: string
  width: number
  height: number
}

export interface Item {
  id: number
  values: Record<string, unknown>
  atlas: number
  rect: [number, number, number, number]
  detail: string | null
  /** Per-item background (#rrggbb), the exact color baked into the tile by the
   *  Python builder. Absent only in hand-built/legacy bundles. */
  color?: string
}

export interface Bundle {
  version: number
  title: string
  tileSize: number
  facets: Facet[]
  cardFields: string[]
  atlases: AtlasMeta[]
  items: Item[]
}

export const SUPPORTED_VERSION = 2

export function parseBundle(json: unknown): Bundle {
  if (typeof json !== 'object' || json === null) {
    throw new Error('pview: bundle must be a JSON object')
  }
  const b = json as Record<string, unknown>
  const version = b.version
  if (typeof version !== 'number') {
    throw new Error('pview: bundle is missing a numeric "version"')
  }
  if (version > SUPPORTED_VERSION) {
    throw new Error(
      `pview: bundle version ${version} is newer than this viewer supports (${SUPPORTED_VERSION})`,
    )
  }
  if (!Array.isArray(b.items)) {
    throw new Error('pview: bundle is missing an "items" array')
  }
  if (!Array.isArray(b.atlases)) {
    throw new Error('pview: bundle is missing an "atlases" array')
  }
  const items: Item[] = (b.items as unknown[]).map((raw, i) => {
    if (typeof raw !== 'object' || raw === null) {
      throw new Error(`pview: item ${i} is not an object`)
    }
    const r = raw as Record<string, unknown>
    if (typeof r.id !== 'number') {
      throw new Error(`pview: item ${i} has a non-numeric id`)
    }
    if (typeof r.atlas !== 'number') {
      throw new Error(`pview: item ${i} has a non-numeric atlas`)
    }
    if (
      !Array.isArray(r.rect) ||
      r.rect.length !== 4 ||
      !r.rect.every((n) => typeof n === 'number')
    ) {
      throw new Error(`pview: item ${i} has an invalid rect (expected 4 numbers)`)
    }
    return {
      id: r.id,
      values: (r.values ?? {}) as Record<string, unknown>,
      atlas: r.atlas,
      rect: r.rect as [number, number, number, number],
      detail: (r.detail ?? null) as string | null,
      color: typeof r.color === 'string' ? r.color : undefined,
    }
  })
  return {
    version,
    title: (b.title as string) ?? '',
    tileSize: (b.tileSize as number) ?? 256,
    facets: (b.facets as Facet[]) ?? [],
    cardFields: (b.cardFields as string[]) ?? [],
    atlases: b.atlases as AtlasMeta[],
    items,
  }
}
