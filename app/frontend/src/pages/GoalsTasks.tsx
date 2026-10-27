import { useState } from 'react'
import { Target } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { PersonalTasks } from '../components/PersonalTasks'

type View = 'goals' | 'personal'

const CYAN = 'var(--neon-cyan)'

function BigSwitch({ view, onChange }: { view: View; onChange: (v: View) => void }) {
  const opt = (v: View, icon: string, label: string) => {
    const on = view === v
    return (
      <span
        onClick={() => onChange(v)}
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          justifyContent: 'center',
          width: 200,
          padding: '13px 0',
          fontSize: 16,
          fontWeight: 700,
          letterSpacing: 0.5,
          color: on ? CYAN : '#5f738c',
          cursor: 'pointer',
          userSelect: 'none',
          textShadow: on ? '0 0 12px rgba(45,212,255,0.67)' : 'none',
          transition: 'color 300ms, text-shadow 300ms',
        }}
      >
        {icon} {label}
      </span>
    )
  }
  return (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '6px 0 22px' }}>
      <div
        style={{
          position: 'relative',
          display: 'inline-flex',
          border: '1px solid rgba(45,212,255,0.23)',
          borderRadius: 14,
          padding: 5,
          background: '#0a1422',
          boxShadow: '0 0 26px rgba(45,212,255,0.06), inset 0 0 18px rgba(0,0,0,0.33)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 5,
            bottom: 5,
            left: 5,
            width: 'calc(50% - 5px)',
            borderRadius: 10,
            background: 'linear-gradient(180deg,#11324a,#0c2235)',
            border: '1px solid rgba(45,212,255,0.4)',
            boxShadow: '0 0 18px rgba(45,212,255,0.27), inset 0 0 12px rgba(45,212,255,0.13)',
            transform: view === 'personal' ? 'translateX(100%)' : 'none',
            transition: 'transform 420ms cubic-bezier(.3,.8,.3,1)',
          }}
        />
        {opt('goals', '◎', 'Goals')}
        {opt('personal', '☑', 'Personal')}
      </div>
    </div>
  )
}

const GOALS_EMPTY_COPY =
  'No goals defined yet. Goals are set up from Setup (coming in a later phase).'

export function GoalsTasks() {
  const [view, setView] = useState<View>('goals')

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 90 }}>
      <PageHeader
        title="Goals & Tasks"
        subtitle="Goals and personal tasks."
        icon={<Target size={44} strokeWidth={1.5} />}
      />
      <div style={{ padding: '6px 30px 0' }}>
        <BigSwitch view={view} onChange={setView} />
        {view === 'goals' ? (
          <section
            aria-label="Goals empty state"
            style={{
              display: 'flex',
              justifyContent: 'center',
              padding: '60px 20px',
              color: 'var(--text-dim)',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
              letterSpacing: 0.5,
              textAlign: 'center',
            }}
          >
            <p style={{ maxWidth: 480 }}>{GOALS_EMPTY_COPY}</p>
          </section>
        ) : (
          <PersonalTasks />
        )}
      </div>
    </div>
  )
}
