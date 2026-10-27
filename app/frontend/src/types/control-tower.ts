export type McpStatus = 'active' | 'needs-auth' | 'disabled' | 'error' | 'pending'
export type VitalStatus = 'ok' | 'warn' | 'fail'
export type HookStatus = 'ok' | 'warn'

export interface SessionStatus {
  active: boolean
  durationSeconds: number
  peonPing: 'live' | 'off'
  sessionsToday: number
  model: string
  tokensThisSession: number
  tokensAllTime: number
  estimatedCostUsd: number
}

export interface VitalFunction {
  id: string
  name: string
  status: VitalStatus
  metric: string // e.g. "3 new", "247 nodes", "3d stale"
  lastRunHuman: string // e.g. "42m ago", "3 days ago"
  lastRunIso: string | null // exact ISO timestamp of the last run (run-log or mtime)
  delta: string | null // items added last run, e.g. "+2" (null when unknown)
  badge: string // e.g. "SYNCED", "STALE", "CURRENT"
}

// Lazy per-vital detail, fetched when a vital row is clicked.
export interface VitalDetail {
  id: string
  lastRunIso: string | null
  lastRunHuman: string
  delta: string | null // count added in the most recent run ("just now"), e.g. "+2"
  todayCount: number // total items added across today's runs
  items: string[] // titles added today (e.g. synced meeting names)
}

export interface BrainOverview {
  meetingNotes: number
  documents: number
  goals: number
  reports: number
  people: number
  graphNodes: number
}

export interface McpEntry {
  name: string
  status: McpStatus
  products?: string[]
  connectionType?: 'api-connection' | 'product' | 'mcp'
}

export interface PluginEntry {
  name: string
  publisher: string
  version: string
  enabled: boolean
  installedAt: string
  lastUpdated: string
  gitCommitSha: string
}

export type SkillOrigin = 'mine' | 'external' | 'plugin'

export interface SkillEntry {
  name: string
  description: string
  origin: SkillOrigin
  source: string | null
  usageCount: number
  lastUsed: string | null
  version: string | null
  contextTokens: number
}

export interface HookEntry {
  event: string
  target: string
  command: string
  scope: 'global' | 'project'
  status: HookStatus
}

export interface CommandEntry {
  name: string
  description: string
  usageCount: number
  lastUsed: string | null
  contextTokens: number
}

export interface ControlTowerStatus {
  overallHealth: 'nominal' | 'degraded' | 'critical'
  session: SessionStatus
  vitals: VitalFunction[]
  brainOverview: BrainOverview
  mcps: {
    remote: McpEntry[]
    local: McpEntry[]
  }
  plugins: PluginEntry[]
  externalSkills: SkillEntry[]
  skills: SkillEntry[]
  commands: CommandEntry[]
  hooks: HookEntry[]
}
