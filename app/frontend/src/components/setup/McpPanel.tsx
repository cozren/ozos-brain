import type { SetupItem } from '../../types/setup'
import { CODE, HINT } from './formStyles'

// MCP items have no form: the connector is enabled inside Claude Code, and the
// backend reads the same `claude mcp list` the Control Tower discovers.
export function McpPanel({ item }: { item: SetupItem }) {
  const mcp = item.derived?.mcp
  const connected = mcp?.connected ?? false
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={HINT}>
        In Claude Code run{' '}
        <code style={{ ...CODE, display: 'inline', padding: '1px 6px' }}>/mcp</code>, enable{' '}
        {item.title} and authenticate. The check below refreshes on the next app start.
      </p>
      <span
        data-connected={connected}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          letterSpacing: 1,
          color: connected ? '#22C55E' : '#F59E0B',
        }}
      >
        {connected ? `Connected (${(mcp?.names ?? []).join(', ')})` : 'Not detected yet'}
      </span>
    </div>
  )
}
