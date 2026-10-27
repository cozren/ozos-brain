// Mirrors backend/services/setup_view.py (item_view) and the /api/setup payloads.

export type SetupStatus = 'not_started' | 'in_progress' | 'done' | 'skipped' | 'needs_attention'

export type SetupKind =
  | 'profile'
  | 'gmail'
  | 'manual'
  | 'routing'
  | 'mcp'
  | 'env'
  | 'folder'
  | 'people'
  | 'cycle'
  | 'placeholder'

export interface SetupDerived {
  profile?: { name: string; me: string; voice_text: string }
  mcp?: { connected: boolean; names: string[] }
  vital?: { status: string }
}

export interface SetupRow {
  id: string
  display_name: string
  added_at?: string
}

export interface SetupItem {
  id: string
  group: string
  title: string
  why: string
  writes: string
  kind: SetupKind
  setup_doc: string | null
  vital: string | null
  env: string[]
  mcp_match: string | null
  default_folder: string | null
  status: SetupStatus
  updated_at: string | null
  notes: string
  rows: SetupRow[]
  derived: SetupDerived | null
}

export interface SetupGroup {
  id: string
  label: string
  items: SetupItem[]
}

export interface SetupSummary {
  done: number
  total: number
  open: number
  badge_dismissed: boolean
}

export interface SetupCadence {
  mode: 'company' | 'default'
  cycle_id?: string
  monthly?: string
  quarterly?: string
  set_at?: string
}

export interface SetupView {
  groups: SetupGroup[]
  summary: SetupSummary
  cadence: SetupCadence | null
}

export interface Reminder {
  person_id: string
  display_name: string
  monthly_due: string
  quarterly_due: string
}

export interface GmailStatus {
  credentials_file: boolean
  token_file: boolean
  drive_parent_folder_id: string | null
  auth_command: string
}

export interface StakeholderPayload {
  person_id: string
  display_name: string
  email: string
  team_folder: string
  leadership: boolean
  manager: string
  role?: string
}

export interface StakeholderResult {
  person: Record<string, string>
  routing: Record<string, unknown>
  removed_example: boolean
}

export interface CycleStage {
  id?: string
  label: string
  start: string
  end: string
}

export type CyclePayload =
  | { mode: 'default' }
  | { mode: 'company'; name: string; type: string; stages: CycleStage[] }

export interface RoutingPayload {
  folders?: string[]
  default_folder?: string
  tagging_guide?: string
  drive_parent_folder_id?: string | null
}
