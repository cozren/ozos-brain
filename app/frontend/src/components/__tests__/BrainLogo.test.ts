import { describe, it, expect } from 'vitest'
import { EDGES, NODES, PACKET_PATHS, packetPosition } from '../BrainLogo'

const edgeKey = (a: number, b: number) => (a < b ? `${a},${b}` : `${b},${a}`)
const EDGE_SET = new Set(EDGES.map(([a, b]) => edgeKey(a, b)))

describe('brain gliding-packet motion', () => {
  it('defines six packets', () => {
    expect(PACKET_PATHS).toHaveLength(6)
  })

  it('every packet hop follows a real wireframe edge', () => {
    for (const path of PACKET_PATHS) {
      expect(path.length).toBeGreaterThan(1)
      for (let i = 0; i < path.length - 1; i++) {
        expect(EDGE_SET.has(edgeKey(path[i], path[i + 1]))).toBe(true)
      }
    }
  })

  it('packet sits on its first node at t=0 and stays on the segment between nodes', () => {
    const path = PACKET_PATHS[0]

    const start = packetPosition(path, 0)
    expect(start[0]).toBeCloseTo(NODES[path[0]][0])
    expect(start[1]).toBeCloseTo(NODES[path[0]][1])

    // Partway along the first edge, the packet is collinear with its endpoints.
    const mid = packetPosition(path, 357) // ~0.5 of the first segment
    const [ax, ay] = NODES[path[0]]
    const [bx, by] = NODES[path[1]]
    const cross = (mid[0] - ax) * (by - ay) - (mid[1] - ay) * (bx - ax)
    expect(cross).toBeCloseTo(0)
  })

  it('packet advances along its path as time passes', () => {
    const a = packetPosition(PACKET_PATHS[0], 0)
    const b = packetPosition(PACKET_PATHS[0], 250)
    expect(a[0] !== b[0] || a[1] !== b[1]).toBe(true)
  })
})
