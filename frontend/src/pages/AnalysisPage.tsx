import { AnalyzeForm } from '../widgets/AnalyzeForm'
import { AnalysisResult } from '../widgets/AnalysisResult'

export function AnalysisPage() {
  return (
    <main className="grid grid-cols-1 md:grid-cols-2 h-full">
      <div className="border-r p-6 overflow-y-auto">
        <AnalyzeForm />
      </div>
      <div className="p-6 overflow-y-auto">
        <AnalysisResult />
      </div>
    </main>
  )
}
