import type { Bundle } from '../core/bundle'
import type { ViewerState } from './state'

export function Topbar({ bundle, state }: { bundle: Bundle; state: ViewerState }) {
  const sortable = bundle.facets.filter((f) => f.type !== 'text' || f.name === bundle.cardFields[0])
  const bucketable = bundle.facets.filter(
    (f) => f.type === 'category' || f.type === 'numeric' || f.type === 'date',
  )
  const total = bundle.items.length
  const visible = state.visibleIds.value.size

  return (
    <div class="pview-topbar">
      <span class="pview-topbar-title">{bundle.title}</span>
      <input
        class="pview-search"
        type="search"
        placeholder="Search…"
        value={state.query.value}
        onInput={(e) => {
          state.query.value = (e.target as HTMLInputElement).value
        }}
      />
      <div class="pview-view-toggle" role="group" aria-label="View">
        <button
          type="button"
          aria-pressed={state.view.value === 'grid'}
          onClick={() => (state.view.value = 'grid')}
        >
          Grid
        </button>
        <button
          type="button"
          aria-pressed={state.view.value === 'histogram'}
          disabled={bucketable.length === 0}
          onClick={() => (state.view.value = 'histogram')}
        >
          Histogram
        </button>
      </div>
      {state.view.value === 'histogram' && (
        <label class="pview-groupby">
          Group by:
          <select
            value={state.histogramFacet.value ?? ''}
            onChange={(e) => {
              state.histogramFacet.value = (e.target as HTMLSelectElement).value || null
            }}
          >
            {bucketable.map((f) => (
              <option key={f.name} value={f.name}>{f.name}</option>
            ))}
          </select>
        </label>
      )}
      <label class="pview-sort">
        Sort:
        <select
          value={state.sort.value.facet ?? ''}
          onChange={(e) => {
            const facet = (e.target as HTMLSelectElement).value || null
            state.sort.value = { ...state.sort.value, facet }
          }}
        >
          <option value="">—</option>
          {sortable.map((f) => (
            <option key={f.name} value={f.name}>{f.name}</option>
          ))}
        </select>
        <button
          type="button"
          aria-label={`Sort direction: ${state.sort.value.dir === 'asc' ? 'ascending' : 'descending'}`}
          onClick={() => {
            state.sort.value = {
              ...state.sort.value,
              dir: state.sort.value.dir === 'asc' ? 'desc' : 'asc',
            }
          }}
        >
          {state.sort.value.dir === 'asc' ? '↑' : '↓'}
        </button>
      </label>
      <span class="pview-count">
        {visible.toLocaleString()} of {total.toLocaleString()}
      </span>
    </div>
  )
}
