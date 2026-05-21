import type { AnalyzeRequest } from './generated'
import type { GapData, NodeName, ParsedData } from '../store/analysisStore'
import { getToken, getRole } from '../store/authStore'

interface StreamCallbacks {
  onNodeStart: (node: NodeName) => void
  onNodeDone: (node: NodeName) => void
  onToken: (content: string) => void
  onParsedData: (data: ParsedData, rawResume: string, rawVacancy: string) => void
  onGapData: (data: GapData) => void
  onDone: (state: { match_score?: number; seniority?: string; skills_found?: string[]; skills_missing?: string[] }) => void
}

const API_URL = '/api/analyze'

export async function streamAnalyze(
  params: AnalyzeRequest,
  callbacks: StreamCallbacks,
): Promise<void> {
  const token = getToken()
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ ...params, mode: getRole() }),
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

        switch (msg.event) {
          case 'node_start':
            callbacks.onNodeStart(msg.node as NodeName)
            break
          case 'node_done':
            callbacks.onNodeDone(msg.node as NodeName)
            break
          case 'token':
            callbacks.onToken(msg.content)
            break
          case 'parsed_data':
            callbacks.onParsedData(msg.data ?? {}, msg.raw_resume ?? '', msg.raw_vacancy ?? '')
            break
          case 'gap_data':
            callbacks.onGapData({
              skills_found: msg.skills_found ?? [],
              skills_missing: msg.skills_missing ?? [],
              match_score: msg.match_score ?? 0,
              seniority: msg.seniority ?? 'unknown',
              seniority_confidence: msg.seniority_confidence ?? 0,
              similar_vacancies: msg.similar_vacancies ?? [],
            })
            break
          case 'done':
            callbacks.onDone(msg.state ?? {})
            break
        }
      } catch {
        // skip malformed lines
      }
    }
  }
}
