// Neon rotation — deterministic color per source by index.
const NEONS = ['#00FFFF', '#FF00FF', '#FFB000', '#7CFF00', '#0080FF', '#FF5C7C']

export function sourceColor(id: string, index?: number): string {
  if (index !== undefined) return NEONS[index % NEONS.length]
  const slot = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0) % NEONS.length
  return NEONS[slot]
}
