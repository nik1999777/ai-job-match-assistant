import { useSeekStore, type VacancyResult } from '../store/seekStore'

export interface SeekParams {
  resume: string
  job_title?: string
  area?: number
  experience?: string | null
  salary_from?: number | null
  remote?: boolean
  count?: number
}

export function useSeekVacancies() {
  const store = useSeekStore()

  async function seek(params: SeekParams) {
    store.setLoading()

    let response: Response
    try {
      response = await fetch('/api/seek', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
    } catch (e) {
      store.setError(String(e))
      return
    }

    if (!response.ok || !response.body) {
      store.setError(`Server error ${response.status}`)
      return
    }

    const reader = response.body.getReader()
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
        try {
          handleEvent(JSON.parse(line.slice(6)))
        } catch {
          // malformed SSE line, skip
        }
      }
    }
  }

  function handleEvent(ev: Record<string, unknown>) {
    switch (ev.event) {
      case 'status':
        store.setStatusMessage(ev.message as string)
        break
      case 'resume_parsed':
        store.setResumeParsed(ev.skills as string[], ev.seniority as string)
        break
      case 'search_done':
        store.setSearchDone(ev.total as number, ev.query as string)
        break
      case 'result':
        store.addResult(ev as unknown as VacancyResult)
        break
      case 'done':
        store.setDone()
        break
      case 'error':
        store.setError(ev.message as string)
        break
    }
  }

  return { seek, reset: store.reset }
}
