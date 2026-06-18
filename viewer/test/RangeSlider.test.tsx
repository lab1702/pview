// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, fireEvent, screen, cleanup } from '@testing-library/preact'
import { RangeSlider } from '../src/ui/RangeSlider'

afterEach(() => cleanup())

function setup(low = 2, high = 8) {
  const onChange = vi.fn()
  render(<RangeSlider min={0} max={10} low={low} high={high} step={1} onChange={onChange} />)
  const handles = screen.getAllByRole('slider')
  return { onChange, lowHandle: handles[0], highHandle: handles[1] }
}

it('exposes two ARIA sliders with correct bounds', () => {
  const { lowHandle, highHandle } = setup()
  expect(lowHandle.getAttribute('aria-valuemin')).toBe('0')
  expect(lowHandle.getAttribute('aria-valuemax')).toBe('10')
  expect(lowHandle.getAttribute('aria-valuenow')).toBe('2')
  expect(highHandle.getAttribute('aria-valuenow')).toBe('8')
})

it('ArrowRight on the low handle increases it and calls onChange', () => {
  const { onChange, lowHandle } = setup()
  fireEvent.keyDown(lowHandle, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenCalledWith(3, 8)
})

it('the low handle cannot cross the high handle', () => {
  const { onChange, lowHandle } = setup(8, 8)
  fireEvent.keyDown(lowHandle, { key: 'ArrowRight' })
  expect(onChange).toHaveBeenCalledWith(8, 8) // clamped, cannot exceed high
})

it('exposes aria-valuetext from formatLabel for screen readers', () => {
  const onChange = vi.fn()
  render(
    <RangeSlider
      min={0}
      max={10}
      low={3}
      high={7}
      step={1}
      onChange={onChange}
      formatLabel={(v) => `#${v}`}
    />,
  )
  const handles = screen.getAllByRole('slider')
  expect(handles[0].getAttribute('aria-valuetext')).toBe('#3')
  expect(handles[1].getAttribute('aria-valuetext')).toBe('#7')
})
