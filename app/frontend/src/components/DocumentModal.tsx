import React, { useEffect, useRef, useState } from 'react'

interface Props {
  title: string
  content: string
  onClose: () => void
}

type Context = 'self' | 'manager' | null

type BlockType =
  | 'h1'
  | 'h2'
  | 'question'
  | 'competency-header'
  | 'rating'
  | 'numbered'
  | 'p'
  | 'context-self'
  | 'context-manager'

interface Block {
  type: BlockType
  text: string
  context: Context
}

// ── Constants ────────────────────────────────────────────────────────────────

const SELF_COLOR = '#00FFFF'
const MGR_COLOR = '#FF44CC'
const Q_COLOR = '#A78BFA'
const COMP_COLOR = '#F59E0B'
const SELF_BG = 'rgba(0,255,255,0.035)'
const MGR_BG = 'rgba(255,68,204,0.04)'
const SELF_BORDER = 'rgba(0,255,255,0.35)'
const MGR_BORDER = 'rgba(255,68,204,0.45)'

const RATING_MAP: Record<string, { label: string; color: string; bg: string }> = {
  'exceeding expectations': {
    label: 'Exceeding Expectations',
    color: '#00FFFF',
    bg: 'rgba(0,255,255,0.12)',
  },
  'driving excellence': {
    label: 'Driving Excellence',
    color: '#FF00FF',
    bg: 'rgba(255,0,255,0.12)',
  },
  'meeting expectations': {
    label: 'Meeting Expectations',
    color: '#FFD93D',
    bg: 'rgba(255,217,61,0.12)',
  },
  'need improvement': { label: 'Need Improvement', color: '#FF6B6B', bg: 'rgba(255,107,107,0.12)' },
  'needs improvement': {
    label: 'Needs Improvement',
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.12)',
  },
  "let's grow together": {
    label: "Let's Grow Together",
    color: '#FF6B6B',
    bg: 'rgba(255,107,107,0.12)',
  },
  'n/a': { label: 'N/A', color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)' },
}

function detectRating(text: string) {
  return RATING_MAP[text.toLowerCase().trim()] ?? null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripEmptyBanners(content: Block[]): Block[] {
  return content.filter((block, i) => {
    if (block.type !== 'context-self' && block.type !== 'context-manager') return true
    for (let j = i + 1; j < content.length; j++) {
      if (content[j].type === 'context-self' || content[j].type === 'context-manager') break
      return true
    }
    return false
  })
}

function parseCompetencyName(text: string): { name: string; category: string } {
  const colonIdx = text.indexOf(' : ')
  const dashIdx = colonIdx >= 0 ? text.indexOf(' - ', colonIdx) : -1
  if (colonIdx >= 0 && dashIdx >= 0) {
    return { category: text.slice(0, colonIdx).trim(), name: text.slice(dashIdx + 3).trim() }
  }
  return { category: '', name: text }
}

// ── Content parser ────────────────────────────────────────────────────────────

function formatContent(raw: string): Block[] {
  const PAGE_FOOTER = /^(Downloaded:.+|\d+ \/ \d+|Review report:.+)$/
  const lines = raw.split('\n')
  const blocks: Block[] = []
  let context: Context = null
  let paraLines: string[] = []

  const flushPara = () => {
    const joined = paraLines.join(' ').trim()
    if (joined) blocks.push({ type: 'p', text: joined, context })
    paraLines = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      continue
    }
    if (PAGE_FOOTER.test(line)) continue

    if (line.startsWith('# ')) {
      flushPara()
      blocks.push({ type: 'h1', text: line.slice(2), context: null })
      continue
    }
    if (/^self-?evaluation$/i.test(line)) {
      flushPara()
      context = 'self'
      blocks.push({ type: 'context-self', text: 'Self-Evaluation', context: 'self' })
      continue
    }
    if (/^manager$/i.test(line)) {
      flushPara()
      context = 'manager'
      blocks.push({ type: 'context-manager', text: 'Manager', context: 'manager' })
      continue
    }
    const rating = detectRating(line)
    if (rating) {
      flushPara()
      blocks.push({ type: 'rating', text: line, context })
      continue
    }
    if (line.endsWith('?') && line.length > 10) {
      paraLines.push(line)
      const questionText = paraLines.join(' ').trim()
      paraLines = []
      context = null
      blocks.push({ type: 'question', text: questionText, context: null })
      continue
    }
    // Competency header: "Category : Domain - Name"
    if (/ : /.test(line) && / - /.test(line) && line.length < 100) {
      flushPara()
      context = null
      blocks.push({ type: 'competency-header', text: line, context: null })
      continue
    }
    if (/^\d{1,2}\.\s/.test(line)) {
      flushPara()
      blocks.push({ type: 'numbered', text: line, context })
      continue
    }
    const isHeader =
      line.length < 80 &&
      /^[A-Z]/.test(line) &&
      !line.includes(',') &&
      (line === line.toUpperCase() || /^(Details|Reviewee|Atollian|Review report)$/.test(line))
    if (isHeader) {
      flushPara()
      blocks.push({ type: 'h2', text: line, context: null })
      continue
    }
    paraLines.push(line)
  }
  flushPara()
  return blocks
}

