import { useEffect, useRef } from 'preact/hooks'
import { effect, useSignal } from '@preact/signals'
import type { Bundle } from '../core/bundle'
import { gridLayout } from '../core/layout/grid'
import { histogramLayout } from '../core/layout/histogram'
import { Scene } from '../scene/Scene'
import { createViewerState } from './state'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { EmptyState } from './EmptyState'
import { DetailCard } from './DetailCard'

export function App({ bundle, baseUrl }: { bundle: Bundle; baseUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(createViewerState(bundle))
  const state = stateRef.current
  const focusRect = useSignal({ cx: 0, cy: 0, size: 0, progress: 0 })

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new Scene()
    let disposed = false
    let destroyed = false
    const disposers: Array<() => void> = []
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') state.selectedId.value = null
    }
    const teardown = () => {
      if (destroyed) return
      destroyed = true
      for (const d of disposers) d()
      window.removeEventListener('keydown', onKey)
      scene.destroy()
    }
    window.addEventListener('keydown', onKey)

    const columns = Math.max(1, Math.ceil(Math.sqrt(bundle.items.length)))
    const gap = Math.round(bundle.tileSize * 0.08)
    const barGap = Math.round(bundle.tileSize * 0.5)

    const computeLayout = (): {
      targets: Map<number, { x: number; y: number; scale: number }>
      bounds: { w: number; h: number }
      center?: { x: number; y: number }
    } => {
      if (state.view.value === 'histogram' && state.histogramFacet.value) {
        const facet = bundle.facets.find((f) => f.name === state.histogramFacet.value)
        if (facet) {
          const r = histogramLayout(state.sortedVisible.value, bundle.items, facet, {
            tileSize: bundle.tileSize,
            gap,
            barGap,
          })
          scene.setBars(r.bars)
          return { targets: r.targets, bounds: r.bounds, center: { x: r.bounds.w / 2, y: -r.bounds.h / 2 } }
        }
      }
      scene.setBars([])
      const g = gridLayout(state.sortedVisible.value, { columns, tileSize: bundle.tileSize, gap })
      return { targets: g.targets, bounds: g.bounds }
    }

    void (async () => {
      try {
        await scene.mount(host)
        if (disposed) return teardown()
        await scene.setSprites(bundle, baseUrl)
        scene.onSelect = (id) => {
          state.selectedId.value = id
        }
        scene.onFocusRect = (r) => {
          focusRect.value = r
        }
        const first = computeLayout()
        scene.setLayout(first.targets, new Set(state.visibleIds.value), false)
        scene.frame(first.bounds, first.center)

        // Re-layout on filter/sort/search/view changes, then re-fit the camera
        // every time so all cards stay centered and in view — the same framing
        // used on first load, whether cards were added, removed, or moved.
        disposers.push(
          effect(() => {
            const r = computeLayout()
            scene.setLayout(r.targets, new Set(state.visibleIds.value))
            scene.frame(r.bounds, r.center, true)
          }),
        )
        // selection -> camera focus / reset
        disposers.push(
          effect(() => {
            const id = state.selectedId.value
            if (id !== null) scene.focusOn(id)
            else scene.focusReset()
          }),
        )
        // deselect whenever the layout identity or visible set changes
        disposers.push(
          effect(() => {
            // subscribe to the layout-affecting signals
            void state.view.value
            void state.histogramFacet.value
            void state.filter.value
            void state.sort.value
            void state.query.value
            state.selectedId.value = null
          }),
        )
      } catch (err) {
        teardown()
        const div = document.createElement('div')
        div.className = 'pview-error'
        div.textContent = `pview: ${(err as Error).message}`
        host.replaceChildren(div)
      }
    })()
    return () => {
      disposed = true
      teardown()
    }
  }, [bundle, baseUrl])

  const selectedItem =
    state.selectedId.value !== null
      ? bundle.items.find((it) => it.id === state.selectedId.value) ?? null
      : null

  return (
    <div class="pview-root">
      <Topbar bundle={bundle} state={state} />
      <div class="pview-body">
        <Sidebar bundle={bundle} state={state} />
        <div class="pview-canvas" ref={hostRef} />
      </div>
      {state.visibleIds.value.size === 0 && <EmptyState onClear={() => state.reset()} />}
      {selectedItem && (
        <DetailCard
          item={selectedItem}
          baseUrl={baseUrl}
          rect={focusRect}
          nameKey={bundle.cardFields[0] ?? ''}
          fieldOrder={bundle.facets.map((f) => f.name)}
          onClose={() => (state.selectedId.value = null)}
        />
      )}
    </div>
  )
}
