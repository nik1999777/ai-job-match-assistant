import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getToken } from '../store/authStore'

export interface AnalysisSummary {
  id: number
  created_at: string
  mode: string
  resume_snippet: string
  vacancy_snippet: string
  match_score: number | null
  seniority: string | null
  skills_found: string[]
  skills_missing: string[]
  decision: string | null
}

interface HistoryResponse {
  items: AnalysisSummary[]
  total: number
  page: number
  limit: number
}

function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchHistory(page: number): Promise<HistoryResponse> {
  const resp = await fetch(`/api/history?page=${page}&limit=20`, {
    headers: authHeaders(),
  })
  if (!resp.ok) throw new Error('Failed to fetch history')
  return resp.json()
}

export interface AnalysisDetail {
  id: number
  created_at: string
  mode: string
  resume_text: string
  vacancy_text: string
  match_score: number | null
  seniority: string | null
  seniority_confidence: number | null
  skills_found: string[]
  skills_missing: string[]
  llm_response: string | null
  decision: string | null
}

async function fetchAnalysisDetail(id: number): Promise<AnalysisDetail> {
  const resp = await fetch(`/api/analyses/${id}`, { headers: authHeaders() })
  if (!resp.ok) throw new Error('Failed to fetch analysis')
  return resp.json()
}

async function deleteAnalysis(id: number): Promise<void> {
  const resp = await fetch(`/api/analyses/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) throw new Error('Failed to delete analysis')
}

export function useAnalysisDetail(id: number | null) {
  return useQuery({
    queryKey: ['analysis', id],
    queryFn: () => fetchAnalysisDetail(id!),
    enabled: id !== null && !!getToken(),
  })
}

export function useHistory(page = 1) {
  return useQuery({
    queryKey: ['history', page],
    queryFn: () => fetchHistory(page),
    enabled: !!getToken(),
  })
}

export function useDeleteAnalysis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAnalysis,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
  })
}
