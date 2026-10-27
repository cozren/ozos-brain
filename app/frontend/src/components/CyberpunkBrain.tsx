interface Props {
  width?: number
}

export function CyberpunkBrain({ width = 44 }: Props) {
  return (
    <>
      <style>{`
        @keyframes brain-glow {
          0%,100% { filter: drop-shadow(0 0 4px rgba(0,255,255,0.5)) brightness(0.95); }
          50%     { filter: drop-shadow(0 0 7px rgba(0,255,255,0.75)) brightness(1.05); }
        }
      `}</style>
      <img
        src="/brain.png"
        alt="OZOS Brain"
        width={width}
        height={width}
        style={{
          flexShrink: 0,
          mixBlendMode: 'screen',
          animation: 'brain-glow 4.5s ease-in-out infinite',
          objectFit: 'contain',
        }}
      />
    </>
  )
}
