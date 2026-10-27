// Types mirroring the /api/knowledge endpoints (backend services/knowledge.py)

export interface TreeNode {
  name: string
  path: string // root-relative, posix
  type: 'dir' | 'file'
  mtime: number // unix seconds
  children?: TreeNode[] // present on dirs
}

export interface SourceNode {
  id: string
  label: string
  path: string
  mode?: 'dir' | 'labels'
  children: TreeNode[]
}

export interface KnowledgeTree {
  sources: SourceNode[]
}

export interface KnowledgeFile {
  path: string
  name: string
  source_id: string
  mtime: number
  // image files carry empty content (bytes via asset URL); html files carry raw
  // markup rendered read-only in a sandboxed iframe.
  kind?: 'markdown' | 'image' | 'html'
  content: string
  tags?: string[]
  folders?: string[]
  folder_tags?: string[]
  links?: { label: string; url: string }[]
  // Upstream Confluence page this doc summarises (frontmatter `confluence:`).
  confluence_url?: string | null
}

export interface SearchResult {
  path: string
  name: string
  source_id: string
  mtime: number
  snippet: string
  score: number
}

export interface SearchResponse {
  results: SearchResult[]
}

export interface StarsResponse {
  starred: string[] // root-relative paths of starred documents
}

export interface ColorsResponse {
  colors: Record<string, string> // source id → custom #rrggbb colour
}

export interface OrderResponse {
  order: string[] // source ids in manual display order
}

export interface CreateFolderResponse {
  path: string // root-relative path of the newly-created folder
}

export interface GraphNode {
  id: string
  label: string
  file_type: string // code | document | rationale | library | image
  source_file: string | null
  community: number | null
}

export interface GraphLink {
  source: string
  target: string
  relation: string
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  links: GraphLink[]
}
