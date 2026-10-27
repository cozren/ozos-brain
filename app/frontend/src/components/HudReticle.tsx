export function HudReticle() {
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 * Math.PI) / 180
    return {
      x1: 24 + 17 * Math.sin(angle),
      y1: 24 - 17 * Math.cos(angle),
      x2: 24 + 20 * Math.sin(angle),
      y2: 24 - 20 * Math.cos(angle),
      major: i % 3 === 0,
    }
  })

  return (
    <svg width="48" height="48" viewBox="0 0 48 48" aria-label="HUD reticle">
      <style>{`
        @keyframes hud-rotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes hud-pulse { 0%,100% { opacity:0.5; } 50% { opacity:1; } }
        .hud-outer { transform-origin: 24px 24px; animation: hud-rotate 20s linear infinite; }
        .hud-inner { animation: hud-pulse 3s ease-in-out infinite; }
      `}</style>
      {[
        [-1, 0, 1, 0],
        [1, 0, -1, 0],
        [0, -1, 0, 1],
        [0, 1, 0, -1],
      ].map(([dx1, dy1, dx2, dy2], i) => (
        <line
          key={i}
          x1={24 + dx1 * 14}
          y1={24 + dy1 * 14}
          x2={24 + dx2 * 10}
          y2={24 + dy2 * 10}
          stroke="#00FFFF"
          strokeWidth="1"
          opacity="0.5"
        />
      ))}
      <circle
        cx="24"
        cy="24"
        r="7"
        fill="none"
        stroke="#00FFFF"
        strokeWidth="1"
        className="hud-inner"
        style={{ filter: 'drop-shadow(0 0 4px #00FFFF)' }}
      />
      <g className="hud-outer">
        <circle
          cx="24"
          cy="24"
          r="20"
          fill="none"
          stroke="#00FFFF"
          strokeWidth="0.8"
          opacity="0.4"
          style={{ filter: 'drop-shadow(0 0 3px #00FFFF)' }}
        />
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            stroke="#00FFFF"
            strokeWidth={t.major ? 1.5 : 0.8}
            opacity={t.major ? 1 : 0.6}
          />
        ))}
      </g>
    </svg>
  )
}
