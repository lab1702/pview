import type { Facet } from './bundle'

export function isBucketable(facet: Facet): boolean {
  return facet.type === 'category' || facet.type === 'numeric' || facet.type === 'date'
}
