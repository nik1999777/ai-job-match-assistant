export type NodeName = 'parse_node' | 'gap_node' | 'advise_node'

export interface AnalysisState {
  status: 'idle' | 'loading' | 'done' | 'error'
  currentNode: NodeName | null
  completedNodes: NodeName[]
  tokens: string
  matchScore: number | null
  seniority: string | null
  skillsFound: string[]
  skillsMissing: string[]
  error: string | null
}

export const NODE_LABELS: Record<NodeName, string> = {
  parse_node: 'Parsing resume & vacancy',
  gap_node: 'Analyzing skill gaps',
  advise_node: 'Generating advice',
}
