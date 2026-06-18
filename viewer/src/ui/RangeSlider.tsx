import { useRef } from 'preact/hooks'
import { valueToFraction, fractionToValue, clampLow, clampHigh } from '../core/rangeModel'

interface Props {
  min: number
  max: number
  low: number
  high: number
  step?: number
  onChange: (low: number, high: number) => void
  formatLabel?: (v: number) => string
}

export function RangeSlider({ min, max, low, high, step = 1, onChange, formatLabel }: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const fmt = formatLabel ?? ((v: number) => String(v))

  const nudge = (which: 'low' | 'high', delta: number) => {
    if (which === 'low') {
      onChange(clampLow(low + delta, high), high)
    } else {
      onChange(low, clampHigh(high + delta, low))
    }
  }

  const onKey = (which: 'low' | 'high') => (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault()
      nudge(which, step)
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault()
      nudge(which, -step)
    }
  }

  const dragTo = (which: 'low' | 'high', clientX: number) => {
    const track = trackRef.current
    if (!track) return
    const rect = track.getBoundingClientRect()
    if (rect.width === 0) return
    const v = fractionToValue((clientX - rect.left) / rect.width, min, max, step)
    if (which === 'low') onChange(clampLow(v, high), high)
    else onChange(low, clampHigh(v, low))
  }

  const onPointerDown = (which: 'low' | 'high') => (e: PointerEvent) => {
    e.preventDefault()
    const move = (ev: PointerEvent) => dragTo(which, ev.clientX)
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const lowPct = valueToFraction(low, min, max) * 100
  const highPct = valueToFraction(high, min, max) * 100

  return (
    <div class="pview-range">
      <div class="pview-range-track" ref={trackRef}>
        <div class="pview-range-fill" style={{ left: `${lowPct}%`, width: `${highPct - lowPct}%` }} />
        <div
          class="pview-range-handle"
          role="slider"
          tabIndex={0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={low}
          style={{ left: `${lowPct}%` }}
          onKeyDown={onKey('low')}
          onPointerDown={onPointerDown('low')}
        />
        <div
          class="pview-range-handle"
          role="slider"
          tabIndex={0}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={high}
          style={{ left: `${highPct}%` }}
          onKeyDown={onKey('high')}
          onPointerDown={onPointerDown('high')}
        />
      </div>
      <div class="pview-range-labels">
        <span>{fmt(low)}</span>
        <span>{fmt(high)}</span>
      </div>
    </div>
  )
}
