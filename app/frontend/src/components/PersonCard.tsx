import { useState, useEffect, useRef } from 'react'
import { GoalsSection } from './GoalsSection'
import { NotesSection } from './NotesSection'
import { DocumentZone } from './DocumentZone'
import { CompetencyRadar } from './RadarChart'
import { SectionHeader } from './SectionHeader'
import { FinalizeControl } from './FinalizeControl'
import { PrevGoalsReminder } from './PrevGoalsReminder'
import { DocumentModal } from './DocumentModal'
import type { PersonMeta, CycleSummary, Rating, Goal } from '../types'
import { api } from '../api'

interface Props {
  person: PersonMeta
  selectedCycle: string
  onDelete?: () => void
}

// Self overall — competency scale
const SELF_SEGS = [
  { value: 'need-improvement', color: '#FF6B6B', label: 'Need Improvement' },
  { value: 'meeting-expectations', color: '#FFD93D', label: 'Meeting Expectations' },
  { value: 'exceeding-expectations', color: '#00FFFF', label: 'Exceeding Expectations' },
]

// Manager formal rating scale
const MGR_SEGS: { value: Exclude<Rating, null>; color: string; label: string }[] = [
  { value: 'lets-grow-together', color: '#FF4444', label: "Let's Grow Together" },
  { value: 'meeting-expectations', color: '#FFD93D', label: 'Meeting Expectations' },
  { value: 'exceeding-expectations', color: '#00FFFF', label: 'Exceeding Expectations' },
  { value: 'driving-excellence', color: '#FF00FF', label: 'Driving Excellence' },
]

function MiniBar({
  segments,
  activeValue,
  sideLabel,
  sideColor,
  onClick,
}: {
  segments: { value: string; color: string; label: string }[]
  activeValue: string | null | undefined
  sideLabel: string
  sideColor: string
  onClick?: (value: string) => void
}) {
  const active = segments.find((s) => s.value === activeValue)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span
        style={{
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          letterSpacing: 1.5,
          color: sideColor,
          width: 58,
          flexShrink: 0,
          opacity: 0.75,
        }}
      >
        {sideLabel}
      </span>
      <div style={{ display: 'flex', gap: 3 }}>
        {segments.map((seg) => {
          const isActive = seg.value === activeValue
          return (
            <div
              key={seg.value}
              title={seg.label}
              onClick={() => onClick?.(seg.value)}
              style={{
                width: 22,
                height: 5,
                borderRadius: 3,
                background: isActive ? seg.color : 'rgba(255,255,255,0.07)',
                boxShadow: isActive ? `0 0 6px ${seg.color}88` : 'none',
                cursor: onClick ? 'pointer' : 'default',
                transition: 'all 130ms',
              }}
              onMouseEnter={(e) => {
                if (onClick) (e.currentTarget as HTMLDivElement).style.opacity = '0.65'
              }}
              onMouseLeave={(e) => {
                if (onClick) (e.currentTarget as HTMLDivElement).style.opacity = '1'
              }}
            />
          )
        })}
      </div>
      <span
        style={{
          fontSize: 9,
          fontFamily: 'var(--font-mono)',
          letterSpacing: 0.5,
          color: active ? active.color : 'rgba(255,255,255,0.18)',
        }}
      >
        {active ? active.label.toUpperCase() : '—'}
      </span>
    </div>
  )
}

