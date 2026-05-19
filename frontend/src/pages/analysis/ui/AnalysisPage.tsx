import { useAnalyze } from '@/features/analyze/api/useAnalyze'
import { AnalyzeForm } from '@/widgets/AnalyzeForm/ui/AnalyzeForm'
import { AnalysisResult } from '@/widgets/AnalysisResult/ui/AnalysisResult'

export function AnalysisPage() {
  const { state, analyze, reset } = useAnalyze()
  const loading = state.status === 'loading'
  const done = state.status === 'done'

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4">
        <h1 className="text-lg font-semibold">AI Job Match Assistant</h1>
        <p className="text-sm text-muted-foreground">Вставьте резюме и ссылку на вакансию hh.ru / LinkedIn</p>
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 gap-0 h-[calc(100vh-73px)]">
        <div className="border-r p-6 overflow-y-auto">
          <AnalyzeForm
            onSubmit={analyze}
            onReset={reset}
            loading={loading}
            done={done}
          />
        </div>

        <div className="p-6 overflow-y-auto">
          <AnalysisResult state={state} />
        </div>
      </main>
    </div>
  )
}