// ── Block grouping ────────────────────────────────────────────────────────────

interface QuestionGroup {
  question: Block
  description: Block[]
  content: Block[]
  hasSelf: boolean
  hasManager: boolean
}

interface CompetencyGroup {
  header: Block
  description: Block[]
  content: Block[]
  hasSelf: boolean
  hasManager: boolean
}

type Segment =
  | { kind: 'standalone'; block: Block }
  | { kind: 'question-group'; group: QuestionGroup; index: number }
  | { kind: 'competency-group'; group: CompetencyGroup; index: number }

const Q_STOPWORDS = new Set([
  'what',
  'which',
  'how',
  'where',
  'when',
  'why',
  'who',
  'whom',
  'your',
  'their',
  'you',
  'they',
  'this',
  'that',
  'these',
  'those',
  'its',
  'the',
  'and',
  'but',
  'not',
  'also',
  'any',
  'some',
  'both',
  'have',
  'has',
  'had',
  'will',
  'would',
  'could',
  'should',
  'does',
  'doing',
  'done',
  'been',
  'being',
  'were',
  'with',
  'from',
  'into',
  'upon',
  'about',
  'between',
  'person',
  'people',
  'employee',
  'reviewee',
  'team',
  'member',
  'please',
  'specific',
  'provide',
  'include',
  'select',
  'based',
  'last',
  'next',
  'past',
  'current',
  'recent',
  'same',
  'such',
  'feel',
  'felt',
  'think',
  'thought',
  'believe',
  'consider',
  'role',
  'year',
  'time',
  'area',
  'part',
  'more',
  'less',
])

function topicWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 5 && !Q_STOPWORDS.has(w))
  )
}

function questionsSimilar(a: string, b: string): boolean {
  const wa = topicWords(a),
    wb = topicWords(b)
  if (wa.size === 0 || wb.size === 0) return false
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared / new Set([...wa, ...wb]).size >= 0.25
}

function collectDescription(blocks: Block[], start: number): { desc: Block[]; end: number } {
  const desc: Block[] = []
  let i = start
  while (
    i < blocks.length &&
    blocks[i].type !== 'question' &&
    blocks[i].type !== 'competency-header' &&
    blocks[i].type !== 'context-self' &&
    blocks[i].type !== 'context-manager'
  ) {
    desc.push(blocks[i++])
  }
  return { desc, end: i }
}

function collectContent(blocks: Block[], start: number): { content: Block[]; end: number } {
  const content: Block[] = []
  let i = start
  while (
    i < blocks.length &&
    blocks[i].type !== 'question' &&
    blocks[i].type !== 'competency-header'
  ) {
    content.push(blocks[i++])
  }
  return { content, end: i }
}

// ── Context grouping (self always before manager) ─────────────────────────────

interface ContextSection {
  kind: 'self' | 'manager' | 'other'
  banner: Block | null
  rating: Block | null
  items: Block[]
}

