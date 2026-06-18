import { useEffect, useRef } from 'preact/hooks'
import { effect } from '@preact/signals'
import type { Bundle } from '../core/bundle'
import { gridLayout } from '../core/layout/grid'
import { histogramLayout } from '../core/layout/histogram'
import { Scene } from '../scene/Scene'
import { createViewerState } from './state'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { EmptyState } from './EmptyState'

export function App({ bundle, baseUrl }: { bundle: Bundle; baseUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef(createViewerState(bundle))
  const state = stateRef.current

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new Scene()
    let disposed = false
    let destroyed = false
    let disposeEffect: (() => void) | undefined
    const teardown = () => {
      if (destroyed) return
      destroyed = true
      disposeEffect?.()
      scene.destroy()
    }
    const columns = Math.max(1, Math.ceil(Math.sqrt(bundle.items.length)))
    const gap = Math.round(bundle.tileSize * 0.08)
    const barGap = Math.round(bundle.tileSize * 0.5)

    // Compute the active layout, push bars to the scene, return targets + bounds + frame center.
    // Histogram content stacks upward into negative Y, so it needs an explicit
    // camera center; grid content spans [0,w]×[0,h] and uses the default center.
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

    let lastMode = ''

    void (async () => {
      try {
        await scene.mount(host)
        if (disposed) return teardown()
        await scene.setSprites(bundle, baseUrl)
        const first = computeLayout()
        scene.setLayout(first.targets, new Set(state.visibleIds.value), false)
        scene.frame(first.bounds, first.center)
        lastMode = `${state.view.value}:${state.histogramFacet.value}`
        disposeEffect = effect(() => {
          const r = computeLayout()
          scene.setLayout(r.targets, new Set(state.visibleIds.value))
          const mode = `${state.view.value}:${state.histogramFacet.value}`
          if (mode !== lastMode) {
            scene.frame(r.bounds, r.center)
            lastMode = mode
          }
        })
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

  return (
    <div class="pview-root">
      <Topbar bundle={bundle} state={state} />
      <div class="pview-body">
        <Sidebar bundle={bundle} state={state} />
        <div class="pview-canvas" ref={hostRef} />
      </div>
      {state.visibleIds.value.size === 0 && <EmptyState onClear={() => state.reset()} />}
    </div>
  )
}
