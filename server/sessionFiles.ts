import { readdirSync, statSync, type Stats } from 'node:fs'
import { join } from 'node:path'

const DISCOVERY_MS = 5000

/** Discover history files less often; keep polling known recent files every tick. */
export function createSessionFileIndex(root: string, depth: number, accepts: (name: string) => boolean, recentMs: number) {
  let scannedAt: number | null = null
  const recent = new Map<string, Stats>()

  return (now: number): ReadonlyMap<string, Stats> => {
    const discovering = scannedAt === null || now < scannedAt || now - scannedAt >= DISCOVERY_MS
    if (discovering) {
      recent.clear()
      const visit = (dir: string, remaining: number) => {
        let entries
        try {
          entries = readdirSync(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          const file = join(dir, entry.name)
          if (entry.isDirectory() && remaining > 0) visit(file, remaining - 1)
          else if (entry.isFile() && accepts(entry.name)) refresh(file)
        }
      }
      visit(root, depth)
      scannedAt = now
    } else {
      for (const file of recent.keys()) refresh(file)
    }
    return recent

    function refresh(file: string) {
      try {
        const st = statSync(file)
        if (st.isFile() && now - st.mtimeMs <= recentMs) {
          recent.set(file, st)
          return
        }
      } catch {
        // Files may disappear during a scan.
      }
      recent.delete(file)
    }
  }
}
