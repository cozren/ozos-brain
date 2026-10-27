// Minimalistic cyberpunk trophy, drawn inline so it inherits the surrounding
// text colour (stroke="currentColor") and stays crisp at any size. A faint cyan
// fill plus a neon drop-shadow give it the glow used across the HUD. Used to
// mark each entry in the Key Accomplishments card.
export function TrophyIcon({
  size = 20,
  title = 'Achievement',
}: {
  size?: number
  title?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      role="img"
      aria-label={title}
      fill="rgba(0,255,255,0.12)"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
      strokeLinecap="round"
      style={{
        flexShrink: 0,
        filter:
          'drop-shadow(0 0 2px rgba(0,255,255,0.9)) drop-shadow(0 0 5px rgba(0,255,255,0.45))',
      }}
    >
      {/* cup bowl (filled) */}
      <path d="M5 3.5 H19 L17 9.5 L12 12.6 L7 9.5 Z" />
      {/* emblem chevron */}
      <path d="M10 6.7 L12 8.5 L14 6.7" fill="none" />
      {/* handles */}
      <path d="M6.4 4 C2.8 4.6 3 9 7 9.5" fill="none" />
      <path d="M17.6 4 C21.2 4.6 21 9 17 9.5" fill="none" />
      {/* stem + collar */}
      <path d="M12 12.6 V15.4" fill="none" />
      <path d="M10.4 15.4 H13.6" fill="none" />
      {/* base (filled) */}
      <path d="M8.8 15.7 H15.2 L16.6 18.5 H7.4 Z" />
    </svg>
  )
}