function groupByContext(blocks: Block[]): ContextSection[] {
  const stripped = stripEmptyBanners(blocks)
  if (stripped.length === 0) return []

  // Find all banner positions
  const bannerPositions: number[] = []
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i].type === 'context-self' || stripped[i].type === 'context-manager') {
      bannerPositions.push(i)
    }
  }

  if (bannerPositions.length === 0) {
    return [{ kind: 'other', banner: null, rating: null, items: stripped }]
  }

  const firstRatingPos = stripped.findIndex((b) => b.type === 'rating')
  const lastBannerPos = bannerPositions[bannerPositions.length - 1]

  // "Stacked" pattern: all banners appear before any rated content (PDF two-column layout
  // linearizes left column first: all reviewer names/badges, then right column: all scores+text)
  const isStacked = firstRatingPos >= 0 && firstRatingPos > lastBannerPos

  const sections: ContextSection[] = []

  if (isStacked) {
    // Leading non-banner content (e.g. reviewer name before first banner)
    const firstBannerPos = bannerPositions[0]
    if (firstBannerPos > 0) {
      sections.push({
        kind: 'other',
        banner: null,
        rating: null,
        items: stripped.slice(0, firstBannerPos),
      })
    }

    // Split everything after the last banner at rating boundaries.
    // Each chunk corresponds to one banner in document order.
    const banners = bannerPositions.map((pos) => stripped[pos])
    const afterBanners = stripped.slice(lastBannerPos + 1)

    const chunks: Block[][] = []
    let chunk: Block[] = []
    for (const b of afterBanners) {
      if (b.type === 'rating') {
        if (chunk.length > 0) chunks.push(chunk)
        chunk = [b]
      } else {
        chunk.push(b)
      }
    }
    if (chunk.length > 0) chunks.push(chunk)

    for (let j = 0; j < banners.length; j++) {
      const banner = banners[j]
      const kind: ContextSection['kind'] = banner.type === 'context-self' ? 'self' : 'manager'
      const chunkBlocks = chunks[j] ?? []
      let rating: Block | null = null
      let items = chunkBlocks
      if (chunkBlocks.length > 0 && chunkBlocks[0].type === 'rating') {
        rating = chunkBlocks[0]
        items = chunkBlocks.slice(1)
      }
      sections.push({ kind, banner, rating, items })
    }
  } else {
    // Interleaved pattern: banners and content alternate (normal questions)
    let current: ContextSection = { kind: 'other', banner: null, rating: null, items: [] }
    for (let i = 0; i < stripped.length; i++) {
      const block = stripped[i]
      if (block.type === 'context-self' || block.type === 'context-manager') {
        if (current.banner || current.items.length > 0) sections.push(current)
        const kind: ContextSection['kind'] = block.type === 'context-self' ? 'self' : 'manager'
        let rating: Block | null = null
        if (i + 1 < stripped.length && stripped[i + 1].type === 'rating') {
          rating = stripped[++i]
        }
        current = { kind, banner: block, rating, items: [] }
        continue
      }
      current.items.push(block)
    }
    if (current.banner || current.items.length > 0) sections.push(current)
  }

  return [
    ...sections.filter((s) => s.kind === 'other'),
    ...sections.filter((s) => s.kind === 'self'),
    ...sections.filter((s) => s.kind === 'manager'),
  ]
}

function groupBlocks(blocks: Block[]): Segment[] {
  const segments: Segment[] = []
  let i = 0,
    qIndex = 0,
    cIndex = 0

  while (i < blocks.length) {
    const block = blocks[i]

    // ── Question ──
    if (block.type === 'question') {
      i++
      const { desc: description, end: a } = collectDescription(blocks, i)
      i = a
      const { content, end: b } = collectContent(blocks, i)
      i = b

      const filtered = stripEmptyBanners(content)
      const hasSelf = filtered.some((b) => b.type === 'context-self' || b.context === 'self')
      const hasManager = filtered.some(
        (b) => b.type === 'context-manager' || b.context === 'manager'
      )

      let merged = false
      for (let j = segments.length - 1; j >= Math.max(0, segments.length - 4); j--) {
        const seg = segments[j]
        if (seg.kind !== 'question-group') continue
        const addsSelf = hasSelf && !seg.group.hasSelf,
          addsManager = hasManager && !seg.group.hasManager
        if ((addsSelf || addsManager) && questionsSimilar(seg.group.question.text, block.text)) {
          seg.group.content.push(...content)
          seg.group.hasSelf = seg.group.hasSelf || hasSelf
          seg.group.hasManager = seg.group.hasManager || hasManager
          merged = true
        }
        break
      }
      if (!merged) {
        segments.push({
          kind: 'question-group',
          group: { question: block, description, content, hasSelf, hasManager },
          index: qIndex++,
        })
      }
      continue
    }

    // ── Competency ──
    if (block.type === 'competency-header') {
      i++
      const { desc: description, end: a } = collectDescription(blocks, i)
      i = a
      const { content, end: b } = collectContent(blocks, i)
      i = b

      const filtered = stripEmptyBanners(content)
      const hasSelf = filtered.some((b) => b.type === 'context-self' || b.context === 'self')
      const hasManager = filtered.some(
        (b) => b.type === 'context-manager' || b.context === 'manager'
      )
      segments.push({
        kind: 'competency-group',
        group: { header: block, description, content, hasSelf, hasManager },
        index: cIndex++,
      })
      continue
    }

    // ── Standalone (metadata, title, etc.) ──
    segments.push({ kind: 'standalone', block })
    i++
  }
  return segments
}

// ── Rich text ────────────────────────────────────────────────────────────────

const BOLD_RE =
  /([~+]?€[\d,.]+k?|[~+]?\$[\d,.]+k?|\+?[\d,.]+%|\+?[\d,.]+k(?=\b)|[A-Z]{2,}s?(?=\b)|Q[1-4](?=\b))/g

