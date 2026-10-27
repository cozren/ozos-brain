import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'
import type { ResearchSnapshot } from '../../types/reporting'

function articleText(data: ResearchSnapshot): string {
  const a = data.article
  const parts = [a.title, '', a.tldr, '']
  for (const s of a.sections) {
    parts.push(s.heading, '', s.body, '')
  }
  return parts.join('\n').trim()
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
    <button className="pulse-post__btn" onClick={copy} title="Copy article text">
      {copied ? <Check size={14} /> : <Copy size={14} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}

export function ResearchArticle({ data }: { data: ResearchSnapshot }) {
  const [showSummary, setShowSummary] = useState(false)
  const a = data.article
  const s = data.summary
  return (
    <div className="pulse research" data-testid="research-article">
      {s && (
        <div className="pulse__signal">
          <strong>Strongest signal:</strong> {s.strongest_signal}
        </div>
      )}

      {s && (
        <button className="pulse__summary-toggle" onClick={() => setShowSummary((v) => !v)}>
          {showSummary ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          Search summary · {s.found} found, {s.dropped} dropped
        </button>
      )}

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

      <article className="research__article">
        <h2 className="research__title">{a.title}</h2>
        <p className="research__tldr">
          <strong>TL;DR</strong> {a.tldr}
        </p>

        {a.sections.map((sec, i) => (
          <section key={i} className="research__section">
            <h3 className="research__heading">{sec.heading}</h3>
            <div className="research__body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{sec.body}</ReactMarkdown>
            </div>
          </section>
        ))}

        {a.sources.length > 0 && (
          <div className="research__sources">
            <h3 className="research__heading">Sources</h3>
            <ul>
              {a.sources.map((src, i) => (
                <li key={i} className="research__source">
                  {src.url_verified && src.url ? (
                    <a href={src.url} target="_blank" rel="noreferrer">
                      {src.outlet}
                    </a>
                  ) : (
                    <span>{src.outlet}</span>
                  )}
                  {' · '}
                  {src.date}
                  {!(src.url_verified && src.url) && (
                    <span className="pulse-post__unverified">
                      {' '}
                      · link unverified — verify manually
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </article>

      <div className="pulse-post__actions">
        <CopyButton text={articleText(data)} />
      </div>
    </div>
  )
}
