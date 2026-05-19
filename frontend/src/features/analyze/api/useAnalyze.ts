import { useState, useCallback } from 'react'
import type { AnalysisState, NodeName } from '../model/types'

const API_URL = 'http://localhost:8000/api/analyze'

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
}

export function useAnalyze() {
  const [state, setState] = useState<AnalysisState>(initialState)

  const analyze = useCallback(async (params: {
    resume?: string
    resumeUrl?: string
    vacancyUrl?: string
    vacancyText?: string
  }) => {
    setState({ ...initialState, status: 'loading' })

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: params.resume || undefined,
          resume_url: params.resumeUrl || undefined,
          vacancy_url: params.vacancyUrl || undefined,
          vacancy: params.vacancyText || undefined,
          mode: 'seeker',
        }),
      })

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: resp.statusText }))
        throw new Error(err.detail ?? resp.statusText)
      }

      const reader = resp.body!.getReader()
      const decoder = new TextDecoder()
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

          try {
            const msg = JSON.parse(raw)

            if (msg.event === 'node_start') {
              setState(s => ({ ...s, currentNode: msg.node as NodeName }))
            } else if (msg.event === 'node_done') {
              setState(s => ({
                ...s,
                currentNode: null,
                completedNodes: [...s.completedNodes, msg.node as NodeName],
              }))
            } else if (msg.event === 'token') {
              setState(s => ({ ...s, tokens: s.tokens + msg.content }))
            } else if (msg.event === 'done') {
              const st = msg.state ?? {}
              setState(s => ({
                ...s,
                status: 'done',
                matchScore: st.match_score ?? null,
                seniority: st.seniority ?? null,
                skillsFound: st.skills_found ?? [],
                skillsMissing: st.skills_missing ?? [],
              }))
            }
          } catch {
            // skip malformed JSON lines
          }
        }
      }

      setState(s => s.status === 'loading' ? { ...s, status: 'done' } : s)
    } catch (err) {
      setState(s => ({
        ...s,
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  const reset = useCallback(() => setState(initialState), [])

  return { state, analyze, reset }
}
