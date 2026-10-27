import type {
  CyclesData,
  CycleMeta,
  NewCyclePayload,
  PersonMeta,
  CycleSummary,
  ChatMessage,
} from './types'
import type { ControlTowerStatus, VitalDetail } from './types/control-tower'
import type { Task, TasksResponse, SubTask, TaskPlan } from './types/tasks'
import type {
  ReportSource,
  ReportInstanceMeta,
  ReportInstance,
  RunStatus,
  RunStart,
  ReportLayout,
  IntelAgent,
  AgentPayload,
  AgentReportMeta,
  AgentReport,
} from './types/reporting'
import type {
  KnowledgeTree,
  KnowledgeFile,
  SearchResponse,
  StarsResponse,
  ColorsResponse,
  KnowledgeGraph,
  OrderResponse,
  CreateFolderResponse,
} from './types/knowledge'
import type { DataHubLayout } from './types/datahub'
import type {
  SetupItem,
  SetupStatus,
  SetupView,
  StakeholderPayload,
  StakeholderResult,
} from './types/setup'

export interface ChatStreamEvent {
  type: 'text' | 'status' | 'tool_start' | 'tool_done' | 'error' | 'done'
  text?: string
  tool?: string
  label?: string
}

const BASE = '/api'

export const api = {
  getCycles: (): Promise<CyclesData> => fetch(`${BASE}/cycles`).then((r) => r.json()),

  // Create an org-wide cycle definition (seeded with a per-type event template).
  createGlobalCycle: (name: string, type: string): Promise<CyclesData> =>
    fetch(`${BASE}/cycles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, type }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Create cycle failed: ${r.status}`)
      return r.json()
    }),

  // Delete an org-wide cycle: removes the definition and every person's folder.
  deleteGlobalCycle: (cycleId: string): Promise<CyclesData> =>
    fetch(`${BASE}/cycles/${cycleId}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`Delete cycle failed: ${r.status}`)
      return r.json()
    }),

  updateCycleName: (cycleId: string, name: string): Promise<CyclesData> =>
    fetch(`${BASE}/cycles/${cycleId}/name`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }).then((r) => r.json()),

  updateEvent: (cycleId: string, eventId: string, start: string, end: string) =>
    fetch(`${BASE}/cycles/${cycleId}/events/${eventId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end }),
    }).then((r) => r.json()),

  getPeople: (): Promise<PersonMeta[]> => fetch(`${BASE}/people`).then((r) => r.json()),

  addPerson: (data: PersonMeta) =>
    fetch(`${BASE}/people`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  deletePerson: (personId: string) =>
    fetch(`${BASE}/people/${personId}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`Delete failed: ${r.status}`)
      return r.json()
    }),

  getPersonCycles: (personId: string): Promise<CycleMeta[]> =>
    fetch(`${BASE}/people/${personId}/cycles`).then((r) => r.json()),

  createCycle: (
    personId: string,
    payload: NewCyclePayload
  ): Promise<CycleSummary & { id: string }> =>
    fetch(`${BASE}/people/${personId}/cycles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => r.json()),

  deleteCycle: (personId: string, cycleId: string) =>
    fetch(`${BASE}/people/${personId}/cycles/${cycleId}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`Delete cycle failed: ${r.status}`)
      return r.json()
    }),

  getCycleSummary: (personId: string, cycleId: string): Promise<CycleSummary> =>
    fetch(`${BASE}/people/${personId}/cycles/${cycleId}`).then((r) => r.json()),

  updateCycleSummary: (personId: string, cycleId: string, data: Partial<CycleSummary>) =>
    fetch(`${BASE}/people/${personId}/cycles/${cycleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }).then((r) => r.json()),

  uploadDocument: (personId: string, cycleId: string, file: File, label: string) => {
    const form = new FormData()
    form.append('file', file)
    form.append('label', label)
    return fetch(`${BASE}/people/${personId}/cycles/${cycleId}/documents`, {
      method: 'POST',
      body: form,
    }).then((r) => r.json())
  },

  getDocument: (personId: string, cycleId: string, filename: string): Promise<string> =>
    fetch(`${BASE}/people/${personId}/cycles/${cycleId}/documents/${filename}`).then((r) =>
      r.text()
    ),

  deleteDocument: (personId: string, cycleId: string, filename: string): Promise<CycleSummary> =>
    fetch(`${BASE}/people/${personId}/cycles/${cycleId}/documents/${filename}`, {
      method: 'DELETE',
    }).then((r) => r.json()),

  streamChat: async (
    messages: ChatMessage[],
    opts: { page?: string; skill?: string },
    onEvent: (e: ChatStreamEvent) => void,
    signal?: AbortSignal
  ): Promise<void> => {
    const response = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, page: opts.page ?? null, skill: opts.skill ?? null }),
      signal,
    })
    if (!response.ok) {
      const errText = await response.text().catch(() => `HTTP ${response.status}`)
      throw new Error(errText || `HTTP ${response.status}`)
    }
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    // Buffer partial lines: a network chunk can split an SSE line in half.
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw) continue
        let event: ChatStreamEvent
        try {
          event = JSON.parse(raw) as ChatStreamEvent
        } catch {
          continue
        }
        if (event.type === 'error') throw new Error(event.text ?? 'unknown chat error')
        onEvent(event)
      }
    }
  },

  getChatSkills: (): Promise<{ name: string; description: string }[]> =>
    fetch(`${BASE}/chat/skills`).then((r) => (r.ok ? r.json() : [])),

  getControlTowerStatus: (): Promise<ControlTowerStatus> =>
    fetch(`${BASE}/control-tower/status`).then((r) => {
      if (!r.ok) throw new Error(`Control tower status failed: ${r.status}`)
      return r.json()
    }),

  getVitalDetail: (id: string): Promise<VitalDetail> =>
    fetch(`${BASE}/control-tower/vitals/${encodeURIComponent(id)}`).then((r) => {
      if (!r.ok) throw new Error(`Vital detail failed: ${r.status}`)
      return r.json()
    }),

  runVital: (id: string): Promise<RunStart> =>
    fetch(`${BASE}/control-tower/vitals/${encodeURIComponent(id)}/run`, {
      method: 'POST',
    }).then((r) => {
      if (!r.ok) throw new Error(`Run vital failed: ${r.status}`)
      return r.json()
    }),

  getVitalRunStatus: (id: string): Promise<RunStatus> =>
    fetch(`${BASE}/control-tower/vitals/${encodeURIComponent(id)}/run/status`).then((r) => {
      if (!r.ok) throw new Error(`Vital run status failed: ${r.status}`)
      return r.json()
    }),

  // ── Personal tasks ──
  getTasks: (): Promise<TasksResponse> =>
    fetch(`${BASE}/tasks`).then((r) => {
      if (!r.ok) throw new Error(`Load tasks failed: ${r.status}`)
      return r.json()
    }),

  createTask: (title: string, description = '', labels: string[] = []): Promise<Task> =>
    fetch(`${BASE}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, labels }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Create task failed: ${r.status}`)
      return r.json()
    }),

  updateTask: (
    id: string,
    fields: Partial<Pick<Task, 'title' | 'description' | 'labels' | 'done' | 'subtasks' | 'plan'>>
  ): Promise<Task> =>
    fetch(`${BASE}/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    }).then((r) => {
      if (!r.ok) throw new Error(`Update task failed: ${r.status}`)
      return r.json()
    }),

  deleteTask: (id: string): Promise<{ deleted: string }> =>
    fetch(`${BASE}/tasks/${id}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`Delete task failed: ${r.status}`)
      return r.json()
    }),

  reorderTasks: (ids: string[]): Promise<{ tasks: Task[] }> =>
    fetch(`${BASE}/tasks/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Reorder tasks failed: ${r.status}`)
      return r.json()
    }),

  updateReviewGoal: (
    cycle: string,
    index: number,
    fields: {
      title?: string
      description?: string
      done?: boolean
      subtasks?: SubTask[]
      plan?: TaskPlan | null
    }
  ) =>
    fetch(`${BASE}/tasks/review-goal/${cycle}/${index}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    }).then((r) => {
      if (!r.ok) throw new Error(`Update review goal failed: ${r.status}`)
      return r.json()
    }),

  setLabelColor: (name: string, color: string): Promise<{ labelColors: Record<string, string> }> =>
    fetch(`${BASE}/tasks/labels/${encodeURIComponent(name)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ color }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Set label color failed: ${r.status}`)
      return r.json()
    }),

  // ── Knowledge Hub ──
  getKnowledgeTree: (): Promise<KnowledgeTree> =>
    fetch(`${BASE}/knowledge/tree`).then((r) => {
      if (!r.ok) throw new Error(`Load tree failed: ${r.status}`)
      return r.json()
    }),

  getKnowledgeFile: (path: string): Promise<KnowledgeFile> =>
    fetch(`${BASE}/knowledge/file?path=${encodeURIComponent(path)}`).then((r) => {
      if (!r.ok) throw new Error(`Load file failed: ${r.status}`)
      return r.json()
    }),

  searchKnowledge: (q: string): Promise<SearchResponse> =>
    fetch(`${BASE}/knowledge/search?q=${encodeURIComponent(q)}`).then((r) => {
      if (!r.ok) throw new Error(`Search failed: ${r.status}`)
      return r.json()
    }),

  // Asset URL for <img src> — served directly by the backend
  knowledgeAssetUrl: (path: string): string =>
    `${BASE}/knowledge/asset?path=${encodeURIComponent(path)}`,

  getKnowledgeStars: (): Promise<StarsResponse> =>
    fetch(`${BASE}/knowledge/stars`).then((r) => {
      if (!r.ok) throw new Error(`Load stars failed: ${r.status}`)
      return r.json()
    }),

  setKnowledgeStar: (path: string, starred: boolean): Promise<StarsResponse> =>
    fetch(`${BASE}/knowledge/star`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, starred }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Set star failed: ${r.status}`)
      return r.json()
    }),

  getKnowledgeGraph: (): Promise<KnowledgeGraph> =>
    fetch(`${BASE}/knowledge/graph`).then((r) => {
      if (!r.ok) throw new Error(`Load graph failed: ${r.status}`)
      return r.json()
    }),

  getKnowledgeColors: (): Promise<ColorsResponse> =>
    fetch(`${BASE}/knowledge/colors`).then((r) => {
      if (!r.ok) throw new Error(`Load colors failed: ${r.status}`)
      return r.json()
    }),

  setKnowledgeColor: (sourceId: string, color: string | null): Promise<ColorsResponse> =>
    fetch(`${BASE}/knowledge/color`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: sourceId, color }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Set color failed: ${r.status}`)
      return r.json()
    }),

  getKnowledgeOrder: (): Promise<OrderResponse> =>
    fetch(`${BASE}/knowledge/order`).then((r) => {
      if (!r.ok) throw new Error(`Load order failed: ${r.status}`)
      return r.json()
    }),

  setKnowledgeOrder: (order: string[]): Promise<OrderResponse> =>
    fetch(`${BASE}/knowledge/order`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Set order failed: ${r.status}`)
      return r.json()
    }),

  // Save edited content (full markdown incl. frontmatter) to a knowledge file.
  putKnowledgeFile: (path: string, content: string): Promise<KnowledgeFile> =>
    fetch(`${BASE}/knowledge/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    }).then(async (r) => {
      if (!r.ok) {
        const detail = await r
          .json()
          .then((b) => b?.detail)
          .catch(() => null)
        throw new Error(detail || `Save file failed: ${r.status}`)
      }
      return r.json()
    }),

  // Rename a knowledge file within the same directory.
  renameKnowledgeFile: (path: string, new_name: string): Promise<KnowledgeFile> =>
    fetch(`${BASE}/knowledge/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, new_name }),
    }).then(async (r) => {
      if (!r.ok) {
        const detail = await r
          .json()
          .then((b) => b?.detail)
          .catch(() => null)
        throw new Error(detail || `Rename file failed: ${r.status}`)
      }
      return r.json()
    }),

  // Move a knowledge file into another folder within the same source.
  moveKnowledgeFile: (path: string, dest_dir: string): Promise<KnowledgeFile> =>
    fetch(`${BASE}/knowledge/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, dest_dir }),
    }).then(async (r) => {
      if (!r.ok) {
        const detail = await r
          .json()
          .then((b) => b?.detail)
          .catch(() => null)
        throw new Error(detail || `Move file failed: ${r.status}`)
      }
      return r.json()
    }),

  getKnowledgeTags: (): Promise<{ tags: string[] }> =>
    fetch(`${BASE}/knowledge/tags`).then((r) => {
      if (!r.ok) throw new Error(`Load tags failed: ${r.status}`)
      return r.json()
    }),

  updateKnowledgeMeta: (
    path: string,
    fields: { tags?: string[]; folders?: string[]; links?: { label: string; url: string }[] }
  ): Promise<KnowledgeFile> =>
    fetch(`${BASE}/knowledge/meta`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, ...fields }),
    }).then(async (r) => {
      if (!r.ok) {
        const detail = await r
          .json()
          .then((b) => b?.detail)
          .catch(() => null)
        throw new Error(detail || `Update meta failed: ${r.status}`)
      }
      return r.json()
    }),

  // Create a folder under knowledge-hub/. On failure, surfaces the backend's
  // detail message (e.g. "already exists") so the dialog can show it inline.
  createKnowledgeFolder: (name: string, parent: string): Promise<CreateFolderResponse> =>
    fetch(`${BASE}/knowledge/folder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, parent }),
    }).then(async (r) => {
      if (!r.ok) {
        const detail = await r
          .json()
          .then((b) => b?.detail)
          .catch(() => null)
        throw new Error(detail || `Create folder failed: ${r.status}`)
      }
      return r.json()
    }),

  // ── Reporting ──
  getReportSources: (): Promise<ReportSource[]> =>
    fetch(`${BASE}/reporting/sources`).then((r) => {
      if (!r.ok) throw new Error(`Load report sources failed: ${r.status}`)
      return r.json()
    }),

  getReportInstances: (sourceId: string): Promise<ReportInstanceMeta[]> =>
    fetch(`${BASE}/reporting/sources/${sourceId}/instances`).then((r) => {
      if (!r.ok) throw new Error(`Load report instances failed: ${r.status}`)
      return r.json()
    }),

  getReportInstance: (sourceId: string, instanceId: string): Promise<ReportInstance> => {
    // Instance ids can be nested paths ("Person/2026-... .md"); encode each
    // segment but keep the slashes so the :path route resolves correctly.
    const encoded = instanceId.split('/').map(encodeURIComponent).join('/')
    return fetch(`${BASE}/reporting/sources/${sourceId}/instances/${encoded}`).then((r) => {
      if (!r.ok) throw new Error(`Load report failed: ${r.status}`)
      return r.json()
    })
  },

  runReportSource: (sourceId: string): Promise<RunStart> =>
    fetch(`${BASE}/reporting/sources/${sourceId}/run`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Run report failed: ${r.status}`)
      return r.json()
    }),

  getReportRunStatus: (sourceId: string): Promise<RunStatus> =>
    fetch(`${BASE}/reporting/sources/${sourceId}/run/status`).then((r) => {
      if (!r.ok) throw new Error(`Load run status failed: ${r.status}`)
      return r.json()
    }),

  getReportLayout: (): Promise<ReportLayout> =>
    fetch(`${BASE}/reporting/layout`).then((r) => {
      if (!r.ok) throw new Error(`Load layout failed: ${r.status}`)
      return r.json()
    }),

  saveReportLayout: (layout: ReportLayout): Promise<ReportLayout> =>
    fetch(`${BASE}/reporting/layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    }).then((r) => {
      if (!r.ok) throw new Error(`Save layout failed: ${r.status}`)
      return r.json()
    }),

  // ── Intel Agents ──
  listAgents: (): Promise<IntelAgent[]> =>
    fetch(`${BASE}/intel-agents/agents`).then((r) => {
      if (!r.ok) throw new Error(`Load agents failed: ${r.status}`)
      return r.json()
    }),

  createAgent: (payload: AgentPayload): Promise<IntelAgent> =>
    fetch(`${BASE}/intel-agents/agents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => {
      if (!r.ok) throw new Error(`Create agent failed: ${r.status}`)
      return r.json()
    }),

  updateAgent: (id: string, payload: Partial<AgentPayload>): Promise<IntelAgent> =>
    fetch(`${BASE}/intel-agents/agents/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => {
      if (!r.ok) throw new Error(`Update agent failed: ${r.status}`)
      return r.json()
    }),

  deleteAgent: (id: string): Promise<{ deleted: boolean }> =>
    fetch(`${BASE}/intel-agents/agents/${id}`, { method: 'DELETE' }).then((r) => {
      if (!r.ok) throw new Error(`Delete agent failed: ${r.status}`)
      return r.json()
    }),

  getAgentReports: (id: string): Promise<AgentReportMeta[]> =>
    fetch(`${BASE}/intel-agents/agents/${id}/reports`).then((r) => {
      if (!r.ok) throw new Error(`Load agent reports failed: ${r.status}`)
      return r.json()
    }),

  getAgentReport: (id: string, instanceId: string): Promise<AgentReport> => {
    const encoded = instanceId.split('/').map(encodeURIComponent).join('/')
    return fetch(`${BASE}/intel-agents/agents/${id}/reports/${encoded}`).then((r) => {
      if (!r.ok) throw new Error(`Load agent report failed: ${r.status}`)
      return r.json()
    })
  },

  runAgent: (id: string): Promise<RunStart> =>
    fetch(`${BASE}/intel-agents/agents/${id}/run`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Run agent failed: ${r.status}`)
      return r.json()
    }),

  agentRunStatus: (id: string): Promise<RunStatus> =>
    fetch(`${BASE}/intel-agents/agents/${id}/run/status`).then((r) => {
      if (!r.ok) throw new Error(`Load agent run status failed: ${r.status}`)
      return r.json()
    }),

  setReportStar: (
    id: string,
    instanceId: string,
    starred: boolean
  ): Promise<{ starred: boolean }> => {
    const encoded = instanceId.split('/').map(encodeURIComponent).join('/')
    return fetch(`${BASE}/intel-agents/agents/${id}/reports/${encoded}/star`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starred }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Set star failed: ${r.status}`)
      return r.json()
    })
  },

  getMe: (): Promise<{ name: string; me: string }> =>
    fetch(`${BASE}/me`).then((r) => {
      if (!r.ok) throw new Error(`Load user failed: ${r.status}`)
      return r.json()
    }),

  // ── Setup journal ───────────────────────────────────────────────────
  getSetup: (): Promise<SetupView> =>
    fetch(`${BASE}/setup`).then((r) => {
      if (!r.ok) throw new Error(`Load setup failed: ${r.status}`)
      return r.json()
    }),

  setSetupStatus: (id: string, status: SetupStatus, notes?: string): Promise<SetupItem> =>
    fetch(`${BASE}/setup/items/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notes == null ? { status } : { status, notes }),
    }).then((r) => {
      if (!r.ok) throw new Error(`Update setup item failed: ${r.status}`)
      return r.json()
    }),

  dismissSetup: (): Promise<{ badge_dismissed: boolean }> =>
    fetch(`${BASE}/setup/dismiss`, { method: 'POST' }).then((r) => {
      if (!r.ok) throw new Error(`Dismiss setup badge failed: ${r.status}`)
      return r.json()
    }),

  addStakeholder: (payload: StakeholderPayload): Promise<StakeholderResult> =>
    fetch(`${BASE}/setup/people`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => {
      if (!r.ok) throw new Error(`Add stakeholder failed: ${r.status}`)
      return r.json()
    }),

  getDataHubLayout: (): Promise<DataHubLayout> =>
    fetch(`${BASE}/datahub/layout`).then((r) => {
      if (!r.ok) throw new Error(`Load Data Hub layout failed: ${r.status}`)
      return r.json()
    }),

  saveDataHubLayout: (layout: DataHubLayout): Promise<DataHubLayout> =>
    fetch(`${BASE}/datahub/layout`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(layout),
    }).then((r) => {
      if (!r.ok) throw new Error(`Save Data Hub layout failed: ${r.status}`)
      return r.json()
    }),
}

export type { SubTask }
