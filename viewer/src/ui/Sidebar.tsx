import type { Bundle, Facet } from '../core/bundle'
import type { ViewerState } from './state'
import type { CategoryConstraint, RangeConstraint } from '../core/filter'
import { NULL_KEY } from '../core/nulls'
import { RangeSlider } from './RangeSlider'
import { useState } from 'preact/hooks'

export function Sidebar({ bundle, state }: { bundle: Bundle; state: ViewerState }) {
  const filterable = bundle.facets.filter((f) => f.type !== 'text')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const toggleCollapse = (name: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const toggleCategory = (name: string, value: string) => {
    const cur = (state.filter.value[name] as CategoryConstraint | undefined) ?? { values: new Set<string>() }
    const next = new Set(cur.values)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    state.filter.value = { ...state.filter.value, [name]: { values: next, includeNull: cur.includeNull } }
  }

  const setRange = (name: string, low: number, high: number) => {
    const cur = state.filter.value[name] as { includeNull?: boolean } | undefined
    state.filter.value = { ...state.filter.value, [name]: { min: low, max: high, includeNull: cur?.includeNull } }
  }

  const setRangeStr = (name: string, low: string, high: string) => {
    const cur = state.filter.value[name] as { includeNull?: boolean } | undefined
    state.filter.value = { ...state.filter.value, [name]: { min: low, max: high, includeNull: cur?.includeNull } }
  }

  const toggleRangeNull = (name: string, fullMin: number | string, fullMax: number | string) => {
    const cur = state.filter.value[name] as RangeConstraint | undefined
    const min = cur?.min ?? fullMin
    const max = cur?.max ?? fullMax
    // Nulls are included by default, so the toggle flips to the explicit
    // `false` opt-out and back. The cast is needed because min/max are typed
    // number|string here (one helper serves both numeric and date facets);
    // each call site passes a consistent pair matching one RangeConstraint arm.
    state.filter.value = { ...state.filter.value, [name]: { min, max, includeNull: cur?.includeNull === false } as RangeConstraint }
  }

  const toggleCategoryNull = (name: string) => {
    const cur = (state.filter.value[name] as CategoryConstraint | undefined) ?? { values: new Set<string>() }
    state.filter.value = { ...state.filter.value, [name]: { values: cur.values, includeNull: cur.includeNull === false } }
  }

  return (
    <div class="pview-sidebar">
      <button type="button" class="pview-clear" onClick={() => state.reset()}>
        Clear all
      </button>
      {filterable.map((f) => {
        const isOpen = !collapsed.has(f.name)
        return (
          <div class="pview-facet" key={f.name}>
            <button
              type="button"
              class="pview-facet-header"
              aria-expanded={isOpen}
              onClick={() => toggleCollapse(f.name)}
            >
              <span>{f.name}</span>
              <span class="pview-facet-chev" aria-hidden="true">
                ▾
              </span>
            </button>
            <div class="pview-facet-body" aria-hidden={isOpen ? undefined : 'true'} inert={isOpen ? undefined : true}>
              <div>
                {f.type === 'category' && (
                  <CategoryFilter
                    facet={f}
                    state={state}
                    onToggle={(v) => toggleCategory(f.name, v)}
                    hasNull={state.facetsWithNull.has(f.name)}
                    onToggleNull={() => toggleCategoryNull(f.name)}
                  />
                )}
                {f.type === 'numeric' && (
                  <NumericFilter
                    facet={f}
                    state={state}
                    onChange={(lo, hi) => setRange(f.name, lo, hi)}
                    hasNull={state.facetsWithNull.has(f.name)}
                    onToggleNull={() => toggleRangeNull(f.name, f.min, f.max)}
                  />
                )}
                {f.type === 'date' && (
                  <DateFilter
                    facet={f}
                    state={state}
                    onChange={(lo, hi) => setRangeStr(f.name, lo, hi)}
                    hasNull={state.facetsWithNull.has(f.name)}
                    onToggleNull={() => toggleRangeNull(f.name, f.min, f.max)}
                  />
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CategoryFilter({
  facet,
  state,
  onToggle,
  hasNull,
  onToggleNull,
}: {
  facet: Extract<Facet, { type: 'category' }>
  state: ViewerState
  onToggle: (value: string) => void
  hasNull: boolean
  onToggleNull: () => void
}) {
  const counts = state.counts.value.get(facet.name)
  const c = state.filter.value[facet.name] as CategoryConstraint | undefined
  const selected = c?.values ?? new Set<string>()
  return (
    <ul class="pview-checkboxes">
      {facet.values.map((v) => (
        <li key={v}>
          <label>
            <input type="checkbox" checked={selected.has(v)} onChange={() => onToggle(v)} />
            {v} ({counts?.get(v) ?? 0})
          </label>
        </li>
      ))}
      {hasNull && (
        <li key="__pview_null__">
          <label>
            <input type="checkbox" checked={c?.includeNull !== false} onChange={onToggleNull} />
            (no value) ({counts?.get(NULL_KEY) ?? 0})
          </label>
        </li>
      )}
    </ul>
  )
}

function NumericFilter({
  facet,
  state,
  onChange,
  hasNull,
  onToggleNull,
}: {
  facet: Extract<Facet, { type: 'numeric' }>
  state: ViewerState
  onChange: (low: number, high: number) => void
  hasNull: boolean
  onToggleNull: () => void
}) {
  const c = state.filter.value[facet.name] as { min: number; max: number; includeNull?: boolean } | undefined
  const low = c ? c.min : facet.min
  const high = c ? c.max : facet.max
  return (
    <>
      <RangeSlider min={facet.min} max={facet.max} low={low} high={high} onChange={onChange} />
      {hasNull && (
        <label class="pview-null-toggle">
          <input type="checkbox" checked={c?.includeNull !== false} onChange={onToggleNull} />
          Include items with no value
        </label>
      )}
    </>
  )
}

function DateFilter({
  facet,
  state,
  onChange,
  hasNull,
  onToggleNull,
}: {
  facet: Extract<Facet, { type: 'date' }>
  state: ViewerState
  onChange: (low: string, high: string) => void
  hasNull: boolean
  onToggleNull: () => void
}) {
  const toMs = (iso: string) => new Date(`${iso}T00:00:00Z`).getTime()
  const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10)
  const dayMs = 86_400_000
  const minMs = toMs(facet.min)
  const maxMs = toMs(facet.max)
  const c = state.filter.value[facet.name] as { min: string; max: string; includeNull?: boolean } | undefined
  const lowMs = c ? toMs(c.min) : minMs
  const highMs = c ? toMs(c.max) : maxMs
  return (
    <>
      <RangeSlider
        min={minMs}
        max={maxMs}
        low={lowMs}
        high={highMs}
        step={dayMs}
        formatLabel={(v) => toIso(v)}
        onChange={(lo, hi) => onChange(toIso(lo), toIso(hi))}
      />
      {hasNull && (
        <label class="pview-null-toggle">
          <input type="checkbox" checked={c?.includeNull !== false} onChange={onToggleNull} />
          Include items with no value
        </label>
      )}
    </>
  )
}
