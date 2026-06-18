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
  // Per-item field validation (id/atlas/rect types) is intentionally deferred:
  // M1 validates bundle structure only. These casts trust pview-generated data;
  // field-level hardening can come later if untrusted bundles become a concern.
  const items: Item[] = (b.items as Record<string, unknown>[]).map((raw) => ({
    id: raw.id as number,
    values: (raw.values ?? {}) as Record<string, unknown>,
    atlas: raw.atlas as number,
    rect: raw.rect as [number, number, number, number],
    detail: (raw.detail ?? null) as string | null,
  }))
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
