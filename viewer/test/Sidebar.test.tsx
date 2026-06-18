// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
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
  const constraint = state.filter.value['g'] as Set<string>
  expect(constraint.has('a')).toBe(true)
})

it('does not render a control for text facets', () => {
  const b = bundle()
  const state = createViewerState(b)
  render(<Sidebar bundle={b} state={state} />)
  expect(screen.queryByText('name')).toBeNull()
})
