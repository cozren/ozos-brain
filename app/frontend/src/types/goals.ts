// Mirrors backend/services/goals.py and the /api/goals payloads.

export type GoalStatus = 'on_track' | 'at_risk' | 'off_track' | 'complete' | 'cancelled' | 'pending'

export type GoalSource = 'manual' | 'atlassian'

export interface Goal {
  id: string
  title: string
  description: string
  owner: string
  status: GoalStatus
  progress: number | null
  target_date: string
  source: GoalSource
  external_id: string | null
  // Reserved for Phase 4: the Data Hub data point this goal is measured by.
  data_point_id: string | null
  updated_at: string | null
  synced_at: string | null
}

export interface GoalSync {
  last_run: string
  status: 'ok' | 'fail'
  message: string
  count: number
}

export interface GoalsPayload {
  goals: Goal[]
  sync: GoalSync | null
  connector: { configured: boolean; missing: string[] }
  statuses: GoalStatus[]
}

export interface NewGoalPayload {
  title: string
  description?: string
  owner?: string
  status?: GoalStatus
  progress?: number | null
  target_date?: string
}

export type GoalPatch = Partial<
  Pick<
    Goal,
    'title' | 'description' | 'owner' | 'status' | 'progress' | 'target_date' | 'data_point_id'
  >
>

export interface SyncResult {
  synced: number
  sync: GoalSync
}
