import { useEffect, useState } from 'react'

interface Props {
  /** Rendered height in px; width follows the brain's aspect ratio. */
  height?: number
}

// Low-poly brain (facing left) traced to resemble a neural-graph logo:
// a handful of nodes joined by wireframe lines, in viewBox units (120 × 76).
export const NODES: [number, number][] = [
  [18, 26], // 0  frontal-upper
  [40, 10], // 1  top peak A
  [60, 18], // 2  top saddle
  [80, 9], // 3  top peak B
  [100, 20], // 4  upper-right
  [113, 40], // 5  right
  [106, 58], // 6  lower-right (cerebellum back)
  [88, 68], // 7  bottom-right
  [66, 70], // 8  bottom-mid
  [44, 67], // 9  bottom-left-mid
  [24, 58], // 10 lower-left
  [6, 42], // 11 frontal tip (far left)
  [34, 32], // 12 interior
  [54, 34], // 13 interior
  [74, 30], // 14 interior
  [94, 36], // 15 interior
  [44, 48], // 16 interior
  [64, 48], // 17 interior
  [84, 50], // 18 interior
  [54, 60], // 19 interior lower
  [98, 50], // 20 cerebellum interior
]

export const EDGES: [number, number][] = [
  // outline
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [4, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [8, 9],
  [9, 10],
  [10, 11],
  [11, 0],
  // triangulation
  [0, 12],
  [11, 12],
  [10, 12],
  [1, 12],
  [1, 13],
  [2, 13],
  [12, 13],
  [2, 14],
  [3, 14],
  [13, 14],
  [3, 15],
  [4, 15],
  [14, 15],
  [5, 15],
  [12, 16],
  [13, 16],
  [10, 16],
  [9, 16],
  [13, 17],
  [14, 17],
  [16, 17],
  [14, 18],
  [15, 18],
  [17, 18],
  [18, 20],
  [15, 20],
  [5, 20],
  [6, 20],
  [16, 19],
  [9, 19],
  [17, 19],
  [19, 8],
  [18, 8],
  [18, 7],
  [20, 7],
]

// ── Adjacency, used to walk packets along real edges ─────────────────────────
const ADJ: number[][] = NODES.map(() => [])
EDGES.forEach(([a, b]) => {
  ADJ[a].push(b)
  ADJ[b].push(a)
})
ADJ.forEach((l) => l.sort((x, y) => x - y))

// Deterministic walk from `start`, always stepping to a neighbour (never the
// node we just came from) so the packet wanders without immediately doubling back.
function buildPath(start: number, steps: number): number[] {
  const path = [start]
  let prev = -1
  let cur = start
  for (let i = 0; i < steps; i++) {
    const ns = ADJ[cur].filter((n) => n !== prev)
    const nx = ns.length ? ns[i % ns.length] : ADJ[cur][0]
    path.push(nx)
    prev = cur
    cur = nx
  }
  return path
}

// Six packets, each starting from a node spread around the brain so they glide
// across different regions; staggered offsets keep them out of sync.
const PACKET_STARTS = [11, 4, 8, 1, 6, 2]
const PACKET_OFFSETS = [0, 1700, 3300, 900, 2500, 4100]
export const PACKET_PATHS: number[][] = PACKET_STARTS.map((s) => buildPath(s, 48))
const PACKET_SPEED = 0.0014 // path-segments per ms (~700ms per edge)

/** Position of a packet riding `path` at time t (ms). Pure — used by tests. */
export function packetPosition(path: number[], t: number): [number, number] {
  const span = path.length - 1
  const p = (((t * PACKET_SPEED) % span) + span) % span
  const seg = Math.floor(p)
  const fr = p - seg
  const [ax, ay] = NODES[path[seg]]
  const [bx, by] = NODES[path[seg + 1]]
  return [ax + (bx - ax) * fr, ay + (by - ay) * fr]
}

/**
 * App logo: a crisp SVG low-poly neural brain — nodes joined by glowing
 * wireframe lines, with a handful of bright "data packets" gliding slowly
 * along the edges (a miniature of the homepage brain). No WebGL.
 */
export function BrainLogo({ height = 26 }: Props) {
  const width = height * 1.58
  const [t, setT] = useState(0)

  useEffect(() => {
    let raf = 0
    const loop = (now: number) => {
      setT(now)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 120 76"
      fill="none"
      style={{ flexShrink: 0, display: 'block', overflow: 'visible' }}
      aria-label="OZOS Brain"
    >
      <defs>
        <filter id="bl-glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="1.3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g filter="url(#bl-glow)">
        <g stroke="#2ee6e6" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          {EDGES.map(([a, b], i) => (
            <line key={i} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} />
          ))}
        </g>

        {/* Dimmer single dots so the gliding packets read clearly. */}
        {NODES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1.9} fill="#2ee6e6" opacity={0.6} />
        ))}

        {/* Gliding data packets */}
        {PACKET_PATHS.map((path, pi) => {
          const [px, py] = packetPosition(path, t + PACKET_OFFSETS[pi])
          return (
            <g key={`pk-${pi}`}>
              <circle cx={px} cy={py} r={3.6} fill="#aafcff" opacity={0.5} />
              <circle cx={px} cy={py} r={2.0} fill="#ffffff" />
            </g>
          )
        })}
      </g>
    </svg>
  )
}
