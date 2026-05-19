import { useMutation } from '@tanstack/react-query'
import type { AnalyzeRequest } from '../api/generated'
import { streamAnalyze } from '../api/streaming'
import { useAnalysisStore } from '../store/analysisStore'

export function useAnalyze() {
  const store = useAnalysisStore()

  const mutation = useMutation({
    mutationFn: (params: AnalyzeRequest) =>
      streamAnalyze(params, {
        onNodeStart: store.setCurrentNode,
        onNodeDone: store.addCompletedNode,
        onToken: store.addToken,
        onParsedData: store.setParsedData,
        onGapData: store.setGapData,
        onDone: (st) =>
          store.setDone({
            matchScore: st.match_score ?? null,
            seniority: st.seniority ?? null,
            skillsFound: st.skills_found ?? [],
            skillsMissing: st.skills_missing ?? [],
          }),
      }),
    onMutate: () => store.setLoading(),
    onError: (err) =>
      store.setError(err instanceof Error ? err.message : 'Unknown error'),
  })

  return {
    analyze: mutation.mutate,
    reset: store.reset,
  }
}