function BoldText({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  let last = 0
  const re = new RegExp(BOLD_RE.source, BOLD_RE.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <strong key={m.index} style={{ fontWeight: 700, color: 'rgba(255,255,255,0.97)' }}>
        {m[0]}
      </strong>
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

// ── Block renderer ────────────────────────────────────────────────────────────

function renderBlock(block: Block, i: number) {
  if (block.type === 'h1')
    return (
      <h1
        key={i}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 15,
          fontWeight: 700,
          color: 'var(--neon-cyan)',
          marginBottom: 18,
          marginTop: i > 0 ? 8 : 0,
          textShadow: '0 0 12px rgba(0,255,255,0.5)',
          borderBottom: '1px solid rgba(0,255,255,0.15)',
          paddingBottom: 10,
        }}
      >
        {block.text}
      </h1>
    )
  if (block.type === 'h2')
    return (
      <h2
        key={i}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.2)',
          letterSpacing: 2.5,
          textTransform: 'uppercase',
          marginTop: 20,
          marginBottom: 4,
        }}
      >
        {block.text}
      </h2>
    )
  if (block.type === 'context-self' || block.type === 'context-manager') {
    const isSelf = block.type === 'context-self'
    const color = isSelf ? SELF_COLOR : MGR_COLOR
    const bg = isSelf ? 'rgba(0,255,255,0.08)' : 'rgba(255,68,204,0.08)'
    const border = isSelf ? SELF_BORDER : MGR_BORDER
    const label = isSelf ? 'SELF-EVALUATION' : 'MANAGER'
    const icon = isSelf ? (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ) : (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      </svg>
    )
    return (
      <div
        key={i}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          margin: '20px 0 8px',
          padding: '7px 14px',
          background: bg,
          border: `1px solid ${border}`,
          borderLeft: `3px solid ${color}`,
          borderRadius: 3,
        }}
      >
        {icon}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 2,
            color,
            textShadow: `0 0 10px ${color}66`,
          }}
        >
          {label}
        </span>
      </div>
    )
  }
  if (block.type === 'rating') {
    const r = detectRating(block.text)
    if (!r) return null
    return (
      <div key={i} style={{ display: 'flex', margin: '6px 0 10px' }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '5px 14px',
            background: r.bg,
            border: `1px solid ${r.color}55`,
            borderRadius: 20,
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 700,
            color: r.color,
            letterSpacing: 0.5,
            boxShadow: `0 0 12px ${r.color}22`,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: r.color,
              boxShadow: `0 0 6px ${r.color}`,
              display: 'inline-block',
              flexShrink: 0,
            }}
          />
          {r.label}
        </span>
      </div>
    )
  }
  if (block.type === 'numbered') {
    const color =
      block.context === 'self'
        ? SELF_COLOR
        : block.context === 'manager'
          ? MGR_COLOR
          : 'rgba(255,255,255,0.7)'
    const bg =
      block.context === 'self' ? SELF_BG : block.context === 'manager' ? MGR_BG : 'transparent'
    const body = block.text.replace(/^\d+\.\s*/, '')
    return (
      <div
        key={i}
        style={{
          display: 'flex',
          gap: 10,
          alignItems: 'flex-start',
          padding: '8px 12px',
          margin: '6px 0',
          background: bg,
          borderLeft: `2px solid ${color}55`,
          borderRadius: '0 3px 3px 0',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color,
            flexShrink: 0,
            marginTop: 1,
          }}
        >
          {block.text.match(/^\d+/)![0]}.
        </span>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.88)',
            lineHeight: 1.5,
          }}
        >
          <BoldText text={body} />
        </span>
      </div>
    )
  }
  const bg =
    block.context === 'self' ? SELF_BG : block.context === 'manager' ? MGR_BG : 'transparent'
  const bdr =
    block.context === 'self'
      ? 'rgba(0,255,255,0.12)'
      : block.context === 'manager'
        ? 'rgba(255,68,204,0.15)'
        : 'transparent'
  return (
    <p
      key={i}
      style={{
        fontSize: 13,
        color: 'rgba(255,255,255,0.75)',
        lineHeight: 1.75,
        margin: '4px 0 10px',
        padding: block.context ? '8px 12px' : '0',
        background: bg,
        borderLeft: block.context ? `2px solid ${bdr}` : 'none',
        borderRadius: block.context ? '0 3px 3px 0' : 0,
      }}
    >
      {block.context ? <BoldText text={block.text} /> : block.text}
    </p>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function IconQuestion({ color = Q_COLOR }: { color?: string }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

function IconCompetency() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke={COMP_COLOR}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
    >
      <polygon points="12 2 22 12 12 22 2 12" />
    </svg>
  )
}

function IconChevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transition: 'transform 180ms', transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function IconCheck({ color }: { color: string }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// ── Section divider ───────────────────────────────────────────────────────────

function SectionDivider({ label, color, count }: { label: string; color: string; count?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '32px 0 4px' }}>
      <div style={{ flex: 1, height: 1, background: `${color}20` }} />
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 9,
          letterSpacing: 2.5,
          color: `${color}70`,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {label}
        {count !== undefined && (
          <span style={{ marginLeft: 8, color: `${color}45`, letterSpacing: 1 }}>· {count}</span>
        )}
      </span>
      <div style={{ flex: 1, height: 1, background: `${color}20` }} />
    </div>
  )
}

// ── Collapsed indicators ──────────────────────────────────────────────────────

