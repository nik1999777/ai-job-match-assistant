import { AnalyzeForm } from '../widgets/AnalyzeForm'
import { AnalysisResult } from '../widgets/AnalysisResult'
import { ModeToggle } from '../components/ModeToggle'

type AppMode = 'seeker' | 'search' | 'hr'

interface Props {
  onModeChange: (m: AppMode) => void
}

export function AnalysisPage({ onModeChange }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">AI Job Match Assistant</h1>
          <p className="text-sm text-muted-foreground">Вставьте резюме и ссылку на вакансию hh.ru</p>
        </div>
        <ModeToggle mode="seeker" onChange={onModeChange} />
      </header>

      <main className="grid grid-cols-1 md:grid-cols-2 gap-0 h-[calc(100vh-73px)]">
        <div className="border-r p-6 overflow-y-auto">
          <AnalyzeForm />
        </div>
        <div className="p-6 overflow-y-auto">
          <AnalysisResult />
        </div>
      </main>
    </div>
  )
}
