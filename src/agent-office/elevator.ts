/** A glass lift rises from below the floor, waits for traffic, then retracts. */
export class FloorElevator {
  readonly bottom = -1.5
  height = this.bottom
  state: 'hidden' | 'rising' | 'ready' | 'lowering' = 'hidden'
  private hold = 0

  get ready() {
    return this.state === 'ready'
  }

  update(dt: number, requested: boolean, depart = false) {
    if (this.state === 'hidden' && requested) this.state = 'rising'
    if (this.state === 'rising') {
      this.height = Math.min(0, this.height + dt * 1.2)
      if (this.height === 0) {
        this.state = 'ready'
        this.hold = 1.1
      }
    } else if (this.state === 'ready') {
      this.hold = requested ? 1.1 : Math.max(0, this.hold - dt)
      if (depart || this.hold === 0) this.state = 'lowering'
    } else if (this.state === 'lowering') {
      this.height = Math.max(this.bottom, this.height - dt * 1.2)
      if (this.height === this.bottom) this.state = 'hidden'
    }
  }
}
