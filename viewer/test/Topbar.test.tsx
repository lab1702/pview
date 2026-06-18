// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { Topbar } from '../src/ui/Topbar'
import { createViewerState } from '../src/ui/state'
import type { Bundle } from '../src/core/bundle'

afterEach(() => cleanup())

function bundle(): Bundle {
  return {
    version: 2, title: 'People', tileSize: 64,
    facets: [{ name: 'name', type: 'text' }, { name: 'age', type: 'numeric', min: 0, max: 9 }],
    cardFields: ['name'],
    atlases: [{ file: 'a', width: 1, height: 1 }],
    items: [
      { id: 0, values: { name: 'Ada', age: 1 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
      { id: 1, values: { name: 'Bob', age: 2 }, atlas: 0, rect: [0, 0, 1, 1], detail: null },
    ],
  }
}

it('shows the title and the N of M count', () => {
  const state = createViewerState(bundle())
  render(<Topbar bundle={bundle()} state={state} />)
  expect(screen.getByText('People')).toBeTruthy()
  expect(screen.getByText(/2 of 2/)).toBeTruthy()
})

it('typing in search updates the query signal', () => {
  const b = bundle()
  const state = createViewerState(b)
  render(<Topbar bundle={b} state={state} />)
  fireEvent.input(screen.getByPlaceholderText(/search/i), { target: { value: 'ada' } })
  expect(state.query.value).toBe('ada')
})
