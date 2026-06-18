import type { Item } from './bundle'

/** Display name for a card: the value at `nameKey`, falling back to the first
 *  value, then to an empty string. Shared by the detail-card header and the
 *  tile-name overlay so a card is labelled identically wherever it appears. */
export function cardName(item: Item, nameKey: string): string {
  return String(item.values[nameKey] ?? item.values[Object.keys(item.values)[0]] ?? '')
}
