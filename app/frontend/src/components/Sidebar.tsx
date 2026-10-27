import {
  ListChecks,
  TowerControl,
  Stethoscope,
  BookOpen,
  BarChart3,
  LineChart,
  Users,
  Target,
  ChevronRight,
  ChevronsLeft,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { BrainLogo } from './BrainLogo'

export type Page =
  | 'home'
  | 'setup'
  | 'control-tower'
  | 'goals-tasks'
  | 'knowledge-hub'
  | 'data-hub'
  | 'reporting'
  | 'people-hub'
  | 'system-health'
export type NavState = 1 | 2 | 3

interface NavItem {
  page: Page
  icon: LucideIcon
  label: string
  enabled: boolean
}

// 'home' is intentionally not listed here — the brain logo at the top acts as
// the Home button (click the icon or "OZOS Brain" text).
const NAV_ITEMS: NavItem[] = [
  { page: 'setup', icon: ListChecks, label: 'Setup', enabled: true },
  { page: 'control-tower', icon: TowerControl, label: 'Control Tower', enabled: true },
  { page: 'goals-tasks', icon: Target, label: 'Goals & Tasks', enabled: true },
  { page: 'knowledge-hub', icon: BookOpen, label: 'Knowledge Hub', enabled: true },
  { page: 'data-hub', icon: BarChart3, label: 'Data Hub', enabled: true },
  { page: 'reporting', icon: LineChart, label: 'Insights Hub', enabled: true },
  { page: 'people-hub', icon: Users, label: 'People Hub', enabled: true },
  { page: 'system-health', icon: Stethoscope, label: 'System Health', enabled: true },
]

const WIDTHS: Record<NavState, number> = { 1: 190, 2: 56, 3: 12 }
const NAV_T =
  'width 280ms cubic-bezier(0.25,0.46,0.45,0.94), min-width 280ms cubic-bezier(0.25,0.46,0.45,0.94)'
const LABEL_T = 'opacity 160ms ease, max-width 260ms cubic-bezier(0.25,0.46,0.45,0.94)'

interface Props {
  activePage: Page
  onNavigate: (page: Page) => void
  navState: NavState
  onNavStateChange: (state: NavState) => void
}

export function Sidebar({ activePage, onNavigate, navState, onNavStateChange }: Props) {
  const expanded = navState === 1
  const hidden = navState === 3

  const toggleExpand = () => onNavStateChange(expanded ? 2 : 1)

  // Clicking the active nav item toggles expansion (state 1 ↔ 2)
  // Clicking an inactive item just navigates
  const handleNavClick = (item: NavItem) => {
    if (!item.enabled) return
    if (activePage === item.page) {
      toggleExpand()
    } else {
      onNavigate(item.page)
    }
  }

  return (
    <aside
      style={{
        width: WIDTHS[navState],
        minWidth: WIDTHS[navState],
        height: '100vh',
        position: 'sticky',
        top: 0,
        display: 'flex',
        flexDirection: 'column',
        background: hidden ? 'transparent' : 'rgba(13,17,36,0.97)',
        borderRight: hidden ? 'none' : '1px solid rgba(0,255,255,0.13)',
        transition: NAV_T,
        overflow: 'hidden',
        flexShrink: 0,
        zIndex: 100,
      }}
    >
      {/* ── State 3: hidden strip with pulsing expand indicator ── */}
      {hidden && (
        <div
          onClick={() => onNavStateChange(2)}
          title="Show navigation"
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            background: 'rgba(0,255,255,0.03)',
            borderRight: '2px solid rgba(0,255,255,0.35)',
          }}
        >
          <style>{`@keyframes strip-pulse{0%,100%{opacity:0.35}50%{opacity:0.9}}`}</style>
          <ChevronRight
            size={8}
            color="var(--neon-cyan)"
            style={{ animation: 'strip-pulse 2.5s ease-in-out infinite' }}
          />
        </div>
      )}

      {/* ── States 1 & 2: full sidebar ── */}
      {!hidden && (
        <>
          {/* Neon left-edge line */}
          <div
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 2,
              background:
                'linear-gradient(to bottom,transparent,var(--neon-cyan) 20%,var(--neon-cyan) 80%,transparent)',
              opacity: 0.45,
              boxShadow: '0 0 5px var(--neon-cyan)',
              pointerEvents: 'none',
            }}
          />

          {/* ── Logo / header ── */}
          <style>{`
            @keyframes neon-text {
              0%, 100% { text-shadow: 0 0 6px rgba(0,255,255,0.5), 0 0 12px rgba(0,255,255,0.2); opacity: 1; }
              45%      { text-shadow: 0 0 10px rgba(0,255,255,0.85), 0 0 22px rgba(0,255,255,0.4), 0 0 40px rgba(0,255,255,0.15); opacity: 1; }
              48%      { text-shadow: 0 0 3px rgba(0,255,255,0.3); opacity: 0.85; }
              50%      { text-shadow: 0 0 10px rgba(0,255,255,0.85), 0 0 22px rgba(0,255,255,0.4); opacity: 1; }
            }
          `}</style>
          <div
            onClick={() => onNavigate('home')}
            title={!expanded ? 'Home' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: expanded ? 'flex-start' : 'center',
              padding: expanded ? '14px 14px 14px 16px' : '14px 0',
              gap: expanded ? 10 : 0,
              borderBottom: '1px solid rgba(0,255,255,0.08)',
              borderLeft:
                activePage === 'home' ? '2px solid var(--neon-cyan)' : '2px solid transparent',
              background: activePage === 'home' ? 'rgba(0,255,255,0.06)' : 'transparent',
              flexShrink: 0,
              overflow: 'hidden',
              cursor: 'pointer',
              transition: 'background 150ms ease',
            }}
            onMouseEnter={(e) => {
              if (activePage !== 'home')
                (e.currentTarget as HTMLElement).style.background = 'rgba(0,255,255,0.035)'
            }}
            onMouseLeave={(e) => {
              if (activePage !== 'home')
                (e.currentTarget as HTMLElement).style.background = 'transparent'
            }}
          >
            <BrainLogo height={expanded ? 26 : 21} />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--neon-cyan)',
                letterSpacing: 2,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
                opacity: expanded ? 1 : 0,
                maxWidth: expanded ? 120 : 0,
                overflow: 'hidden',
                transition: LABEL_T,
                animation: expanded ? 'neon-text 5s ease-in-out infinite' : 'none',
              }}
            >
              OZOS Brain
            </span>
          </div>

          {/* ── Nav items ── */}
          <nav style={{ flex: 1, paddingTop: 6, overflow: 'hidden' }}>
            {NAV_ITEMS.map((item) => {
              const isActive = activePage === item.page
              const Icon = item.icon
              return (
                <div
                  key={item.page}
                  onClick={() => handleNavClick(item)}
                  title={!expanded ? item.label : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: expanded ? 10 : 0,
                    padding: expanded ? '9px 14px 9px 16px' : '9px 0',
                    justifyContent: expanded ? 'flex-start' : 'center',
                    cursor: item.enabled ? 'pointer' : 'not-allowed',
                    opacity: item.enabled ? 1 : 0.28,
                    background: isActive ? 'rgba(0,255,255,0.06)' : 'transparent',
                    borderLeft: isActive ? '2px solid var(--neon-cyan)' : '2px solid transparent',
                    marginLeft: expanded ? 2 : 0,
                    transition: 'background 150ms ease',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    if (item.enabled && !isActive)
                      (e.currentTarget as HTMLElement).style.background = 'rgba(0,255,255,0.035)'
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'
                  }}
                >
                  <Icon
                    size={15}
                    color={isActive ? 'var(--neon-cyan)' : 'var(--text-dim)'}
                    style={{
                      flexShrink: 0,
                      filter: isActive ? 'drop-shadow(0 0 3px var(--neon-cyan))' : 'none',
                    }}
                  />
                  <div
                    style={{
                      overflow: 'hidden',
                      opacity: expanded ? 1 : 0,
                      maxWidth: expanded ? 160 : 0,
                      transition: LABEL_T,
                      whiteSpace: 'nowrap',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 12,
                        fontWeight: isActive ? 600 : 400,
                        color: isActive ? 'var(--neon-cyan)' : 'var(--text)',
                        textShadow: isActive ? '0 0 5px var(--neon-cyan)' : 'none',
                      }}
                    >
                      {item.label}
                    </span>
                    {!item.enabled && (
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontSize: 8,
                          color: 'var(--text-dim)',
                          border: '1px solid rgba(148,163,184,0.2)',
                          padding: '1px 4px',
                          letterSpacing: 0.5,
                          flexShrink: 0,
                        }}
                      >
                        SOON
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </nav>

          {/* ── Bottom: hide-completely button ── */}
          <div
            style={{
              padding: '10px 0 12px',
              borderTop: '1px solid rgba(0,255,255,0.08)',
              display: 'flex',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <button
              onClick={() => onNavStateChange(3)}
              title="Hide navigation"
              style={{
                background: 'none',
                border: 'none',
                padding: 4,
                cursor: 'pointer',
                color: 'rgba(148,163,184,0.3)',
                display: 'flex',
                alignItems: 'center',
                transition: 'color 150ms ease',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,0.7)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.color = 'rgba(148,163,184,0.3)'
              }}
            >
              <ChevronsLeft size={13} />
            </button>
          </div>
        </>
      )}
    </aside>
  )
}
