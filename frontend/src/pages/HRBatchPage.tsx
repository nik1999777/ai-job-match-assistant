import { BatchForm } from '../widgets/BatchForm'
import { ModeToggle } from '../components/ModeToggle'

type AppMode = 'seeker' | 'hr'

interface Props {
  onModeChange: (m: AppMode) => void
}

export function HRBatchPage({ onModeChange }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">AI Job Match Assistant</h1>
          <p className="text-sm text-muted-foreground">HR — Batch candidate analysis</p>
        </div>
        <ModeToggle mode="hr" onChange={onModeChange} />
      </header>

      <main className="p-6 max-w-4xl mx-auto">
        <BatchForm />
      </main>
    </div>
  )
}
