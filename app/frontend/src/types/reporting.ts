// Reporting page — report sources and their dated instances.

export interface ReportSource {
  id: string
  label: string
  kind: string
  body: string
  runnable: boolean
}

export interface ReportInstanceMeta {
  id: string
  date: string
  label: string
  age: string
}

export interface ReportInstance {
  id: string
  date: string
  label: string
  body: string
  content: string
}

export interface RunStatus {
  state: 'idle' | 'running' | 'error'
  last_run: string | null
  last_exit: number | null
  /** Last meaningful output line on failure (control-tower vitals only). */
  error?: string | null
}

export interface RunStart {
  state: 'started' | 'running'
}

// The Reporting page uses the shared Loadout layout model (rows of tiles,
// each tile's `refId` is a report source id). See types/loadout.ts.
import type { LoadoutLayout } from './loadout'

export type ReportLayout = LoadoutLayout

// A point in a monthly revenue series.
export interface RevenuePoint {
  month: string // 'YYYY-MM'
  revenue: number
}

// The JSON payload a `chart`-body source (e.g. Metabase GAM revenue) emits.
export interface RevenueSnapshot {
  metric: string
  currency: string
  year: number
  generated_at: string
  series: RevenuePoint[]
  ytd_total: number
}

// --- Industry Pulse (body: 'industry-pulse') -------------------------------
// Internal-only scoring shown in the review widget, never in the post text.
export interface PulseScoring {
  confidence: string // High | Medium | Low
  post_worthiness: string // Strong | Medium
  freshness: string // Breaking | Recent | Background
}

export interface PulsePost {
  n: number
  template: string // A | B | C | D
  template_name: string // e.g. 'The sharp take'
  cluster: string
  source_outlet: string
  source_date: string // relative, e.g. '2d ago'
  source_url?: string
  url_verified: boolean
  text: string
  scoring: PulseScoring
}

export interface PulseConfession {
  dropped: string
  reason: string
}

export interface PulseSummary {
  searched: string
  found: number
  dropped: number
  strongest_signal: string
  clusters_represented: string[]
  gaps: string
  confession: PulseConfession[]
}

// The JSON payload the /industry-pulse command writes per daily run.
export interface IndustryPulseSnapshot {
  generated_at: string
  summary: PulseSummary
  posts: PulsePost[]
}

// --- Intel Agents (source id / body: 'intel-agents') -----------------------
// An Intel Agent = Topic + Purpose + Voice. Config lives in
// .ozos/intel-agents.json; the console CRUDs it via /intel-agents/agents.
export type AgentPurpose = 'linkedin' | 'research'
export type AgentVoice = 'me' | 'executive' | 'research'

export interface IntelAgent {
  id: string
  name: string
  purpose: AgentPurpose
  voice: AgentVoice
  focus: string
  keywords: string[]
  sources_prefer: string[]
  sources_avoid: string[]
  searches_per_run: number
  enabled: boolean
  created_at: string
}

// Editable fields sent to create/update an agent (id/created_at are server-side).
export interface AgentPayload {
  name: string
  purpose: AgentPurpose
  voice: AgentVoice
  focus: string
  keywords: string[]
  sources_prefer: string[]
  sources_avoid: string[]
  searches_per_run: number
  enabled?: boolean
}

// One row in an agent's report history (newest first).
export interface AgentReportMeta {
  id: string
  date: string
  label: string
  age: string
  starred: boolean
}

// A single fetched report instance for an agent.
export interface AgentReport {
  id: string
  date: string
  label: string
  purpose: AgentPurpose
  starred: boolean
  content: string
}

// --- Research article (purpose: 'research') --------------------------------
export interface ResearchSource {
  outlet: string
  date: string // relative, e.g. '2d ago'
  url?: string
  url_verified: boolean
}

export interface ResearchSection {
  heading: string
  body: string // prose / light markdown
}

export interface ResearchArticleBody {
  title: string
  tldr: string
  sections: ResearchSection[]
  sources: ResearchSource[]
}

// The JSON payload a research-purpose agent writes per run.
export interface ResearchSnapshot {
  generated_at: string
  purpose: 'research'
  summary: PulseSummary
  article: ResearchArticleBody
}
