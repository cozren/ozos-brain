import { useState } from 'react'
import { SectionHeader } from './SectionHeader'
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts'
import { COMPETENCY_KEYS, COMPETENCY_LABELS, COMPETENCY_VALUE_MAP } from '../types'
import type { CompetencySet, CompetencyValue } from '../types'

interface Props {
  self: CompetencySet | null
  manager: CompetencySet | null
}

const VALUE_LABELS: Record<number, string> = {
  0: 'N/A',
  1: 'Need Improvement',
  2: 'Meeting Expectations',
  3: 'Exceeding Expectations',
}

const SCALE = [
  { n: 0, label: 'N/A', color: 'rgba(255,255,255,0.18)' },
  { n: 1, label: 'Need Improvement', color: '#FF6B6B' },
  { n: 2, label: 'Meeting Expectations', color: '#FFD93D' },
  { n: 3, label: 'Exceeding Expectations', color: '#00FFFF' },
]

function toNum(val: CompetencyValue | undefined | null): number {
  if (!val) return 0
  return COMPETENCY_VALUE_MAP[val] ?? 0
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null
  const subject = payload[0]?.payload?.subject
  return (
    <div
      style={{
        background: '#0a0a14',
        border: '1px solid rgba(0,255,255,0.2)',
        padding: '8px 12px',
        fontSize: 11,
        fontFamily: 'var(--font-mono)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{ color: 'rgba(255,255,255,0.5)', marginBottom: 5, letterSpacing: 1, fontSize: 9 }}
      >
        {subject?.toUpperCase()}
      </div>
      {payload.map((p: any) => (
        <div key={p.name} style={{ color: p.stroke, marginBottom: 2 }}>
          {p.name.toUpperCase()}: {VALUE_LABELS[p.value] ?? '—'}
        </div>
      ))}
    </div>
  )
}

export function CompetencyRadar({ self, manager }: Props) {
  const hasManager = !!(manager && COMPETENCY_KEYS.some((k) => manager[k] != null))
  const [showSelf, setShowSelf] = useState(true)
  const [showManager, setShowManager] = useState(true)

  const data = COMPETENCY_KEYS.map((key) => ({
    subject: COMPETENCY_LABELS[key],
    self: toNum(self?.[key]),
    manager: toNum(manager?.[key]),
  }))

  const toggleBtn = (active: boolean, color: string, label: string, onToggle: () => void) => (
    <button
      onClick={onToggle}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
        fontSize: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        color: active ? color : 'rgba(255,255,255,0.2)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: 1,
        transition: 'color 150ms',
      }}
    >
      <span
        style={{
          display: 'inline-block',
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: active ? color : 'rgba(255,255,255,0.15)',
          boxShadow: active ? `0 0 5px ${color}` : 'none',
          transition: 'all 150ms',
        }}
      />
      {label}
    </button>
  )

  return (
    <div>
      <SectionHeader label="COMPETENCIES" />

      <div style={{ display: 'flex', gap: 14, marginBottom: 4 }}>
        {toggleBtn(showSelf, '#00FFFF', 'SELF', () => setShowSelf((v) => !v))}
        {toggleBtn(showManager, '#FF00FF', 'MANAGER', () => setShowManager((v) => !v))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <RadarChart data={data} margin={{ top: 18, right: 32, bottom: 18, left: 32 }}>
          <PolarGrid stroke="rgba(0,255,255,0.12)" />
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: '#64748B', fontSize: 9, fontFamily: 'Fira Code' }}
          />
          <PolarRadiusAxis domain={[0, 3]} tickCount={4} tick={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={false} />
          {showSelf && (
            <Radar
              name="Self"
              dataKey="self"
              stroke="#00FFFF"
              fill="#00FFFF"
              fillOpacity={0.18}
              strokeWidth={1.5}
              dot={{ r: 2.5, fill: '#00FFFF', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#00FFFF', stroke: 'rgba(0,255,255,0.35)', strokeWidth: 3 }}
            />
          )}
          {showManager && (
            <Radar
              name="Manager"
              dataKey="manager"
              stroke="#FF00FF"
              fill="#FF00FF"
              fillOpacity={0.15}
              strokeWidth={1.5}
              dot={{ r: 2.5, fill: '#FF00FF', strokeWidth: 0 }}
              activeDot={{ r: 5, fill: '#FF00FF', stroke: 'rgba(255,0,255,0.35)', strokeWidth: 3 }}
            />
          )}
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
