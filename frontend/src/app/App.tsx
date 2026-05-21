import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from '../components/AppHeader'
import { AnalysisPage } from '../pages/AnalysisPage'
import { JobSeekPage } from '../pages/JobSeekPage'
import { HRBatchPage } from '../pages/HRBatchPage'
import { AuthPage } from '../pages/AuthPage'
import { HistoryPage } from '../pages/HistoryPage'
import { useAuthStore } from '../store/authStore'

type AppMode = 'seeker' | 'search' | 'hr' | 'history'

const queryClient = new QueryClient()

function MainApp() {
  const [mode, setMode] = useState<AppMode>('seeker')

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <AppHeader mode={mode} onModeChange={setMode} />
      <div className="flex-1 min-h-0 flex flex-col">
        {mode === 'seeker'  && <AnalysisPage />}
        {mode === 'search'  && <JobSeekPage />}
        {mode === 'hr'      && <HRBatchPage />}
        {mode === 'history' && <HistoryPage onBack={() => setMode('seeker')} />}
      </div>
    </div>
  )
}

export function App() {
  const token = useAuthStore((s) => s.token)

  return (
    <QueryClientProvider client={queryClient}>
      {token ? <MainApp /> : <AuthPage onSuccess={() => {}} />}
    </QueryClientProvider>
  )
}
