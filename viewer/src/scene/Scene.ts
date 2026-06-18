import { Application, Assets, Container, Sprite, Text } from 'pixi.js'
import type { Bundle } from '../core/bundle'
import type { LayoutTarget } from '../core/layout/grid'
import { buildSprites, type TextureLoader } from './sprites'
import {
  type Camera,
  fitToBounds,
  lerpCamera,
  MAX_ZOOM,
  panBy,
  screenToWorld,
  worldToScreen,
  zoomAt,
} from './camera'
import { hitTest, type HitEntry } from '../core/hittest'
import { TransitionController, easeInOutCubic } from './transitions'

const CAM_DURATION = 400

export class Scene {
  private app = new Application()
  private world = new Container()
  private sprites = new Map<number, Sprite>()
  private cam: Camera = { x: 0, y: 0, zoom: 1 }
  private transitions = new TransitionController()
  private loadTexture: TextureLoader
  private labelLayer = new Container()
  private labels: Text[] = []
  private dragging = false
  private lastX = 0
  private lastY = 0
  private settled = false
  private tileSize = 256
  private downX = 0
  private downY = 0
  private moved = false
  private focusedId: number | null = null
  private camFrom: Camera | null = null
  private camTo: Camera | null = null
  private camElapsed = 0
  private prefocusCam: Camera | null = null
  onSelect: ((id: number | null) => void) | null = null
  onFocusRect: ((r: { cx: number; cy: number; size: number; progress: number }) => void) | null = null

  constructor(loadTexture: TextureLoader = (url) => Assets.load(url)) {
    this.loadTexture = loadTexture
  }

