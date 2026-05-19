import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnalysisPage } from '../pages/AnalysisPage'
import { HRBatchPage } from '../pages/HRBatchPage'

type AppMode = 'seeker' | 'hr'

const queryClient = new QueryClient()

export function App() {
  const [mode, setMode] = useState<AppMode>('seeker')

  return (
    <QueryClientProvider client={queryClient}>
      {mode === 'seeker'
        ? <AnalysisPage onModeChange={setMode} />
        : <HRBatchPage onModeChange={setMode} />
      }
    </QueryClientProvider>
  )
}
