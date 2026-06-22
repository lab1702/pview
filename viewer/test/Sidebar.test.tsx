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
