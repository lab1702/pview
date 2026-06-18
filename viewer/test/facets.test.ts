import { it, expect } from 'vitest'
import { isBucketable } from '../src/core/facets'
import type { Facet } from '../src/core/bundle'

it('treats category/numeric/date as bucketable and text as not', () => {
  expect(isBucketable({ name: 'g', type: 'category', values: [] })).toBe(true)
  expect(isBucketable({ name: 'n', type: 'numeric', min: 0, max: 1 })).toBe(true)
  expect(isBucketable({ name: 'd', type: 'date', min: 'a', max: 'b' })).toBe(true)
  expect(isBucketable({ name: 't', type: 'text' } as Facet)).toBe(false)
})
