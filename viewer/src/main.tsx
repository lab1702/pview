import { render } from 'preact'
import './styles.css'
import { parseBundle, type Bundle } from './core/bundle'
import { App } from './ui/App'

async function loadBundleJson(): Promise<{ json: unknown; baseUrl: string }> {
  const inlined = document.getElementById('pview-data')
  if (inlined?.textContent) {
    return { json: JSON.parse(inlined.textContent), baseUrl: '' }
  }
  const baseUrl = import.meta.env.DEV ? '/fixtures/' : './'
  const resp = await fetch(baseUrl + 'data.json')
  if (!resp.ok) throw new Error(`failed to load data.json (${resp.status})`)
  return { json: await resp.json(), baseUrl }
}

function showError(message: string): void {
  const el = document.getElementById('app')
  if (!el) return
  // textContent (not innerHTML): the message may contain values from an
  // untrusted bundle (e.g. a bad atlas path echoed by a loader error).
  const div = document.createElement('div')
  div.className = 'pview-error'
  div.textContent = message
  el.replaceChildren(div)
}

async function boot(): Promise<void> {
  const root = document.getElementById('app')
  if (!root) return
  try {
    const { json, baseUrl } = await loadBundleJson()
    const bundle: Bundle = parseBundle(json)
    render(<App bundle={bundle} baseUrl={baseUrl} />, root)
  } catch (err) {
    showError(`pview: ${(err as Error).message}`)
  }
}

void boot()
