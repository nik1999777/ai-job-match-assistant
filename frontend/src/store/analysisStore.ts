import { create } from 'zustand'

export type NodeName = 'parse_node' | 'gap_node' | 'advise_node'

export const NODE_LABELS: Record<NodeName, string> = {
  parse_node: 'Parsing resume & vacancy',
  gap_node: 'Analyzing skill gaps',
  advise_node: 'Generating advice',
}

export interface ParsedData {
  resume_summary?: string
  vacancy_summary?: string
  resume_skills?: string[]
  vacancy_skills?: string[]
  vacancy_seniority_hint?: string
}

export interface SimilarVacancy {
  title?: string
  skills?: string[]
  score?: number
}

export interface GapData {
  skills_found: string[]
  skills_missing: string[]
  match_score: number
  seniority: string
  seniority_confidence: number
  similar_vacancies: SimilarVacancy[]
}

export type AnalysisStatus = 'idle' | 'loading' | 'done' | 'error'

interface AnalysisState {
  status: AnalysisStatus
  currentNode: NodeName | null
  completedNodes: NodeName[]
  tokens: string
  matchScore: number | null
  seniority: string | null
  skillsFound: string[]
  skillsMissing: string[]
  error: string | null
  parsedData: ParsedData | null
  gapData: GapData | null
  rawResume: string
  rawVacancy: string
}

interface AnalysisActions {
  setLoading: () => void
  setCurrentNode: (node: NodeName) => void
  addCompletedNode: (node: NodeName) => void
  addToken: (content: string) => void
  setParsedData: (data: ParsedData, rawResume: string, rawVacancy: string) => void
  setGapData: (data: GapData) => void
  setDone: (result: Pick<AnalysisState, 'matchScore' | 'seniority' | 'skillsFound' | 'skillsMissing'>) => void
  setError: (error: string) => void
  reset: () => void
}

const initialState: AnalysisState = {
  status: 'idle',
  currentNode: null,
  completedNodes: [],
  tokens: '',
  matchScore: null,
  seniority: null,
  skillsFound: [],
  skillsMissing: [],
  error: null,
  parsedData: null,
  gapData: null,
  rawResume: '',
  rawVacancy: '',
}

export const useAnalysisStore = create<AnalysisState & AnalysisActions>((set) => ({
  ...initialState,

  setLoading: () => set({ ...initialState, status: 'loading' }),

  setCurrentNode: (node) => set({ currentNode: node }),

  addCompletedNode: (node) => set((s) => ({
    currentNode: null,
    completedNodes: [...s.completedNodes, node],
  })),

  addToken: (content) => set((s) => ({ tokens: s.tokens + content })),

  setParsedData: (data, rawResume, rawVacancy) =>
    set({ parsedData: data, rawResume, rawVacancy }),

  setGapData: (data) => set({ gapData: data }),

  setDone: (result) => set({ status: 'done', ...result }),

  setError: (error) => set({ status: 'error', error }),

  reset: () => set(initialState),
}))
