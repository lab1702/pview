import { Application, Assets, Container, Sprite } from 'pixi.js'
import type { Bundle } from '../core/bundle'
import type { LayoutTarget } from '../core/layout/grid'
import { buildSprites, type TextureLoader } from './sprites'
import { type Camera, fitToBounds, panBy, zoomAt } from './camera'
import { TransitionController } from './transitions'

export class Scene {
  private app = new Application()
  private world = new Container()
  private sprites = new Map<number, Sprite>()
  private cam: Camera = { x: 0, y: 0, zoom: 1 }
  private transitions = new TransitionController()
  private loadTexture: TextureLoader
  private dragging = false
  private lastX = 0
  private lastY = 0
  private settled = false

  constructor(loadTexture: TextureLoader = (url) => Assets.load(url)) {
    this.loadTexture = loadTexture
  }

  async mount(el: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: el, backgroundAlpha: 0, antialias: true, preference: 'webgl' })
    el.appendChild(this.app.canvas)
    this.app.stage.addChild(this.world)
    this.app.ticker.add(this.onTick)
    this.attachInteraction()
    window.addEventListener('resize', this.applyCamera)
  }

  async setSprites(bundle: Bundle, baseUrl: string): Promise<void> {
    this.transitions.clear()
    this.sprites = await buildSprites(bundle, this.world, this.loadTexture, baseUrl)
    for (const [id, sp] of this.sprites) {
      this.transitions.register(id, { x: sp.position.x, y: sp.position.y, scale: sp.scale.x, alpha: 1 })
    }
  }

  setLayout(targets: Map<number, LayoutTarget>, visible: Set<number>, animate = true): void {
    this.transitions.setTargets(targets, visible)
    if (!animate) this.transitions.snap()
    this.settled = false
  }

  private onTick = (): void => {
    const active = this.transitions.tick(this.app.ticker.deltaMS)
    if (this.settled && !active) return
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

  frame(bounds: { w: number; h: number }): void {
    this.cam = fitToBounds(bounds, this.viewport())
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
  }

  private onPointerDown = (e: PointerEvent): void => {
    this.dragging = true
    this.lastX = e.clientX
    this.lastY = e.clientY
  }

  private onPointerUp = (): void => {
    this.dragging = false
  }

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.dragging) return
    this.cam = panBy(this.cam, e.clientX - this.lastX, e.clientY - this.lastY)
    this.lastX = e.clientX
    this.lastY = e.clientY
    this.applyCamera()
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault()
    const rect = this.app.canvas.getBoundingClientRect()
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    this.cam = zoomAt(this.cam, e.clientX - rect.left, e.clientY - rect.top, factor, this.viewport())
    this.applyCamera()
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
