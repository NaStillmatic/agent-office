/** A glass lift rises from below the floor, waits for traffic, then retracts. */
export class FloorElevator {
  readonly bottom = -1.5
  readonly travelTime = 1.4
  height = this.bottom
  state: 'hidden' | 'rising' | 'ready' | 'lowering' = 'hidden'
  private hold = 0
  private travel = 0

  get ready() {
    return this.state === 'ready'
  }

  update(dt: number, requested: boolean, depart = false) {
    if (this.state === 'hidden' && requested) {
      this.state = 'rising'
      this.travel = 0
    }
    if (this.state === 'rising') {
      this.travel = Math.min(this.travelTime, this.travel + Math.max(0, dt))
      const t = this.travel / this.travelTime
      this.height = this.bottom * (1 - t * t * (3 - 2 * t))
      if (this.travel === this.travelTime) {
        this.height = 0
        this.state = 'ready'
        this.hold = 1.1
      }
    } else if (this.state === 'ready') {
      this.hold = requested ? 1.1 : Math.max(0, this.hold - dt)
      if (depart || this.hold === 0) {
        this.state = 'lowering'
        this.travel = 0
      }
    } else if (this.state === 'lowering') {
      this.travel = Math.min(this.travelTime, this.travel + Math.max(0, dt))
      const t = this.travel / this.travelTime
      this.height = this.bottom * t * t * (3 - 2 * t)
      if (this.travel === this.travelTime) this.state = 'hidden'
    }
  }
}

/** Allow one visible arrival in the cabin at a time. */
export function arrivalCanAppear(
  cabin: { x: number; z: number },
  others: readonly { x: number; z: number; entering: boolean; visible: boolean; removed: boolean }[],
) {
  return !others.some(other => other.entering && other.visible && !other.removed
    && Math.hypot(other.x - cabin.x, other.z - cabin.z) < 0.85)
}
