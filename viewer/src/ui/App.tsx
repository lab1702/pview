import { useEffect, useRef } from 'preact/hooks'
import { effect } from '@preact/signals'
import type { Bundle } from '../core/bundle'
import { gridLayout } from '../core/layout/grid'
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

    void (async () => {
      try {
        await scene.mount(host)
        if (disposed) return teardown()
        await scene.setSprites(bundle, baseUrl)
        // initial instant layout + frame
        const first = gridLayout(state.sortedVisible.value, {
          columns,
          tileSize: bundle.tileSize,
          gap,
        })
        scene.setLayout(first.targets, new Set(state.visibleIds.value), false)
        scene.frame(first.bounds)
        // reactive re-layout on filter/sort/search changes
        disposeEffect = effect(() => {
          const { targets } = gridLayout(state.sortedVisible.value, {
            columns,
            tileSize: bundle.tileSize,
            gap,
          })
          scene.setLayout(targets, new Set(state.visibleIds.value))
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
