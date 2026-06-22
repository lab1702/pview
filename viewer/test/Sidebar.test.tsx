// @vitest-environment jsdom
import { it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { Sidebar } from '../src/ui/Sidebar'
import { createViewerState } from '../src/ui/state'
import type { Bundle } from '../src/core/bundle'

afterEach(() => cleanup())

function bundle(): Bundle {
  return {
    version: 2, title: 'T', tileSize: 64,
    facets: [
      { name: 'name', type: 'text' },
      { name: 'g', type: 'category', values: ['a', 'b'] },
    ],
    cardFields: ['name'],
    atlases: [{ file: 'a', width: 1, height: 1 }],
    items: [
      { id: 0, values: { name: 'A', g: 'a' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
      { id: 1, values: { name: 'B', g: 'b' }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    ],
  }
}

it('renders a checkbox per category value with counts and toggles the filter', () => {
  const b = bundle()
  const state = createViewerState(b)
  render(<Sidebar bundle={b} state={state} />)
  const checkbox = screen.getByLabelText(/a \(1\)/) // value "a", count 1
  fireEvent.click(checkbox)
  const constraint = state.filter.value['g'] as { values: Set<string> }
  expect(constraint.values.has('a')).toBe(true)
})

it('does not render a control for text facets', () => {
  const b = bundle()
  const state = createViewerState(b)
  render(<Sidebar bundle={b} state={state} />)
  expect(screen.queryByText('name')).toBeNull()
})

it('collapses and expands a facet when its header is clicked', () => {
  const b = bundle()
  const state = createViewerState(b)
  const { container } = render(<Sidebar bundle={b} state={state} />)
  const header = screen.getByRole('button', { name: 'g' }) // facet "g" header
  expect(header.getAttribute('aria-expanded')).toBe('true')
  fireEvent.click(header)
  expect(header.getAttribute('aria-expanded')).toBe('false')
  const body = container.querySelector('.pview-facet-body')
  expect(body!.hasAttribute('inert')).toBe(true)
  fireEvent.click(header)
  expect(header.getAttribute('aria-expanded')).toBe('true')
  expect(body!.hasAttribute('inert')).toBe(false)
})

function mkItem(id: number, values: Record<string, unknown>) {
  return { id, values, atlas: 0, rect: [0, 0, 1, 1] as [number, number, number, number], detail: null }
}

it('shows an "Include items with no value" checkbox only for numeric facets with nulls', () => {
  const b: Bundle = {
    version: 2, title: '', tileSize: 256,
    cardFields: [], atlases: [],
    facets: [
      { name: 'age', type: 'numeric', min: 0, max: 100 },
      { name: 'score', type: 'numeric', min: 0, max: 10 },
    ],
    items: [
      mkItem(0, { age: 10, score: 1 }),
      mkItem(1, { age: null, score: 2 }),
    ],
  }
  const state = createViewerState(b)
  render(<Sidebar bundle={b} state={state} />)
  const labels = screen.getAllByText(/Include items with no value/i)
  expect(labels.length).toBe(1) // only `age`
})

it('toggling the numeric null checkbox sets includeNull on the constraint', () => {
  const b: Bundle = {
    version: 2, title: '', tileSize: 256,
    cardFields: [], atlases: [],
    facets: [{ name: 'age', type: 'numeric', min: 0, max: 100 }],
    items: [mkItem(0, { age: 10 }), mkItem(1, { age: null })],
  }
  const state = createViewerState(b)
  render(<Sidebar bundle={b} state={state} />)
  const cb = screen.getByLabelText(/Include items with no value/i) as HTMLInputElement
  fireEvent.click(cb)
  expect((state.filter.value['age'] as { includeNull?: boolean }).includeNull).toBe(true)
})

it('shows a "(no value)" row for category facets with nulls and toggles includeNull', () => {
  const b: Bundle = {
    version: 2, title: '', tileSize: 256,
    cardFields: [], atlases: [],
    facets: [{ name: 'g', type: 'category', values: ['a', 'b'] }],
    items: [mkItem(0, { g: 'a' }), mkItem(1, { g: null })],
  }
  const state = createViewerState(b)
  render(<Sidebar bundle={b} state={state} />)
  const cb = screen.getByLabelText(/\(no value\)/i) as HTMLInputElement
  fireEvent.click(cb)
  expect((state.filter.value['g'] as { includeNull?: boolean }).includeNull).toBe(true)
})