  async mount(el: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: el, backgroundAlpha: 0, antialias: true, preference: 'webgl' })
    el.appendChild(this.app.canvas)
    this.app.stage.addChild(this.world)
    this.world.sortableChildren = true
    this.labelLayer.zIndex = 1000
    this.world.addChild(this.labelLayer)
    this.app.ticker.add(this.onTick)
    this.attachInteraction()
    window.addEventListener('resize', this.applyCamera)
  }

  async setSprites(bundle: Bundle, baseUrl: string): Promise<void> {
    this.transitions.clear()
    this.tileSize = bundle.tileSize
    this.sprites = await buildSprites(bundle, this.world, this.loadTexture, baseUrl)
    for (const [id, sp] of this.sprites) {
      this.transitions.register(id, { x: sp.position.x, y: sp.position.y, scale: sp.scale.x, alpha: 1 })
    }
  }

  pick(sx: number, sy: number): number | null {
    const world = screenToWorld(this.cam, sx, sy, this.viewport())
    const entries: HitEntry[] = []
    for (const [id, sp] of this.sprites) {
      entries.push({ id, x: sp.position.x, y: sp.position.y, alpha: sp.alpha })
    }
    return hitTest(world.x, world.y, entries, this.tileSize)
  }

  focusOn(id: number): void {
    const sp = this.sprites.get(id)
    if (!sp) return
    this.focusedId = id
    if (!this.prefocusCam) this.prefocusCam = { ...this.cam }
    const vp = this.viewport()
    const zoom = Math.min(MAX_ZOOM, (Math.min(vp.width, vp.height) / this.tileSize) * 0.8)
    this.startCamTween({ x: sp.position.x, y: sp.position.y, zoom })
  }

  focusReset(): void {
    this.focusedId = null
    if (this.prefocusCam) {
      this.startCamTween(this.prefocusCam)
      this.prefocusCam = null
    }
  }

  private startCamTween(to: Camera): void {
    this.camFrom = { ...this.cam }
    this.camTo = to
    this.camElapsed = 0
  }

  setLayout(targets: Map<number, LayoutTarget>, visible: Set<number>, animate = true): void {
    this.transitions.setTargets(targets, visible)
    if (!animate) this.transitions.snap()
    this.settled = false
  }

  setBars(bars: { label: string; x: number; count: number }[]): void {
    while (this.labels.length < bars.length) {
      const t = new Text({
        text: '',
        style: { fill: 0xdddddd, fontFamily: 'sans-serif', fontSize: 14, align: 'center' },
      })
      t.anchor.set(0.5, 0)
      this.labelLayer.addChild(t)
      this.labels.push(t)
    }
    for (const t of this.labels) t.visible = false
    bars.forEach((bar, i) => {
      const t = this.labels[i]
      t.text = `${bar.label}\n${bar.count.toLocaleString()}`
      t.position.set(bar.x, 8)
      t.visible = true
    })
    this.applyLabelScale()
  }

  private applyLabelScale(): void {
    const inv = 1 / this.cam.zoom
    for (const t of this.labels) {
      if (t.visible) t.scale.set(inv)
    }
  }

  private onTick = (): void => {
    const active = this.transitions.tick(this.app.ticker.deltaMS)
    if (!(this.settled && !active)) {
      for (const [id, sp] of this.sprites) {
        const s = this.transitions.get(id)
        if (!s) continue
        sp.position.set(s.x, s.y)
        sp.scale.set(s.scale)
        sp.alpha = s.alpha
        sp.visible = s.alpha > 0.01
      }
      this.settled = !active
    }
    if (this.camFrom && this.camTo) {
      this.camElapsed += this.app.ticker.deltaMS
      const t = Math.min(1, this.camElapsed / CAM_DURATION)
      this.cam = lerpCamera(this.camFrom, this.camTo, easeInOutCubic(t))
      this.applyCamera()
      if (t >= 1) {
        this.camFrom = null
        this.camTo = null
      }
    }
  }

  frame(bounds: { w: number; h: number }, center?: { x: number; y: number }): void {
    // An explicit re-frame is authoritative: cancel any in-flight focus tween
    // and drop the stale pre-focus camera/selection, so a focused→re-frame
    // (e.g. switching grid↔histogram while a card is focused) lands on the NEW
    // layout's framing rather than tweening back to the old one.
    this.camFrom = null
    this.camTo = null
    this.prefocusCam = null
    this.focusedId = null
    this.cam = fitToBounds(bounds, this.viewport(), 0.9, center)
    this.applyCamera()
  }

  private viewport() {
    return { width: this.app.renderer.width, height: this.app.renderer.height }
  }

  private applyCamera = (): void => {
    const vp = this.viewport()
    this.world.scale.set(this.cam.zoom)
    this.world.position.set(
      vp.width / 2 - this.cam.x * this.cam.zoom,
      vp.height / 2 - this.cam.y * this.cam.zoom,
    )
    this.applyLabelScale()
    this.emitFocusRect()
  }

  private emitFocusRect(): void {
    if (this.focusedId === null || !this.onFocusRect) return
    const sp = this.sprites.get(this.focusedId)
    if (!sp) return
    const s = worldToScreen(this.cam, sp.position.x, sp.position.y, this.viewport())
    const progress = this.camTo ? Math.min(1, this.camElapsed / CAM_DURATION) : 1
    this.onFocusRect({ cx: s.x, cy: s.y, size: this.tileSize * this.cam.zoom, progress })
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true
    this.moved = false
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.downX = e.clientX
    this.downY = e.clientY
  }

  private onPointerUp = (): void => {
    if (this.dragging && !this.moved) {
      const rect = this.app.canvas.getBoundingClientRect()
      this.onSelect?.(this.pick(this.downX - rect.left, this.downY - rect.top))
    }
    this.dragging = false
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return
    if (!this.moved && Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 3) {
      this.moved = true
    }
    this.cam = panBy(this.cam, e.clientX - this.lastX, e.clientY - this.lastY)
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.applyCamera()
    this.camFrom = null
    this.camTo = null
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const rect = this.app.canvas.getBoundingClientRect()
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    this.cam = zoomAt(this.cam, e.clientX - rect.left, e.clientY - rect.top, factor, this.viewport())
    this.applyCamera()
    this.camFrom = null
    this.camTo = null
  }

  private attachInteraction(): void {
    const canvas = this.app.canvas
    canvas.addEventListener('pointerdown', this.onPointerDown)
    canvas.addEventListener('wheel', this.onWheel, { passive: false })
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointermove', this.onPointerMove)
  }

  destroy(): void {
    const canvas = this.app.canvas
    canvas.removeEventListener('pointerdown', this.onPointerDown)
    canvas.removeEventListener('wheel', this.onWheel)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('resize', this.applyCamera)
    this.app.destroy(true)
  }
}
