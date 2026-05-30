import { create } from 'zustand'

export type NodeName = 'parse_node' | 'gap_node' | 'advise_node'

export const NODE_LABELS: Record<NodeName, string> = {
  parse_node: 'Парсинг резюме и вакансии',
  gap_node: 'Анализ навыков',
  advise_node: 'Формирование рекомендаций',
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
  company?: string
  skills?: string[]
  score?: number
  url?: string | null
  salary_str?: string | null
}

export interface GapData {
  skills_found: string[]
  skills_missing: string[]
  match_score: number
  seniority: string
  seniority_confidence: number
  similar_vacancies: SimilarVacancy[]
}

export interface SkillTip {
  skill: string
  action: string
}

export interface SeekerAdvice {
  overall: string
  top_skills: SkillTip[]
  resume_tips: string[]
  strategy: string
}

export interface HRAdvice {
  candidate_fit: string
  strengths: string[]
  gaps: string[]
  decision: 'Hire' | 'Borderline' | 'No Hire'
  decision_reason: string
}

export type AdviceData = SeekerAdvice | HRAdvice

export type AnalysisStatus = 'idle' | 'loading' | 'done' | 'error'

interface AnalysisState {
  status: AnalysisStatus
  currentNode: NodeName | null
  completedNodes: NodeName[]
  adviceData: AdviceData | null
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
  setAdviceData: (data: AdviceData) => void
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
  adviceData: null,
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

  setAdviceData: (data) => set({ adviceData: data }),

  setParsedData: (data, rawResume, rawVacancy) =>
    set({ parsedData: data, rawResume, rawVacancy }),

  setGapData: (data) => set({ gapData: data }),

  setDone: (result) => set({ status: 'done', ...result }),

  setError: (error) => set({ status: 'error', error }),

  reset: () => set(initialState),
}))
