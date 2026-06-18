import { it, expect } from 'vitest'
import { computeBuckets, bucketIndexOf } from '../src/core/buckets'

it('produces nice 0..100 edges for [0,97]', () => {
  const { edges, labels } = computeBuckets(0, 97)
  expect(edges).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100])
  expect(labels[0]).toBe('0–10')
  expect(labels[labels.length - 1]).toBe('90–100')
})

it('produces nice 0..1 edges for [0,1]', () => {
  const { edges } = computeBuckets(0, 1)
  expect(edges[0]).toBe(0)
  expect(edges[edges.length - 1]).toBe(1)
  expect(edges.length).toBe(11)
})

it('returns a single bucket for a degenerate range', () => {
  const { edges, labels } = computeBuckets(5, 5)
  expect(edges).toEqual([5, 5])
  expect(labels).toEqual(['5'])
})

it('assigns values to buckets, clamping out-of-range', () => {
  const edges = [0, 10, 20, 30]
  expect(bucketIndexOf(0, edges)).toBe(0)
  expect(bucketIndexOf(5, edges)).toBe(0)
  expect(bucketIndexOf(10, edges)).toBe(1)
  expect(bucketIndexOf(29, edges)).toBe(2)
  expect(bucketIndexOf(30, edges)).toBe(2) // at/above last edge -> final bucket
  expect(bucketIndexOf(-5, edges)).toBe(0) // below min -> first bucket
})
