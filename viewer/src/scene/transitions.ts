export interface SpriteState {
  x: number
  y: number
  scale: number
  alpha: number
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

interface Entry {
  start: SpriteState
  target: SpriteState
  current: SpriteState
}

export class TransitionController {
  private entries = new Map<number, Entry>()
  private elapsed = 0

  constructor(private durationMs = 400) {}

  register(id: number, initial: SpriteState): void {
    this.entries.set(id, {
      start: { ...initial },
      target: { ...initial },
      current: { ...initial },
    })
  }

  setTargets(
    targets: Map<number, { x: number; y: number; scale: number }>,
    visible: Set<number>,
  ): void {
    for (const [id, e] of this.entries) {
      const t = targets.get(id)
      e.start = { ...e.current }
      e.target = {
        x: t ? t.x : e.current.x,
        y: t ? t.y : e.current.y,
        scale: t ? t.scale : e.current.scale,
        alpha: visible.has(id) ? 1 : 0,
      }
    }
    this.elapsed = 0
  }

  tick(dtMs: number): boolean {
    this.elapsed += dtMs
    const t = this.durationMs > 0 ? Math.min(1, this.elapsed / this.durationMs) : 1
    const e = easeInOutCubic(t)
    for (const entry of this.entries.values()) {
      entry.current = {
        x: lerp(entry.start.x, entry.target.x, e),
        y: lerp(entry.start.y, entry.target.y, e),
        scale: lerp(entry.start.scale, entry.target.scale, e),
        alpha: lerp(entry.start.alpha, entry.target.alpha, e),
      }
    }
    return t < 1
  }

  snap(): void {
    for (const entry of this.entries.values()) {
      entry.current = { ...entry.target }
      entry.start = { ...entry.target }
    }
    this.elapsed = this.durationMs
  }

  clear(): void {
    this.entries.clear()
    this.elapsed = 0
  }

  get(id: number): SpriteState | undefined {
    return this.entries.get(id)?.current
  }
}
