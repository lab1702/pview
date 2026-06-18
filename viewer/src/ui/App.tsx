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
    let destroyed = false
    const teardown = () => {
      if (destroyed) return
      destroyed = true
      scene.destroy()
    }
    void (async () => {
      try {
        await scene.mount(host)
        if (disposed) {
          teardown()
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
        // Tear down any partially-mounted scene before replacing the host, and
        // use textContent (not innerHTML) since the message may carry untrusted
        // bundle-derived text.
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
      <div class="pview-canvas" ref={hostRef} />
      <div class="pview-title">{bundle.title}</div>
    </div>
  )
}
