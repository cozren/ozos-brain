import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'

// ── Brain surface radial function ────────────────────────────────────────────
// r(theta, phi) → radius of brain surface at that spherical angle.
// +Y = crown  |  +X = frontal lobe  |  +Z = right hemisphere (camera side)
function brainR(theta: number, phi: number): number {
  const cosT = Math.cos(theta),
    sinT = Math.sin(theta)
  const cosP = Math.cos(phi),
    sinP = Math.sin(phi)

  const ax = 1.52,
    ay = 1.0,
    az = 0.88
  const ex = (sinT * cosP) / ax,
    ey = cosT / ay,
    ez = (sinT * sinP) / az
  let r = 1.0 / Math.sqrt(ex * ex + ey * ey + ez * ez)

  if (cosT < 0) r *= 1.0 + 0.42 * cosT
  r += 0.07 * Math.max(0, cosP) * sinT * (1.0 - theta / Math.PI)
  r += 0.06 * Math.max(0, -cosP) * Math.pow(sinT, 0.8)
  r += 0.05 * Math.exp(-7.0 * (theta - 0.25 * Math.PI) ** 2)

  const dTa = phi - Math.PI / 3.5,
    dTb = phi - (2 * Math.PI - Math.PI / 3.5)
  r +=
    0.045 *
    (Math.exp(-5 * dTa ** 2) + Math.exp(-5 * dTb ** 2)) *
    Math.exp(-10 * (theta - 0.64 * Math.PI) ** 2)
  r -= 0.13 * Math.exp(-9 * (theta - 0.56 * Math.PI) ** 2) * sinP * sinP

  r += 0.08 * Math.sin(4.6 * theta + 1.7) * Math.cos(3.9 * phi + 0.8)
  r += 0.055 * Math.sin(7.4 * theta - 1.1) * Math.cos(6.7 * phi + 2.5)
  r += 0.038 * Math.sin(10.8 * theta + 2.0) * Math.cos(3.2 * phi - 1.2)
  r += 0.025 * Math.sin(3.2 * theta + 4.8) * Math.cos(10.5 * phi + 0.4)
  r += 0.015 * Math.sin(14.0 * theta - 0.7) * Math.cos(5.1 * phi + 3.6)
  r += 0.01 * Math.sin(6.5 * theta + 3.1) * Math.cos(8.3 * phi - 0.9)

  return r
}

function sampleSurface(target: number, minD = 0.11): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [],
    MIN_D = minD,
    MAX = target * 30
  for (let n = 0; n < MAX && pts.length < target; n++) {
    const theta = Math.acos(2 * Math.random() - 1)
    const phi = Math.random() * Math.PI * 2
    if (theta > Math.PI * 0.81) continue
    const r = brainR(theta, phi),
      st = Math.sin(theta)
    const p = new THREE.Vector3(r * st * Math.cos(phi), r * Math.cos(theta), r * st * Math.sin(phi))
    let ok = true
    for (const q of pts) {
      if (p.distanceTo(q) < MIN_D) {
        ok = false
        break
      }
    }
    if (ok) pts.push(p)
  }
  return pts
}

interface Edge {
  a: number
  b: number
}

function buildGraph(pts: THREE.Vector3[], edgeScale = 1) {
  const SHORT = 0.32 * edgeScale,
    LONG = 0.68 * edgeScale,
    K_S = 5,
    K_L = 2
  const shortEdges: Edge[] = [],
    longEdges: Edge[] = [],
    seen = new Set<string>()
  for (let i = 0; i < pts.length; i++) {
    const nbrs: { j: number; d: number }[] = []
    for (let j = 0; j < pts.length; j++) {
      if (i === j) continue
      const d = pts[i].distanceTo(pts[j])
      if (d < LONG) nbrs.push({ j, d })
    }
    nbrs.sort((a, b) => a.d - b.d)
    let ks = 0,
      kl = 0
    for (const { j, d } of nbrs) {
      const key = i < j ? `${i},${j}` : `${j},${i}`
      if (seen.has(key)) continue
      if (d <= SHORT && ks < K_S) {
        shortEdges.push({ a: i, b: j })
        seen.add(key)
        ks++
      } else if (d <= LONG && kl < K_L) {
        longEdges.push({ a: i, b: j })
        seen.add(key)
        kl++
      }
    }
  }
  return { shortEdges, longEdges }
}

