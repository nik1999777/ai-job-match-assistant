import { create } from 'zustand'

export type SeekDecision = 'strong_match' | 'worth_considering' | 'weak_match'

export interface VacancyResult {
  vacancy_id: string
  title: string
  company: string
  url: string
  salary_str: string | null
  match_score: number
  decision: SeekDecision
  skills_found: string[]
  skills_missing: string[]
  explanation: string
}

export type SeekStatus = 'idle' | 'loading' | 'done' | 'error'

interface SeekState {
  status: SeekStatus
  statusMessage: string
  resumeSkills: string[]
  resumeSeniority: string
  searchQuery: string
  totalFound: number
  results: VacancyResult[]
  error: string | null
}

interface SeekActions {
  setLoading: () => void
  setStatusMessage: (msg: string) => void
  setResumeParsed: (skills: string[], seniority: string) => void
  setSearchDone: (total: number, query: string) => void
  addResult: (result: VacancyResult) => void
  setDone: () => void
  setError: (error: string) => void
  reset: () => void
}

const initial: SeekState = {
  status: 'idle',
  statusMessage: '',
  resumeSkills: [],
  resumeSeniority: '',
  searchQuery: '',
  totalFound: 0,
  results: [],
  error: null,
}

export const useSeekStore = create<SeekState & SeekActions>((set) => ({
  ...initial,

  setLoading: () => set({ ...initial, status: 'loading' }),

  setStatusMessage: (msg) => set({ statusMessage: msg }),

  setResumeParsed: (skills, seniority) =>
    set({ resumeSkills: skills, resumeSeniority: seniority }),

  setSearchDone: (total, query) => set({ totalFound: total, searchQuery: query }),

  addResult: (result) =>
    set((s) => ({
      results: [...s.results, result].sort((a, b) => b.match_score - a.match_score),
    })),

  setDone: () => set({ status: 'done' }),

  setError: (error) => set({ status: 'error', error }),

  reset: () => set(initial),
}))