export function PersonCard({ person, selectedCycle, onDelete }: Props) {
  const [summary, setSummary] = useState<CycleSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [docModal, setDocModal] = useState<{ title: string; content: string } | null>(null)
  const [isHidden, setIsHidden] = useState(false)
  const [showDotMenu, setShowDotMenu] = useState(false)
  const dotMenuRef = useRef<HTMLDivElement>(null)

  // The page (Timeline) drives which cycle is shown; refetch whenever it changes.
  useEffect(() => {
    setLoading(true)
    setSummary(null)
    fetch(`/api/people/${person.name}/cycles/${selectedCycle}`)
      .then((r) => {
        if (!r.ok) throw new Error()
        return r.json()
      })
      .then((data) => {
        setSummary(data)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [person.name, selectedCycle])

  const handleRatingChange = async (rating: Rating) => {
    await api.updateCycleSummary(person.name, selectedCycle, { manager_rating: rating })
    setSummary((s) => (s ? { ...s, manager_rating: rating } : s))
  }

  const handleGoalsChange = async (goals: Goal[]) => {
    await api.updateCycleSummary(person.name, selectedCycle, { key_goals: goals })
    setSummary((s) => (s ? { ...s, key_goals: goals } : s))
  }

  const handleAccomplishmentsChange = async (items: Goal[]) => {
    await api.updateCycleSummary(person.name, selectedCycle, { key_accomplishments: items })
    setSummary((s) => (s ? { ...s, key_accomplishments: items } : s))
  }

  const handleNotesChange = async (notes: string) => {
    await api.updateCycleSummary(person.name, selectedCycle, { personal_notes: notes })
    setSummary((s) => (s ? { ...s, personal_notes: notes } : s))
  }

  // Finalize/reopen this person's cycle (selection itself lives in the Timeline).
  const handleSetStatus = async (status: 'active' | 'finalized') => {
    await api.updateCycleSummary(person.name, selectedCycle, { status })
    setSummary((s) => (s ? { ...s, status } : s))
  }

  return (
    <>
      <div
        className="card"
        style={{
          flex: 1,
          minWidth: 280,
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 18,
        }}
      >
        {/* Person header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ minWidth: 0 }}>
            {!isHidden ? (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'var(--neon-cyan)',
                  textShadow: '0 0 8px var(--neon-cyan)',
                }}
              >
                {person.display_name.toUpperCase()}
              </div>
            ) : (
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 800,
                  color: 'rgba(0,255,255,0.12)',
                  letterSpacing: 3,
                }}
              >
                ■ ■ ■ ■ ■
              </div>
            )}
            {!isHidden && (
              <>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 2 }}>
                  {person.role}
                </div>
                <div
                  style={{
                    fontSize: 9,
                    color: 'rgba(255,255,255,0.22)',
                    marginTop: 2,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: 1,
                  }}
                >
                  SINCE {person.start_date}
                </div>
              </>
            )}
          </div>

          {/* Top-right: per-card finalize control + utilities, right-aligned */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 8,
              flexShrink: 0,
              marginTop: 2,
            }}
          >
            {!isHidden && summary && (
              <FinalizeControl
                status={summary.status}
                onFinalize={() => handleSetStatus('finalized')}
                onReopen={() => handleSetStatus('active')}
              />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {/* Privacy toggle */}
              <button
                onClick={() => setIsHidden((v) => !v)}
                title={isHidden ? 'Show data' : 'Hide data'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 3,
                  color: isHidden ? 'rgba(255,0,255,0.6)' : 'rgba(255,255,255,0.25)',
                  transition: 'color 140ms',
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.color = isHidden
                    ? 'rgba(255,0,255,0.9)'
                    : 'rgba(255,255,255,0.55)')
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.color = isHidden
                    ? 'rgba(255,0,255,0.6)'
                    : 'rgba(255,255,255,0.25)')
                }
              >
                {isHidden ? (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  >
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>

              {/* Three-dot menu */}
              <div ref={dotMenuRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowDotMenu((v) => !v)}
                  onBlur={(e) => {
                    if (!dotMenuRef.current?.contains(e.relatedTarget as Node))
                      setTimeout(() => setShowDotMenu(false), 150)
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '3px 4px',
                    color: 'rgba(255,255,255,0.2)',
                    lineHeight: 1,
                    transition: 'color 140ms',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
                >
                  <svg width="12" height="12" viewBox="0 0 4 16" fill="currentColor">
                    <circle cx="2" cy="2" r="1.5" />
                    <circle cx="2" cy="8" r="1.5" />
                    <circle cx="2" cy="14" r="1.5" />
                  </svg>
                </button>
                {showDotMenu && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '100%',
                      right: 0,
                      zIndex: 20,
                      background: '#0d0d1a',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 3,
                      minWidth: 130,
                      boxShadow: '0 8px 24px rgba(0,0,0,0.7)',
                    }}
                  >
                    <button
                      onClick={() => {
                        setShowDotMenu(false)
                        if (confirm(`Delete ${person.display_name}? This cannot be undone.`))
                          onDelete?.()
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '8px 12px',
                        fontSize: 10,
                        fontFamily: 'var(--font-mono)',
                        letterSpacing: 1,
                        color: 'rgba(255,80,80,0.65)',
                        transition: 'background 120ms, color 120ms',
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background =
                          'rgba(255,40,40,0.1)'
                        ;(e.currentTarget as HTMLButtonElement).style.color = '#ff4040'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background = 'none'
                        ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,80,80,0.65)'
                      }}
                    >
                      DELETE PERSON
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Hidden state placeholder */}
        {isHidden && (
          <div
            style={{
              flex: 1,
              minHeight: 360,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 14,
            }}
          >
            <svg
              width="72"
              height="72"
              viewBox="0 0 24 24"
              fill="none"
              stroke="rgba(255,0,255,0.22)"
              strokeWidth="1"
              strokeLinecap="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                letterSpacing: 3,
                color: 'rgba(255,0,255,0.2)',
              }}
            >
              PRIVATE
            </span>
          </div>
        )}

        {!isHidden && (
          <>
            {loading && (
              <div
                style={{
                  fontSize: 10,
                  color: 'var(--text-dim)',
                  letterSpacing: 2,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                LOADING…
              </div>
            )}
            {!loading && !summary && (
              <div
                style={{
                  fontSize: 10,
                  color: 'rgba(255,0,0,0.6)',
                  letterSpacing: 2,
                  fontFamily: 'var(--font-mono)',
                }}
              >
                NO CYCLE DATA
              </div>
            )}

            {summary && (
              <>
                {/* 1. Carried-over reminder from the previous cycle (read-only) */}
                <PrevGoalsReminder goals={summary.prev_growth_goals ?? []} />

                {/* 2. Key Accomplishments */}
                <GoalsSection
                  goals={summary.key_accomplishments ?? []}
                  onChange={handleAccomplishmentsChange}
                  label="KEY ACCOMPLISHMENTS"
                  placeholder="Add accomplishment..."
                  achievement
                />

                {/* 2. Documents */}
                <DocumentZone
                  documents={summary.documents}
                  onUpload={async (file, label) => {
                    await api.uploadDocument(person.name, selectedCycle, file, label)
                    const updated = await api.getCycleSummary(person.name, selectedCycle)
                    setSummary(updated)
                  }}
                  onView={async (filename) => {
                    const content = await api.getDocument(person.name, selectedCycle, filename)
                    setDocModal({ title: filename.replace('.md', ''), content })
                  }}
                  onDelete={async (filename) => {
                    const updated = await api.deleteDocument(person.name, selectedCycle, filename)
                    setSummary(updated)
                  }}
                />

                {/* 3. Competency radar */}
                <CompetencyRadar
                  self={summary.competencies?.self ?? null}
                  manager={summary.competencies?.manager ?? null}
                />

                {/* 4. Overall Performance */}
                <div
                  style={{
                    padding: '10px 12px',
                    border: `1px solid ${summary.promotion_nominated ? 'rgba(255,217,61,0.45)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 3,
                    background: summary.promotion_nominated
                      ? 'rgba(255,217,61,0.04)'
                      : 'rgba(255,255,255,0.02)',
                    boxShadow: summary.promotion_nominated
                      ? '0 0 12px rgba(255,217,61,0.18), 0 0 30px rgba(255,217,61,0.08)'
                      : 'none',
                    transition: 'border 300ms, box-shadow 300ms, background 300ms',
                  }}
                >
                  <SectionHeader label="OVERALL PERFORMANCE" />
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 9,
                      alignItems: 'flex-start',
                      width: 'fit-content',
                      margin: '0 auto',
                    }}
                  >
                    <MiniBar
                      segments={SELF_SEGS}
                      activeValue={summary.competencies?.self?.['overall'] ?? null}
                      sideLabel="SELF"
                      sideColor="#00FFFF"
                    />
                    <MiniBar
                      segments={MGR_SEGS}
                      activeValue={
                        summary.manager_rating ??
                        (() => {
                          const ov = summary.competencies?.manager?.['overall']
                          if (ov === 'need-improvement') return 'lets-grow-together'
                          if (ov === 'meeting-expectations') return 'meeting-expectations'
                          if (ov === 'exceeding-expectations') return 'exceeding-expectations'
                          return null
                        })()
                      }
                      sideLabel="MANAGER"
                      sideColor="#FF00FF"
                      onClick={(v) => handleRatingChange(v as Rating)}
                    />
                    {/* Promotion row — same alignment as MiniBar rows */}
                    <div
                      onClick={async () => {
                        const next = !(summary.promotion_nominated ?? false)
                        await api.updateCycleSummary(person.name, selectedCycle, {
                          promotion_nominated: next,
                        })
                        setSummary((s) => (s ? { ...s, promotion_nominated: next } : s))
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
                    >
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: 1.5,
                          color: '#FFD93D',
                          width: 58,
                          flexShrink: 0,
                          opacity: 0.75,
                        }}
                      >
                        PROMO
                      </span>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 22,
                          height: 14,
                        }}
                      >
                        <div
                          style={{
                            width: 9,
                            height: 9,
                            transform: 'rotate(45deg)',
                            background: summary.promotion_nominated
                              ? '#FFD93D'
                              : 'rgba(255,217,61,0.07)',
                            border: `1px solid ${summary.promotion_nominated ? '#FFD93D' : 'rgba(255,217,61,0.25)'}`,
                            boxShadow: summary.promotion_nominated
                              ? '0 0 7px #FFD93Daa, 0 0 18px #FFD93D44'
                              : 'none',
                            transition: 'all 220ms',
                          }}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: 9,
                          fontFamily: 'var(--font-mono)',
                          letterSpacing: 0.5,
                          color: summary.promotion_nominated ? '#FFD93D' : 'rgba(255,255,255,0.18)',
                          transition: 'color 220ms',
                        }}
                      >
                        {summary.promotion_nominated ? 'NOMINATED' : '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* This cycle's own Growth Goals */}
                <GoalsSection
                  goals={summary.key_goals ?? []}
                  onChange={handleGoalsChange}
                  label="GROWTH GOALS"
                  placeholder="Add growth goal..."
                />

                {/* 7. Personal Notes */}
                <NotesSection value={summary.personal_notes ?? ''} onChange={handleNotesChange} />
              </>
            )}
          </>
        )}
      </div>

      {docModal && (
        <DocumentModal
          title={docModal.title}
          content={docModal.content}
          onClose={() => setDocModal(null)}
        />
      )}
    </>
  )
}
