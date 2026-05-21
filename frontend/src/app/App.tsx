import { useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnalysisPage } from '../pages/AnalysisPage'
import { JobSeekPage } from '../pages/JobSeekPage'
import { HRBatchPage } from '../pages/HRBatchPage'
import { AuthPage } from '../pages/AuthPage'
import { HistoryPage } from '../pages/HistoryPage'
import { useAuthStore } from '../store/authStore'
import { Button } from '../components/ui/button'

type AppMode = 'seeker' | 'search' | 'hr' | 'history'

const queryClient = new QueryClient()

function UserBar({ onHistory, onLogout, email }: { onHistory: () => void; onLogout: () => void; email: string }) {
  return (
    <div className="fixed top-3 right-4 flex items-center gap-2 z-50">
      <span className="text-xs text-muted-foreground hidden sm:block">{email}</span>
      <Button variant="ghost" size="sm" onClick={onHistory} className="text-xs h-7 px-2">
        History
      </Button>
      <Button variant="ghost" size="sm" onClick={onLogout} className="text-xs h-7 px-2 text-muted-foreground">
        Sign out
      </Button>
    </div>
  )
}

function MainApp() {
  const [mode, setMode] = useState<AppMode>('seeker')
  const { email, logout } = useAuthStore()

  return (
    <>
      {email && (
        <UserBar
          email={email}
          onHistory={() => setMode('history')}
          onLogout={logout}
        />
      )}
      {mode === 'seeker'  && <AnalysisPage  onModeChange={setMode} />}
      {mode === 'search'  && <JobSeekPage   onModeChange={setMode} />}
      {mode === 'hr'      && <HRBatchPage   onModeChange={setMode} />}
      {mode === 'history' && <HistoryPage   onModeChange={setMode} />}
    </>
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
