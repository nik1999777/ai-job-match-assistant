import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AnalysisPage } from '../pages/AnalysisPage'

const queryClient = new QueryClient()

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AnalysisPage />
    </QueryClientProvider>
  )
}
