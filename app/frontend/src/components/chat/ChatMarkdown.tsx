import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Cyberpunk-styled markdown for assistant chat messages (extracted from ChatPanel). */
export function ChatMarkdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => (
          <div style={{ overflowX: 'auto', margin: '6px 0' }}>
            <table
              style={{
                borderCollapse: 'collapse',
                fontSize: 11,
                width: '100%',
              }}
            >
              {children}
            </table>
          </div>
        ),
        th: ({ children }) => (
          <th
            style={{
              border: '1px solid rgba(0,255,255,0.25)',
              padding: '4px 8px',
              textAlign: 'left',
              color: 'var(--neon-cyan)',
              fontWeight: 700,
              background: 'rgba(0,255,255,0.06)',
              whiteSpace: 'nowrap',
            }}
          >
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td
            style={{
              border: '1px solid rgba(0,255,255,0.15)',
              padding: '4px 8px',
              verticalAlign: 'top',
            }}
          >
            {children}
          </td>
        ),
        h1: ({ children }) => (
          <span
            style={{
              display: 'block',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--neon-cyan)',
              letterSpacing: 1,
              textTransform: 'uppercase',
              marginTop: 10,
              marginBottom: 4,
              borderBottom: '1px solid rgba(0,255,255,0.2)',
              paddingBottom: 3,
            }}
          >
            {children}
          </span>
        ),
        h2: ({ children }) => (
          <span
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--neon-cyan)',
              letterSpacing: 0.5,
              marginTop: 8,
              marginBottom: 3,
            }}
          >
            {children}
          </span>
        ),
        h3: ({ children }) => (
          <span
            style={{
              display: 'block',
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(0,255,255,0.75)',
              marginTop: 6,
              marginBottom: 2,
            }}
          >
            {children}
          </span>
        ),
        p: ({ children }) => <span style={{ display: 'block', marginBottom: 6 }}>{children}</span>,
        strong: ({ children }) => (
          <strong style={{ color: 'var(--neon-cyan)', fontWeight: 700 }}>{children}</strong>
        ),
        em: ({ children }) => <em style={{ opacity: 0.85 }}>{children}</em>,
        ul: ({ children }) => (
          <ul style={{ paddingLeft: 14, margin: '4px 0 6px', listStyleType: 'none' }}>
            {children}
          </ul>
        ),
        ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: '4px 0 6px' }}>{children}</ol>,
        li: ({ children }) => (
          <li
            style={{
              marginBottom: 3,
              paddingLeft: 2,
              display: 'flex',
              gap: 6,
              alignItems: 'flex-start',
            }}
          >
            <span style={{ color: 'var(--neon-cyan)', flexShrink: 0, marginTop: 1 }}>›</span>
            <span>{children}</span>
          </li>
        ),
        blockquote: ({ children }) => (
          <span
            style={{
              display: 'block',
              borderLeft: '2px solid rgba(0,255,255,0.4)',
              paddingLeft: 8,
              margin: '4px 0',
              opacity: 0.8,
              fontStyle: 'italic',
            }}
          >
            {children}
          </span>
        ),
        hr: () => (
          <span
            style={{
              display: 'block',
              borderTop: '1px solid rgba(0,255,255,0.15)',
              margin: '6px 0',
            }}
          />
        ),
        code: ({ children }) => (
          <code
            style={{
              background: 'rgba(0,255,255,0.1)',
              padding: '1px 4px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
            }}
          >
            {children}
          </code>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  )
}
