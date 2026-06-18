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

  private attachInteraction(): void {
    const canvas = this.app.canvas
    let dragging = false
    let lastX = 0
    let lastY = 0
    canvas.addEventListener('pointerdown', (e) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    })
    window.addEventListener('pointerup', () => {
      dragging = false
    })
    window.addEventListener('pointermove', (e) => {
      if (!dragging) return
      this.cam = panBy(this.cam, e.clientX - lastX, e.clientY - lastY)
      lastX = e.clientX
      lastY = e.clientY
      this.applyCamera()
    })
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const rect = canvas.getBoundingClientRect()
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        this.cam = zoomAt(this.cam, e.clientX - rect.left, e.clientY - rect.top, factor, this.viewport())
        this.applyCamera()
      },
      { passive: false },
    )
  }

  destroy(): void {
    window.removeEventListener('resize', this.applyCamera)
    this.app.destroy(true)
  }
}
