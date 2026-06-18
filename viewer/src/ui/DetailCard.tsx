import { useEffect, useState } from 'preact/hooks'
import type { Item } from '../core/bundle'
import { resolveAtlasUrl } from '../scene/urls'
import { generatedColor } from '../core/cardcolor'

interface Props {
  item: Item
  baseUrl: string
  rect: { cx: number; cy: number; size: number; progress: number }
  onClose: () => void
}

export function DetailCard({ item, baseUrl, rect, onClose }: Props) {
  const [imgError, setImgError] = useState(false)
  // Reset the broken-image flag when a different item is shown — the parent
  // patches one DetailCard instance across selections, so a prior error must
  // not suppress the next item's image.
  useEffect(() => {
    setImgError(false)
  }, [item.id])
  const width = Math.max(240, Math.min(rect.size, 520))
  const opacity = Math.max(0, Math.min(1, (rect.progress - 0.3) / 0.5))
  const headerName = String(item.values[Object.keys(item.values)[0]] ?? '')

  return (
    <div
      class="pview-detail"
      style={{
        left: `${rect.cx}px`,
        top: `${rect.cy}px`,
        width: `${width}px`,
        transform: 'translate(-50%, -50%)',
        opacity: String(opacity),
      }}
    >
      <button type="button" class="pview-detail-close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <div class="pview-detail-image">
        {item.detail && !imgError ? (
          <img src={resolveAtlasUrl(item.detail, baseUrl)} alt={headerName} onError={() => setImgError(true)} />
        ) : (
          <div class="pview-detail-generated" style={{ background: generatedColor(item.id) }}>
            {headerName}
          </div>
        )}
      </div>
      <dl class="pview-detail-attrs">
        {Object.entries(item.values).map(([k, v]) => (
          <div class="pview-detail-row" key={k}>
            <dt>{k}</dt>
            <dd>{String(v)}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}
