import { useState } from 'react'
import { BatchForm } from '../widgets/BatchForm'
import { CandidateTable } from '../widgets/CandidateTable'
import { useBatchAnalyze } from '../hooks/useBatchAnalyze'
import type { BatchRequest } from '../api/generated'

export function HRBatchPage() {
  const { analyze, reset, status, results, error } = useBatchAnalyze()
  const [nameMap, setNameMap] = useState<Record<string, string>>({})

  function handleAnalyze(request: BatchRequest, names: Record<string, string>) {
    setNameMap(names)
    analyze(request)
  }

  return (
    <main className="grid grid-cols-1 md:grid-cols-2 h-full">
      <div className="border-r p-6 overflow-y-auto">
        <BatchForm
          loading={status === 'loading'}
          done={status === 'done' || status === 'error'}
          onAnalyze={handleAnalyze}
          onReset={reset}
        />
      </div>

      <div className="p-6 overflow-y-auto">
        {status === 'idle' && (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Результаты появятся здесь
          </div>
        )}
        {status === 'loading' && (
          <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
            Анализируем кандидатов...
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}
        {results && results.results.length > 0 && (
          <CandidateTable results={results.results} nameMap={nameMap} />
        )}
      </div>
    </main>
  )
}
