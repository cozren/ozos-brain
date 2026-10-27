import { useState } from 'react'
import { Copy, Check, Send, ChevronDown, ChevronRight } from 'lucide-react'
import type { IndustryPulseSnapshot, PulsePost } from '../../types/reporting'

const MIN_WORDS = 80
const MAX_WORDS = 180

function wordCount(text: string): number {
  const t = text.trim()
  return t ? t.split(/\s+/).length : 0
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }
  return (
    <button className="pulse-post__btn" onClick={copy} title="Copy post text">
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

function PostCard({ post }: { post: PulsePost }) {
  const words = wordCount(post.text)
  const warn = words < MIN_WORDS || words > MAX_WORDS
  return (
    <article className="pulse-post" data-testid="pulse-post">
      <div className="pulse-post__head">
        <span className="pulse-post__tag">
          Post {post.n} · {post.template} — {post.template_name}
        </span>
        <span className="pulse-post__cluster">{post.cluster}</span>
      </div>

      <div className="pulse-post__badges">
        <span className="pulse-badge pulse-badge--conf">{post.scoring.confidence}</span>
        <span className="pulse-badge pulse-badge--worth">{post.scoring.post_worthiness}</span>
        <span className="pulse-badge pulse-badge--fresh">{post.scoring.freshness}</span>
      </div>

      <p className="pulse-post__text">{post.text}</p>

      <div className="pulse-post__meta">
        <span className={`pulse-post__count${warn ? ' pulse-post__count--warn' : ''}`}>
          {words} words
        </span>
        <span className="pulse-post__source">
          {post.source_outlet} · {post.source_date}
          {' · '}
          {post.url_verified && post.source_url ? (
            <a href={post.source_url} target="_blank" rel="noreferrer">
              source
            </a>
          ) : (
            <span className="pulse-post__unverified">link unverified — verify manually</span>
          )}
        </span>
      </div>

      <div className="pulse-post__actions">
        <CopyButton text={post.text} />
        <button
          className="pulse-post__btn pulse-post__btn--linkedin"
          disabled
          title="Direct posting coming in a later phase"
        >
          <Send size={14} />
          Post to LinkedIn
        </button>
      </div>
    </article>
  )
}

export function IndustryPulse({ data }: { data: IndustryPulseSnapshot }) {
  const [showSummary, setShowSummary] = useState(false)
  const s = data.summary
  return (
    <div className="pulse">
      <div className="pulse__signal">
        <strong>Strongest signal:</strong> {s?.strongest_signal}
      </div>

      <button className="pulse__summary-toggle" onClick={() => setShowSummary((v) => !v)}>
        {showSummary ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        Search summary {s ? `· ${s.found} found, ${s.dropped} dropped` : ''}
      </button>

      {showSummary && s && (
        <div className="pulse__summary">
          <p>{s.searched}</p>
          {s.clusters_represented?.length > 0 && (
            <p className="pulse__clusters">Clusters: {s.clusters_represented.join(', ')}</p>
          )}
          {s.gaps && <p className="pulse__gaps">Gaps: {s.gaps}</p>}
          {s.confession?.length > 0 && (
            <ul className="pulse__confession">
              {s.confession.map((c, i) => (
                <li key={i}>
                  Dropped: {c.dropped}. Reason: {c.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="pulse__posts">
        {data.posts.map((p) => (
          <PostCard key={p.n} post={p} />
        ))}
      </div>
    </div>
  )
}
