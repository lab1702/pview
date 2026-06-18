// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/preact'
import { EmptyState } from '../src/ui/EmptyState'

afterEach(() => cleanup())

it('renders a message and a clear action', () => {
  const onClear = vi.fn()
  render(<EmptyState onClear={onClear} />)
  expect(screen.getByText(/no items match/i)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /clear/i }))
  expect(onClear).toHaveBeenCalled()
})