function buildAdj(allEdges: Edge[], n: number) {
  const adj: { other: number }[][] = Array.from({ length: n }, () => [])
  allEdges.forEach(({ a, b }) => {
    adj[a].push({ other: b })
    adj[b].push({ other: a })
  })
  return adj
}

// ── Component ─────────────────────────────────────────────────────────────────
interface NeuralBrainProps {
  scale?: number
  onPulseEnd?: () => void
  /** Follow the cursor with parallax rotation. Disable for a static logo. */
  interactive?: boolean
  /** UnrealBloom strength. Lower it to cut the big glow (default 1.35). */
  bloomStrength?: number
  /** Node size multiplier during the synaptic pulse (default 4.5). */
  pulseSize?: number
  /** Global multiplier on node point size — shrink for tiny canvases (default 1). */
  pointScale?: number
  /** Number of brain-surface nodes. Lower it for a sparse, readable logo (default 500). */
  nodeCount?: number
  /** Multiplier on wireframe line opacity — raise it for a clearer logo (default 1). */
  lineOpacity?: number
  /** Animate packets + synaptic pulses. Disable for a fully static logo (default true). */
  animated?: boolean
  /** Transparent canvas background (no black tile) — for the logo (default false). */
  transparent?: boolean
  /** Head-on camera + centered node cloud (vs the angled 3/4 hero view). */
  centerView?: boolean
}

