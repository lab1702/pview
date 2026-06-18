import { Application, Assets, Container, Sprite } from 'pixi.js'
import type { Bundle } from '../core/bundle'
import type { LayoutTarget } from '../core/layout/grid'
import { buildSprites, type TextureLoader } from './sprites'
import { type Camera, fitToBounds, panBy, zoomAt } from './camera'

export class Scene {
  private app = new Application()
  private world = new Container()
  private sprites = new Map<number, Sprite>()
  private cam: Camera = { x: 0, y: 0, zoom: 1 }
  private loadTexture: TextureLoader
  private dragging = false
  private lastX = 0
  private lastY = 0

  constructor(loadTexture: TextureLoader = (url) => Assets.load(url)) {
    this.loadTexture = loadTexture
  }

  async mount(el: HTMLElement): Promise<void> {
    await this.app.init({ resizeTo: el, backgroundAlpha: 0, antialias: true, preference: 'webgl' })
    el.appendChild(this.app.canvas)
    this.app.stage.addChild(this.world)
    this.attachInteraction()
    window.addEventListener('resize', this.applyCamera)
  }

  async setSprites(bundle: Bundle, baseUrl: string): Promise<void> {
    this.sprites = await buildSprites(bundle, this.world, this.loadTexture, baseUrl)
  }

  placeSprites(targets: Map<number, LayoutTarget>): void {
    for (const [id, t] of targets) {
      const sp = this.sprites.get(id)
      if (!sp) continue
      sp.position.set(t.x, t.y)
      sp.scale.set(t.scale)
    }
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
