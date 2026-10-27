export type Rating =
  | 'lets-grow-together'
  | 'meeting-expectations'
  | 'exceeding-expectations'
  | 'driving-excellence'
  | null

export type CompetencyValue =
  | 'need-improvement'
  | 'meeting-expectations'
  | 'exceeding-expectations'
  | 'n-a'
  | null

export const COMPETENCY_KEYS = [
  'business-operational-knowledge',
  'data-knowledge',
  'industry-domain-knowledge',
  'strategy-definition',
  'user-knowledge',
  'delivery',
  'discovery',
  'driving-impact',
  'optimization',
  'collaboration',
  'leadership-evangelism',
  'stakeholder-management',
  'overall',
] as const

export type CompetencyKey = (typeof COMPETENCY_KEYS)[number]

export const COMPETENCY_LABELS: Record<CompetencyKey, string> = {
  'business-operational-knowledge': 'Business & Ops',
  'data-knowledge': 'Data Knowledge',
  'industry-domain-knowledge': 'Industry & Domain',
  'strategy-definition': 'Strategy',
  'user-knowledge': 'User Knowledge',
  delivery: 'Delivery',
  discovery: 'Discovery',
  'driving-impact': 'Driving Impact',
  optimization: 'Optimization',
  collaboration: 'Collaboration',
  'leadership-evangelism': 'Leadership',
  'stakeholder-management': 'Stakeholders',
  overall: 'Overall',
}

export const COMPETENCY_VALUE_MAP: Record<string, number> = {
  'n-a': 0,
  'need-improvement': 1,
  'meeting-expectations': 2,
  'exceeding-expectations': 3,
}

export interface PersonMeta {
  name: string
  display_name: string
  role: string
  start_date: string
  manager: string
}

export interface CycleEvent {
  id: string
  label: string
  start: string
  end: string
}

export interface CycleDefinition {
  name: string
  type: 'deep-dive' | 'light-touch'
  events: CycleEvent[]
}

export interface CyclesData {
  active_cycle: string
  cycles: Record<string, CycleDefinition>
}

// A person's cycle as listed in the header dropdown.
export interface CycleMeta {
  id: string
  title: string
  status: 'active' | 'finalized'
  // Secondary month-range label, e.g. 'Apr-Jul' (shown lighter than the title).
  period?: string
}

// Payload for creating a new per-person cycle.
export interface NewCyclePayload {
  title: string
  type: string
  start: string
  end: string
  from_cycle?: string
}

export interface Document {
  file: string
  label: string
  source_pdf?: string
  ingested_at: string
}

export interface CompetencySet {
  [key: string]: CompetencyValue
}

export interface Goal {
  title: string
  description: string
  done: boolean
  // Optional fields set when a goal is planned/broken-down in the Personal Tasks view.
  // Preserved here so editing the goal on the review page doesn't drop them.
  subtasks?: { id: string; title: string; done: boolean; weeks?: string[] }[]
  plan?: { weeks: string[]; manual: boolean } | null
}

// Goals were once bare strings; data on disk may still hold either form.
export type GoalLike = Goal | string

export interface CycleSummary {
  manager_rating: Rating
  promotion_nominated: boolean
  promotion_justification: string
  key_goals: GoalLike[]
  key_accomplishments: GoalLike[]
  personal_notes: string
  competencies: { self: CompetencySet; manager: CompetencySet }
  documents: Document[]
  // Per-person cycle metadata (present on cycles created via the new-cycle flow;
  // optional so legacy summaries still type-check).
  title?: string
  cycle_type?: string
  start_date?: string
  end_date?: string
  status?: 'active' | 'finalized'
  // Read-only reminder of the goals defined in the previous cycle (carried forward
  // when this cycle was created). The cycle's own goals live in key_goals.
  prev_growth_goals?: GoalLike[]
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}
