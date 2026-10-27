export interface SubTask {
  id: string
  title: string
  done: boolean
  weeks?: string[] // ISO Monday dates this subtask is planned in
}

/** A planned set of weeks (ISO Monday dates). `manual` marks that the user set the
 *  task-level timeline directly; otherwise it follows the union of subtask weeks. */
export interface TaskPlan {
  weeks: string[]
  manual: boolean
}

export interface Task {
  id: string
  title: string
  description: string
  labels: string[]
  done: boolean
  order: number
  completedAt: string | null // ISO timestamp, set when first marked done
  subtasks: SubTask[]
  plan: TaskPlan | null
}

/** A performance-review goal projected as an editable task; it lives in the
 *  review cycle summary, not in the personal-tasks store. */
export interface ReviewGoalTask {
  id: string // pr:<cycle>:<index>
  title: string
  description: string
  labels: string[] // always ["performance review"]
  done: boolean
  completedAt: string | null
  subtasks: SubTask[]
  plan: TaskPlan | null
  reviewLinked: true
  cycle: string
  index: number
}

export type AnyTask = Task | ReviewGoalTask

export interface TasksResponse {
  tasks: Task[]
  reviewGoals: ReviewGoalTask[]
  labels: string[]
  labelColors: Record<string, string>
}

export function isReviewGoal(t: AnyTask): t is ReviewGoalTask {
  return (t as ReviewGoalTask).reviewLinked === true
}