export function NeuralBrain({
  scale = 1,
  onPulseEnd,
  interactive = true,
  bloomStrength = 1.35,
  pulseSize = 4.5,
  pointScale = 1,
  nodeCount = 500,
  lineOpacity = 1,
  animated = true,
  transparent = false,
  centerView = false,
}: NeuralBrainProps = {}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onPulseEndRef = useRef(onPulseEnd)
  onPulseEndRef.current = onPulseEnd

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── Scene / Camera / Renderer ─────────────────────────────────────────
    const W = container.clientWidth,
      H = container.clientHeight
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(40, W / H, 0.1, 50)
    if (centerView) {
      camera.position.set(0, 0, 4.6)
      camera.lookAt(0, 0, 0)
    } else {
      camera.position.set(0.8, 0.4, 4.5)
      camera.lookAt(0, 0.45, 0)
    }

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: transparent })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    renderer.toneMapping = THREE.ReinhardToneMapping
    if (transparent) renderer.setClearColor(0x000000, 0)
    container.appendChild(renderer.domElement)

    // ── Bloom ─────────────────────────────────────────────────────────────
    const composer = new EffectComposer(renderer)
    composer.addPass(new RenderPass(scene, camera))
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(W, H), bloomStrength, 0.5, 0.07)
    composer.addPass(bloomPass)

    // ── Build brain graph ─────────────────────────────────────────────────
    // Sparser graphs need wider node spacing + longer edge thresholds so the
    // wireframe stays connected and readable. Scale both by node density.
    const density = Math.sqrt(500 / nodeCount)
    const points = sampleSurface(nodeCount, 0.11 * density)
    const { shortEdges, longEdges } = buildGraph(points, density)
    const allEdges = [...shortEdges, ...longEdges]
    const adj = buildAdj(allEdges, points.length)
    const N_NODES = points.length

    const brainGroup = new THREE.Group()
    brainGroup.scale.setScalar(scale)
    // Center the node cloud in the view (logo); the hero view keeps origin framing.
    if (centerView) {
      let cx = 0,
        cy = 0
      for (const p of points) {
        cx += p.x
        cy += p.y
      }
      cx /= points.length
      cy /= points.length
      brainGroup.position.set(-cx * scale, -cy * scale, 0)
    }
    scene.add(brainGroup)

    // ── Layer B: Wireframe ────────────────────────────────────────────────
    function makeLines(edges: Edge[], color: number, opacity: number) {
      const pos = new Float32Array(edges.length * 6)
      edges.forEach(({ a, b }, i) => {
        const A = points[a],
          B = points[b]
        pos.set([A.x, A.y, A.z, B.x, B.y, B.z], i * 6)
      })
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
      return new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial({ color, transparent: true, opacity })
      )
    }
    const shortLines = makeLines(shortEdges, 0x00e5ff, Math.min(1, 0.42 * lineOpacity))
    const longLines = makeLines(longEdges, 0x00e5ff, Math.min(1, 0.14 * lineOpacity))
    brainGroup.add(shortLines, longLines)

    // ── Live particle layer (nodes + packets) ─────────────────────────────
    const N_PACKETS = animated ? Math.round(220 * (nodeCount / 500)) : 0
    const N_TOTAL = N_NODES + N_PACKETS

    const livePos = new Float32Array(N_TOTAL * 3)
    const liveSz = new Float32Array(N_TOTAL)
    const liveCol = new Float32Array(N_TOTAL * 3)

    for (let i = 0; i < N_NODES; i++) {
      const p = points[i]
      livePos.set([p.x, p.y, p.z], i * 3)
      liveSz[i] = 1.0
      liveCol.set([0.0, 0.82, 1.0], i * 3)
    }
    for (let pi = 0; pi < N_PACKETS; pi++) {
      liveSz[N_NODES + pi] = 1.6
      liveCol.set([0.65, 0.96, 1.0], (N_NODES + pi) * 3)
    }

    const liveGeo = new THREE.BufferGeometry()
    const posAttr = new THREE.BufferAttribute(livePos, 3)
    const szAttr = new THREE.BufferAttribute(liveSz, 1)
    const colAttr = new THREE.BufferAttribute(liveCol, 3)
    posAttr.setUsage(THREE.DynamicDrawUsage)
    szAttr.setUsage(THREE.DynamicDrawUsage)
    colAttr.setUsage(THREE.DynamicDrawUsage)
    liveGeo.setAttribute('position', posAttr)
    liveGeo.setAttribute('aSize', szAttr)
    liveGeo.setAttribute('aColor', colAttr)

    const liveMat = new THREE.ShaderMaterial({
      uniforms: { uPointScale: { value: pointScale } },
      vertexShader: `
        uniform   float uPointScale;
        attribute float aSize;
        attribute vec3  aColor;
        varying   vec3  vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uPointScale * (22.0 / -mv.z);
          gl_Position  = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          if (d > 1.0) discard;
          float alpha = 1.0 - smoothstep(0.3, 1.0, d);
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    brainGroup.add(new THREE.Points(liveGeo, liveMat))

    // ── Passive data packets ──────────────────────────────────────────────
    interface Packet {
      nodeA: number
      nodeB: number
      t: number
      speed: number
    }
    const packets: Packet[] = Array.from({ length: N_PACKETS }, () => {
      const e = allEdges[Math.floor(Math.random() * allEdges.length)]
      return { nodeA: e.a, nodeB: e.b, t: Math.random(), speed: 0.004 + Math.random() * 0.008 }
    })

    function updatePackets() {
      for (let pi = 0; pi < N_PACKETS; pi++) {
        const pk = packets[pi]
        pk.t += pk.speed
        if (pk.t >= 1.0) {
          const nbrs = adj[pk.nodeB]
          if (nbrs.length > 0) {
            const nx = nbrs[Math.floor(Math.random() * nbrs.length)]
            pk.nodeA = pk.nodeB
            pk.nodeB = nx.other
          } else {
            const e = allEdges[Math.floor(Math.random() * allEdges.length)]
            pk.nodeA = e.a
            pk.nodeB = e.b
          }
          pk.t = 0
          pk.speed = 0.004 + Math.random() * 0.008
        }
        const A = points[pk.nodeA],
          B = points[pk.nodeB]
        const off = (N_NODES + pi) * 3
        livePos[off] = A.x + (B.x - A.x) * pk.t
        livePos[off + 1] = A.y + (B.y - A.y) * pk.t
        livePos[off + 2] = A.z + (B.z - A.z) * pk.t
      }
      posAttr.needsUpdate = true
    }

    // ── Synaptic pulse cascade ────────────────────────────────────────────
    const HOP_MS = 400,
      RAMP_MS = 220,
      HOLD_MS = 200,
      FADE_MS = 1200
    let pulseActive = false,
      pulseStart = 0
    let pulseDist: Float32Array | null = null,
      pulseMaxDist = 1
    let sinceLastPulse = 0,
      nextPulseIn = 2500

    function triggerPulse(now: number) {
      pulseActive = true
      pulseStart = now
      const ranked = points
        .map((p, i) => ({ i, score: -p.y - p.x * 0.6 }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 22)
      const sources = ranked
        .sort(() => Math.random() - 0.5)
        .slice(0, 4)
        .map((x) => x.i)

      pulseDist = new Float32Array(N_NODES).fill(9999)
      sources.forEach((n) => {
        pulseDist![n] = 0
      })

      const queue = [...sources]
      let h = 0
      while (h < queue.length) {
        const n = queue[h++]
        for (const { other } of adj[n]) {
          if (pulseDist![other] >= 9999) {
            pulseDist![other] = pulseDist![n] + 1
            queue.push(other)
          }
        }
      }
      pulseMaxDist = 0
      for (let i = 0; i < N_NODES; i++) {
        if (pulseDist![i] < 9999) pulseMaxDist = Math.max(pulseMaxDist, pulseDist![i])
      }
    }

    function updatePulse(now: number) {
      if (!pulseDist) return
      const elapsed = now - pulseStart
      for (let i = 0; i < N_NODES; i++) {
        const d = pulseDist[i]
        if (d >= 9999) continue
        const t = elapsed - d * HOP_MS
        let act = 0
        if (t >= 0 && t < RAMP_MS) act = t / RAMP_MS
        else if (t >= RAMP_MS && t < RAMP_MS + HOLD_MS) act = 1.0
        else if (t >= RAMP_MS + HOLD_MS) act = 1.0 - (t - RAMP_MS - HOLD_MS) / FADE_MS
        act = Math.max(0, Math.min(1, act))

        liveSz[i] = 1.0 + act * pulseSize
        liveCol[i * 3] = act * 0.75
        liveCol[i * 3 + 1] = 0.82 + act * 0.18
        liveCol[i * 3 + 2] = 1.0
      }
      szAttr.needsUpdate = true
      colAttr.needsUpdate = true

      if (elapsed > pulseMaxDist * HOP_MS + RAMP_MS + HOLD_MS + FADE_MS) {
        pulseActive = false
        for (let i = 0; i < N_NODES; i++) {
          liveSz[i] = 1.0
          liveCol.set([0.0, 0.82, 1.0], i * 3)
        }
        szAttr.needsUpdate = true
        colAttr.needsUpdate = true
        nextPulseIn = 5000 + Math.random() * 4000
        onPulseEndRef.current?.()
      }
    }

    // ── Mouse parallax ────────────────────────────────────────────────────
    const MAX_ROT_Y = 0.3,
      MAX_ROT_X = 0.18,
      DAMP = 0.07
    let targetY = 0,
      targetX = 0,
      currentY = 0,
      currentX = 0

    const onMouseMove = (e: MouseEvent) => {
      targetY = ((e.clientX / window.innerWidth) * 2 - 1) * MAX_ROT_Y
      targetX = ((e.clientY / window.innerHeight) * 2 - 1) * MAX_ROT_X
    }
    const onMouseLeave = () => {
      targetY = 0
      targetX = 0
    }

    if (interactive) {
      window.addEventListener('mousemove', onMouseMove)
      window.addEventListener('mouseleave', onMouseLeave)
    }

    // ── Render loop ───────────────────────────────────────────────────────
    let lastTime = 0,
      rafId = 0

    function animate(now: number) {
      rafId = requestAnimationFrame(animate)
      const dt = now - lastTime
      lastTime = now

      if (animated) {
        updatePackets()

        sinceLastPulse += dt
        if (!pulseActive && sinceLastPulse > nextPulseIn) {
          triggerPulse(now)
          sinceLastPulse = 0
        }
        if (pulseActive) updatePulse(now)
      }

      if (interactive) {
        currentY += (targetY - currentY) * DAMP
        currentX += (targetX - currentX) * DAMP
        brainGroup.rotation.y = currentY
        brainGroup.rotation.x = currentX
      }

      composer.render()
    }
    if (animated || interactive) {
      rafId = requestAnimationFrame(animate)
    } else {
      // Fully static logo — render a single frame, no render loop.
      composer.render()
    }

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => {
      const W = container.clientWidth,
        H = container.clientHeight
      camera.aspect = W / H
      camera.updateProjectionMatrix()
      renderer.setSize(W, H)
      composer.setSize(W, H)
      bloomPass.resolution.set(W, H)
    }
    window.addEventListener('resize', onResize)

    // ── Cleanup ───────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(rafId)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseleave', onMouseLeave)
      window.removeEventListener('resize', onResize)
      liveGeo.dispose()
      liveMat.dispose()
      shortLines.geometry.dispose()
      longLines.geometry.dispose()
      ;(shortLines.material as THREE.Material).dispose()
      ;(longLines.material as THREE.Material).dispose()
      composer.dispose()
      renderer.dispose()
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement)
    }
  }, [
    scale,
    interactive,
    bloomStrength,
    pulseSize,
    pointScale,
    nodeCount,
    lineOpacity,
    animated,
    transparent,
    centerView,
  ])

  return <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
}
