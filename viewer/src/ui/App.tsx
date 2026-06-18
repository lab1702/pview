import { useEffect, useRef } from 'preact/hooks'
import type { Bundle } from '../core/bundle'
import { gridLayout } from '../core/layout/grid'
import { Scene } from '../scene/Scene'

export function App({ bundle, baseUrl }: { bundle: Bundle; baseUrl: string }) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const scene = new Scene()
    let disposed = false
    void (async () => {
      try {
        await scene.mount(host)
        if (disposed) {
          scene.destroy()
          return
        }
        await scene.setSprites(bundle, baseUrl)
        const columns = Math.max(1, Math.ceil(Math.sqrt(bundle.items.length)))
        const { targets, bounds } = gridLayout(
          bundle.items.map((it) => it.id),
          { columns, tileSize: bundle.tileSize, gap: Math.round(bundle.tileSize * 0.08) },
        )
        scene.placeSprites(targets)
        scene.frame(bounds)
      } catch (err) {
        host.innerHTML = `<div class="pview-error">pview: ${(err as Error).message}</div>`
      }
    })()
    return () => {
      disposed = true
      scene.destroy()
    }
  }, [bundle, baseUrl])

  return (
    <div class="pview-root">
      <div class="pview-canvas" ref={hostRef} />
      <div class="pview-title">{bundle.title}</div>
    </div>
  )
}