function CollapsedIndicators({ hasSelf, hasManager }: { hasSelf: boolean; hasManager: boolean }) {
  if (!hasSelf && !hasManager) return null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      {hasSelf && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <IconCheck color={`${SELF_COLOR}99`} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: `${SELF_COLOR}66`,
              letterSpacing: 1,
            }}
          >
            SELF
          </span>
        </div>
      )}
      {hasManager && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <IconCheck color={`${MGR_COLOR}99`} />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: `${MGR_COLOR}66`,
              letterSpacing: 1,
            }}
          >
            MGR
          </span>
        </div>
      )}
    </div>
  )
}

function CollapseButton({
  isOpen,
  color,
  onToggle,
}: {
  isOpen: boolean
  color: string
  onToggle: () => void
}) {
  return (
    <button
      onClick={onToggle}
      title={isOpen ? 'Collapse' : 'Expand'}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        color: `${color}88`,
        padding: 3,
        borderRadius: 3,
        display: 'flex',
        alignItems: 'center',
        transition: 'color 120ms',
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.color = color)}
      onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.color = `${color}88`)}
    >
      <IconChevron open={isOpen} />
    </button>
  )
}

// ── Context section block ─────────────────────────────────────────────────────

function ContextSectionBlock({ section, idx }: { section: ContextSection; idx: number }) {
  if (section.kind === 'other') {
    return <>{section.items.map((b, i) => renderBlock(b, idx * 1000 + i))}</>
  }

  const isSelf = section.kind === 'self'
  const color = isSelf ? SELF_COLOR : MGR_COLOR
  const bg = isSelf ? 'rgba(0,255,255,0.05)' : 'rgba(255,68,204,0.04)'
  const border = isSelf ? SELF_BORDER : MGR_BORDER
  const label = isSelf ? 'SELF-EVALUATION' : 'MANAGER'
  const rating = section.rating ? detectRating(section.rating.text) : null
  const hasContent = section.items.length > 0

  const icon = isSelf ? (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  ) : (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
    </svg>
  )

  return (
    <div
      style={{
        margin: '12px 0 0',
        border: `1px solid ${border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 3,
        background: bg,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderBottom: hasContent ? `1px solid ${border}22` : 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 2,
              color,
              textShadow: `0 0 10px ${color}66`,
            }}
          >
            {label}
          </span>
        </div>
        {rating && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 5,
              padding: '3px 10px',
              background: rating.bg,
              border: `1px solid ${rating.color}44`,
              borderRadius: 16,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              fontWeight: 700,
              color: rating.color,
              letterSpacing: 0.5,
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: rating.color,
                boxShadow: `0 0 5px ${rating.color}`,
                flexShrink: 0,
              }}
            />
            {rating.label}
          </span>
        )}
      </div>
      {hasContent && (
        <div style={{ padding: '8px 14px 12px' }}>
          {section.items.map((b, i) =>
            renderBlock({ ...b, context: section.kind }, idx * 1000 + i)
          )}
        </div>
      )}
    </div>
  )
}

// ── Description tooltip (hover ≥1 s to reveal) ───────────────────────────────

function DescriptionTooltip({
  text,
  accentColor = Q_COLOR,
  children,
}: {
  text: string
  accentColor?: string
  children: React.ReactNode
}) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const show = () => {
    if (text) timer.current = setTimeout(() => setVisible(true), 950)
  }
  const hide = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setVisible(false)
  }

  return (
    <div
      style={{ position: 'relative', flex: 1, minWidth: 0 }}
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {visible && text && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            zIndex: 300,
            background: '#0a0a1a',
            borderRadius: 4,
            border: `1px solid ${accentColor}22`,
            boxShadow: `0 16px 40px rgba(0,0,0,0.8), 0 0 0 1px ${accentColor}11`,
            padding: '10px 14px',
            fontSize: 11,
            color: 'rgba(255,255,255,0.5)',
            lineHeight: 1.7,
            maxWidth: 440,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              color: `${accentColor}55`,
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Criteria
          </div>
          {text}
        </div>
      )}
    </div>
  )
}

// ── Question block ────────────────────────────────────────────────────────────

function QuestionBlock({
  group,
  isOpen,
  onToggle,
  displayIndex,
  color: blockColor,
}: {
  group: QuestionGroup
  isOpen: boolean
  onToggle: () => void
  displayIndex: number
  color?: string
}) {
  const { question, description, content, hasSelf, hasManager } = group
  const descText = description
    .filter((b) => b.type === 'p' || b.type === 'h2')
    .map((b) => b.text)
    .join(' ')
    .trim()
  const activeColor = blockColor ?? Q_COLOR
  const num = displayIndex + 1

  return (
    <div
      style={{
        margin: '10px 0 0',
        border: `1px solid ${activeColor}4D`,
        borderLeft: `3px solid ${activeColor}`,
        borderRadius: 3,
        background: `${activeColor}0A`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 14px' }}>
        <span style={{ marginTop: 1, flexShrink: 0 }}>
          <IconQuestion color={activeColor} />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: `${activeColor}45`,
            flexShrink: 0,
            marginTop: 2,
            lineHeight: 1,
          }}
        >
          {num}.
        </span>
        <DescriptionTooltip text={descText} accentColor={activeColor}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: `${activeColor}DD`,
              lineHeight: 1.6,
              userSelect: 'text',
              cursor: 'text',
              display: 'block',
            }}
          >
            {question.text}
          </span>
        </DescriptionTooltip>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 8,
            flexShrink: 0,
            alignSelf: 'center',
          }}
        >
          {!isOpen && <CollapsedIndicators hasSelf={hasSelf} hasManager={hasManager} />}
          <CollapseButton isOpen={isOpen} color={activeColor} onToggle={onToggle} />
        </div>
      </div>
      {isOpen && (
        <div style={{ padding: '0 14px 14px' }}>
          {groupByContext(content).map((sec, i) => (
            <ContextSectionBlock key={i} section={sec} idx={i} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Competency block ──────────────────────────────────────────────────────────

function CompetencyBlock({
  group,
  isOpen,
  onToggle,
  displayIndex,
}: {
  group: CompetencyGroup
  isOpen: boolean
  onToggle: () => void
  displayIndex: number
}) {
  const { header, description, content, hasSelf, hasManager } = group
  const { name, category } = parseCompetencyName(header.text)
  const descBlocks = description.filter((b) => b.type === 'p')
  const num = displayIndex + 1

  const descText = descBlocks
    .map((b) => b.text)
    .join(' ')
    .trim()

  return (
    <div
      style={{
        margin: '8px 0 0',
        border: `1px solid ${COMP_COLOR}38`,
        borderLeft: `3px solid ${COMP_COLOR}`,
        borderRadius: 3,
        background: `${COMP_COLOR}08`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 14px' }}>
        <span style={{ flexShrink: 0 }}>
          <IconCompetency />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: `${COMP_COLOR}45`,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {num}.
        </span>
        <DescriptionTooltip text={descText} accentColor={COMP_COLOR}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: `${COMP_COLOR}EE`,
              lineHeight: 1.5,
              userSelect: 'text',
              cursor: 'text',
              display: 'block',
            }}
          >
            {name}
          </span>
        </DescriptionTooltip>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {category && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: `${COMP_COLOR}44`,
                letterSpacing: 1.2,
                textTransform: 'uppercase',
              }}
            >
              {category}
            </span>
          )}
          {!isOpen && <CollapsedIndicators hasSelf={hasSelf} hasManager={hasManager} />}
          <CollapseButton isOpen={isOpen} color={COMP_COLOR} onToggle={onToggle} />
        </div>
      </div>
      {isOpen && (
        <div style={{ padding: '0 14px 14px' }}>
          {groupByContext(content).map((sec, i) => (
            <ContextSectionBlock key={i} section={sec} idx={i} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Manager question block ────────────────────────────────────────────────────

const MGR_RATING_OPTIONS = [
  { value: "let's grow together", label: "Let's Grow Together", color: '#FF4444' },
  { value: 'meeting expectations', label: 'Meeting Expectations', color: '#FFD93D' },
  { value: 'exceeding expectations', label: 'Exceeding Expectations', color: '#00FFFF' },
  { value: 'driving excellence', label: 'Driving Excellence', color: '#FF00FF' },
]

interface MgrSlot {
  questionText: string
  descText: string
  rating: { label: string; color: string; bg: string } | null
  promotion: 'yes' | 'no' | null
  text: string
}

const FIXED_MGR_Q = [
  "Overall, how would you evaluate this person's performance?",
  'Would you like to nominate this person for promotion?',
  'If "yes" please provide a detailed explanation for the promotion.',
  'Any other information for your P&C Business Partner?',
] as const

function buildMgrSlots(
  managerOnly: Array<{ kind: 'question-group'; group: QuestionGroup; index: number }>
): MgrSlot[] {
  const q1Group = managerOnly[0]?.group ?? null

  // Rating is placed before the Manager banner in PDF layout → lives in description
  const descRatingBlock = q1Group?.description.find((b) => b.type === 'rating') ?? null
  const contentRatingBlock = q1Group?.content.find((b) => b.type === 'rating') ?? null
  const rating = descRatingBlock
    ? detectRating(descRatingBlock.text)
    : contentRatingBlock
      ? detectRating(contentRatingBlock.text)
      : null

  // Promo answer ("Yes"/"No") appears as a standalone line in manager context
  let promotion: 'yes' | 'no' | null = null
  if (q1Group) {
    const mgrSections = groupByContext(q1Group.content).filter((s) => s.kind === 'manager')
    outer: for (const sec of mgrSections) {
      for (const item of sec.items) {
        const t = item.text.trim().toLowerCase()
        if (t === 'yes' || t === 'no') {
          promotion = t as 'yes' | 'no'
          break outer
        }
      }
    }
  }

  const q1Text = q1Group?.question.text ?? FIXED_MGR_Q[0]
  const q1Desc = q1Group
    ? q1Group.description
        .filter((b) => b.type === 'p')
        .map((b) => b.text)
        .join(' ')
        .trim()
    : ''

  return [
    { questionText: q1Text, descText: q1Desc, rating, promotion: null, text: '' },
    { questionText: FIXED_MGR_Q[1], descText: '', rating: null, promotion, text: '' },
    { questionText: FIXED_MGR_Q[2], descText: '', rating: null, promotion: null, text: '' },
    { questionText: FIXED_MGR_Q[3], descText: '', rating: null, promotion: null, text: '' },
  ]
}

function ManagerQuestionBlock({ slot, displayIndex }: { slot: MgrSlot; displayIndex: number }) {
  const { questionText, descText, rating, promotion, text } = slot
  const num = displayIndex + 1

  const isRatingQ = displayIndex === 0
  const isPromoQ = displayIndex === 1
  const isTextQ = displayIndex >= 2

  return (
    <div
      style={{
        margin: '10px 0 0',
        border: `1px solid ${MGR_COLOR}4D`,
        borderLeft: `3px solid ${MGR_COLOR}`,
        borderRadius: 3,
        background: `${MGR_COLOR}08`,
        overflow: 'hidden',
      }}
    >
      {/* Question header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 9,
          padding: '10px 14px',
          borderBottom: `1px solid ${MGR_COLOR}18`,
        }}
      >
        <span style={{ marginTop: 1, flexShrink: 0 }}>
          <IconQuestion color={MGR_COLOR} />
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 10,
            fontWeight: 700,
            color: `${MGR_COLOR}45`,
            flexShrink: 0,
            marginTop: 2,
            lineHeight: 1,
          }}
        >
          {num}.
        </span>
        <DescriptionTooltip text={descText} accentColor={MGR_COLOR}>
          <span
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: `${MGR_COLOR}DD`,
              lineHeight: 1.6,
              display: 'block',
            }}
          >
            {questionText}
          </span>
        </DescriptionTooltip>
      </div>

      {/* Answer area */}
      <div style={{ padding: '10px 14px 12px' }}>
        {isRatingQ && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {MGR_RATING_OPTIONS.map((opt) => {
              const isActive =
                rating !== null && rating.label.toLowerCase() === opt.label.toLowerCase()
              return (
                <span
                  key={opt.value}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    padding: '4px 12px',
                    borderRadius: 16,
                    background: isActive ? `${opt.color}22` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${isActive ? `${opt.color}66` : 'rgba(255,255,255,0.07)'}`,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? opt.color : 'rgba(255,255,255,0.2)',
                    letterSpacing: 0.3,
                  }}
                >
                  {isActive && (
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                        background: opt.color,
                        boxShadow: `0 0 6px ${opt.color}`,
                        flexShrink: 0,
                        display: 'inline-block',
                      }}
                    />
                  )}
                  {opt.label}
                </span>
              )
            })}
          </div>
        )}

        {isPromoQ && (
          <div style={{ display: 'flex', gap: 10 }}>
            {(['YES', 'NO'] as const).map((val) => {
              const isActive = promotion !== null && val.toLowerCase() === promotion
              const c = val === 'YES' ? '#FFD93D' : 'rgba(255,100,100,0.85)'
              return (
                <span
                  key={val}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 20px',
                    borderRadius: 16,
                    background: isActive
                      ? val === 'YES'
                        ? 'rgba(255,217,61,0.12)'
                        : 'rgba(255,100,100,0.08)'
                      : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isActive ? `${c}66` : 'rgba(255,255,255,0.07)'}`,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 400,
                    color: isActive ? c : 'rgba(255,255,255,0.18)',
                    letterSpacing: 1,
                  }}
                >
                  {isActive && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        background: c,
                        boxShadow: `0 0 6px ${c}`,
                        flexShrink: 0,
                      }}
                    />
                  )}
                  {val}
                </span>
              )
            })}
          </div>
        )}

        {isTextQ && text && (
          <div
            style={{
              padding: '10px 14px',
              background: `${MGR_COLOR}06`,
              border: `1px solid ${MGR_BORDER}`,
              borderRadius: 3,
              fontSize: 13,
              color: 'rgba(255,255,255,0.72)',
              lineHeight: 1.75,
              whiteSpace: 'pre-wrap',
            }}
          >
            {text}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function DocumentModal({ title, content, onClose }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const questionsRef = useRef<HTMLDivElement>(null)
  const competenciesRef = useRef<HTMLDivElement>(null)
  const managerRef = useRef<HTMLDivElement>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const blocks = formatContent(content)
  const segments = groupBlocks(blocks)

  const standalones = segments.filter((s) => s.kind === 'standalone')
  const questions = segments.filter(
    (s) => s.kind === 'question-group' && (s.group.hasSelf || !s.group.hasManager)
  ) as Extract<(typeof segments)[0], { kind: 'question-group' }>[]
  const competencies = segments.filter((s) => s.kind === 'competency-group') as Extract<
    (typeof segments)[0],
    { kind: 'competency-group' }
  >[]
  const managerOnly = segments.filter(
    (s) => s.kind === 'question-group' && !s.group.hasSelf && s.group.hasManager
  ) as Extract<(typeof segments)[0], { kind: 'question-group' }>[]

  const hasQ = questions.length > 0
  const hasComp = competencies.length > 0
  const hasMgr = managerOnly.length > 0
  const mgrSlots = hasMgr ? buildMgrSlots(managerOnly) : []

  const legendItems = [
    { label: 'Question', color: Q_COLOR, show: hasQ, ref: questionsRef },
    { label: 'Competences', color: COMP_COLOR, show: hasComp, ref: competenciesRef },
    { label: 'Manager', color: MGR_COLOR, show: hasMgr, ref: managerRef },
  ]

  return (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 840,
          maxHeight: '90vh',
          background: '#080812',
          border: '1px solid rgba(0,255,255,0.2)',
          boxShadow: '0 0 60px rgba(0,255,255,0.06), 0 32px 80px rgba(0,0,0,0.9)',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderBottom: '1px solid rgba(0,255,255,0.1)',
            flexShrink: 0,
            gap: 12,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: 2,
              color: 'var(--neon-cyan)',
              textTransform: 'uppercase',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </span>

          {/* 3 clickable legend dots — only shown when section exists */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            {legendItems
              .filter((l) => l.show)
              .map(({ label, color, ref: sectionRef }) => (
                <button
                  key={label}
                  onClick={() =>
                    sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'none',
                    border: `1px solid ${color}30`,
                    borderRadius: 3,
                    cursor: 'pointer',
                    padding: '3px 8px',
                    transition: 'border-color 120ms, background 120ms',
                  }}
                  onMouseEnter={(e) => {
                    const b = e.currentTarget
                    b.style.background = `${color}12`
                    b.style.borderColor = `${color}70`
                  }}
                  onMouseLeave={(e) => {
                    const b = e.currentTarget
                    b.style.background = 'none'
                    b.style.borderColor = `${color}30`
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: color,
                      boxShadow: `0 0 4px ${color}`,
                      display: 'inline-block',
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 8,
                      color: `${color}99`,
                      letterSpacing: 1.5,
                    }}
                  >
                    {label.toUpperCase()}
                  </span>
                </button>
              ))}
          </div>

          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.4)',
              cursor: 'pointer',
              width: 26,
              height: 26,
              borderRadius: 3,
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 120ms',
              flexShrink: 0,
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement
              b.style.color = '#fff'
              b.style.borderColor = 'rgba(255,255,255,0.4)'
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement
              b.style.color = 'rgba(255,255,255,0.4)'
              b.style.borderColor = 'rgba(255,255,255,0.1)'
            }}
          >
            ×
          </button>
        </div>

        {/* ── Body ── */}
        <div style={{ overflowY: 'auto', padding: '20px 28px 32px', flex: 1 }}>
          {/* Metadata standalones (title, headers) */}
          {standalones.map((s, i) => renderBlock(s.block, i))}

          {/* ── Section 1: Questions ── */}
          {hasQ && (
            <>
              <div ref={questionsRef} />
              <SectionDivider label="Questions" color={Q_COLOR} count={questions.length} />
              {questions.map((s, i) => (
                <QuestionBlock
                  key={`q-${s.index}`}
                  group={s.group}
                  displayIndex={i}
                  isOpen={!collapsed.has(`q${s.index}`)}
                  onToggle={() => toggle(`q${s.index}`)}
                />
              ))}
            </>
          )}

          {/* ── Section 2: Competences ── */}
          {hasComp && (
            <>
              <div ref={competenciesRef} />
              <SectionDivider label="Competences" color={COMP_COLOR} count={competencies.length} />
              {competencies.map((s, i) => (
                <CompetencyBlock
                  key={`c-${s.index}`}
                  group={s.group}
                  displayIndex={i}
                  isOpen={!collapsed.has(`c${s.index}`)}
                  onToggle={() => toggle(`c${s.index}`)}
                />
              ))}
            </>
          )}

          {/* ── Section 3: Manager ── */}
          {hasMgr && (
            <>
              <div ref={managerRef} />
              <SectionDivider label="Manager" color={MGR_COLOR} count={4} />
              {mgrSlots.map((slot, i) => (
                <ManagerQuestionBlock key={`m-${i}`} slot={slot} displayIndex={i} />
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
