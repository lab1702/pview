import type { Item } from './bundle'

/** Display name for a card: the value at `nameKey`, falling back to the first
 *  field, then to an empty string. Shared by the detail-card header and the
 *  tile-name overlay so a card is labelled identically wherever it appears.
 *
 *  `fieldOrder` (the declared column order) drives the fallback. Without it we
 *  use `Object.keys`, whose order JS does not preserve for integer-like keys
 *  (e.g. a column named "2020" is hoisted ahead of earlier string columns), so
 *  callers that know the real order should pass it. */
export function cardName(item: Item, nameKey: string, fieldOrder?: string[]): string {
  const order = fieldOrder ?? Object.keys(item.values)
  return String(item.values[nameKey] ?? item.values[order[0]] ?? '')
}
