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

export interface AnalysisDetail {
  id: number
  created_at: string
  mode: string
  resume_text: string
  resume_file_id: string | null
  vacancy_text: string
  vacancy_url: string | null
  match_score: number | null
  seniority: string | null
  seniority_confidence: number | null
  skills_found: string[]
  skills_missing: string[]
  llm_response: string | null
  similar_vacancies: Array<{ title?: string; company?: string; skills?: string[]; score?: number; url?: string | null; salary_str?: string | null }>
  decision: string | null
}

export interface CandidateResult {
  candidate_id: string
  match_score: number
  decision: string
  seniority: string
  skills_found: string[]
  skills_missing: string[]
  explanation: string
}

export interface BatchSummary {
  id: number
  created_at: string
  vacancy_snippet: string
  candidate_count: number
  hire_count: number
  borderline_count: number
  no_hire_count: number
}

interface BatchHistoryResponse {
  items: BatchSummary[]
  total: number
  page: number
  limit: number
}

export interface BatchDetail {
  id: number
  created_at: string
  vacancy_text: string
  candidate_count: number
  results: CandidateResult[]
}

function authHeaders(): HeadersInit {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function fetchHistory(page: number, mode?: string): Promise<HistoryResponse> {
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  if (mode) params.set('mode', mode)
  const resp = await fetch(`/api/history?${params}`, { headers: authHeaders() })
  if (!resp.ok) throw new Error('Failed to fetch history')
  return resp.json()
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

async function fetchBatchHistory(page: number): Promise<BatchHistoryResponse> {
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  const resp = await fetch(`/api/batch-history?${params}`, { headers: authHeaders() })
  if (!resp.ok) throw new Error('Failed to fetch batch history')
  return resp.json()
}

async function fetchBatchDetail(id: number): Promise<BatchDetail> {
  const resp = await fetch(`/api/batch-history/${id}`, { headers: authHeaders() })
  if (!resp.ok) throw new Error('Failed to fetch batch detail')
  return resp.json()
}

async function deleteBatchSession(id: number): Promise<void> {
  const resp = await fetch(`/api/batch-history/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) throw new Error('Failed to delete batch session')
}

export function useHistory(page = 1, mode?: string) {
  return useQuery({
    queryKey: ['history', page, mode],
    queryFn: () => fetchHistory(page, mode),
    enabled: !!getToken(),
  })
}

export function useAnalysisDetail(id: number | null) {
  return useQuery({
    queryKey: ['analysis', id],
    queryFn: () => fetchAnalysisDetail(id!),
    enabled: id !== null && !!getToken(),
  })
}

export function useDeleteAnalysis() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteAnalysis,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
  })
}

export function useBatchHistory(page = 1) {
  return useQuery({
    queryKey: ['batch-history', page],
    queryFn: () => fetchBatchHistory(page),
    enabled: !!getToken(),
  })
}

export function useBatchDetail(id: number | null) {
  return useQuery({
    queryKey: ['batch-detail', id],
    queryFn: () => fetchBatchDetail(id!),
    enabled: id !== null && !!getToken(),
  })
}

export function useDeleteBatchSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteBatchSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['batch-history'] }),
  })
}

export interface SeekSummary {
  id: number
  created_at: string
  job_title: string
  result_count: number
  strong_count: number
  considering_count: number
  weak_count: number
}

interface SeekHistoryResponse {
  items: SeekSummary[]
  total: number
  page: number
  limit: number
}

export interface VacancyResult {
  vacancy_id: string
  title: string
  company: string
  url: string
  salary_str: string | null
  match_score: number
  decision: string
  skills_found: string[]
  skills_missing: string[]
  explanation: string
}

export interface SeekDetail {
  id: number
  created_at: string
  job_title: string
  result_count: number
  results: VacancyResult[]
}

async function fetchSeekHistory(page: number): Promise<SeekHistoryResponse> {
  const params = new URLSearchParams({ page: String(page), limit: '20' })
  const resp = await fetch(`/api/seek-history?${params}`, { headers: authHeaders() })
  if (!resp.ok) throw new Error('Failed to fetch seek history')
  return resp.json()
}

async function fetchSeekDetail(id: number): Promise<SeekDetail> {
  const resp = await fetch(`/api/seek-history/${id}`, { headers: authHeaders() })
  if (!resp.ok) throw new Error('Failed to fetch seek detail')
  return resp.json()
}

async function deleteSeekSession(id: number): Promise<void> {
  const resp = await fetch(`/api/seek-history/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!resp.ok) throw new Error('Failed to delete seek session')
}

export function useSeekHistory(page = 1) {
  return useQuery({
    queryKey: ['seek-history', page],
    queryFn: () => fetchSeekHistory(page),
    enabled: !!getToken(),
  })
}

export function useSeekDetail(id: number | null) {
  return useQuery({
    queryKey: ['seek-detail', id],
    queryFn: () => fetchSeekDetail(id!),
    enabled: id !== null && !!getToken(),
  })
}

export function useDeleteSeekSession() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: deleteSeekSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['seek-history'] }),
  })
}
