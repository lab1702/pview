// @vitest-environment jsdom
import { it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { DetailCard } from '../src/ui/DetailCard'
import type { Item } from '../src/core/bundle'

afterEach(() => cleanup())

const rect = { cx: 100, cy: 100, size: 300, progress: 1 }

function item(detail: string | null): Item {
  return { id: 0, values: { name: 'Ada', age: 36 }, atlas: 0, rect: [0, 0, 1, 1], detail }
}

it('renders the detail image when the item has a detail url', () => {
  render(<DetailCard item={item('detail/0.png')} baseUrl="./" rect={rect} onClose={() => {}} />)
  const img = document.querySelector('img')
  expect(img).not.toBeNull()
  expect(img!.getAttribute('src')).toBe('./detail/0.png')
})

it('renders a generated header (no img) for a detail-less item', () => {
  render(<DetailCard item={item(null)} baseUrl="./" rect={rect} onClose={() => {}} />)
  expect(document.querySelector('img')).toBeNull()
  expect(document.querySelector('.pview-detail-generated')).not.toBeNull()
})

it('renders all attribute rows and a working close button', () => {
  const onClose = vi.fn()
  render(<DetailCard item={item('detail/0.png')} baseUrl="./" rect={rect} onClose={onClose} />)
  expect(screen.getByText('name')).toBeTruthy()
  expect(screen.getByText('age')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /close/i }))
  expect(onClose).toHaveBeenCalled()
})
