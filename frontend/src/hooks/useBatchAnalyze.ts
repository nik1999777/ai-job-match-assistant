import { useState } from 'react'
import { batchAnalyzeApiBatchPost } from '../api/generated'
import type { BatchResponse, BatchRequest } from '../api/generated'

type BatchStatus = 'idle' | 'loading' | 'done' | 'error'

export function useBatchAnalyze() {
  const [status, setStatus] = useState<BatchStatus>('idle')
  const [results, setResults] = useState<BatchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function analyze(request: BatchRequest) {
    setStatus('loading')
    setError(null)
    try {
      const res = await batchAnalyzeApiBatchPost(request)
      if (res.status === 200) {
        setResults(res.data as BatchResponse)
        setStatus('done')
      } else {
        setError('Batch analysis failed')
        setStatus('error')
      }
    } catch (e) {
      setError(String(e))
      setStatus('error')
    }
  }

  function reset() {
    setStatus('idle')
    setResults(null)
    setError(null)
  }

  return { analyze, reset, status, results, error }
}
