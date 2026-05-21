import { useState } from 'react'
import { useHistory, useDeleteAnalysis, type AnalysisSummary } from '../hooks/useHistory'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'

interface Props {
  onBack: () => void
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null
  const pct = Math.round(score * 100)
  const color = pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`font-semibold text-sm ${color}`}>{pct}%</span>
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return null
  const variants: Record<string, string> = {
    hire: 'bg-green-100 text-green-800',
    no_hire: 'bg-red-100 text-red-800',
    borderline: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${variants[decision] ?? 'bg-muted'}`}>
      {decision.replace('_', ' ')}
    </span>
  )
}

function AnalysisCard({ item, onDelete }: { item: AnalysisSummary; onDelete: (id: number) => void }) {
  const date = new Date(item.created_at).toLocaleString()

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">{item.mode}</Badge>
          {item.seniority && item.seniority !== 'unknown' && (
            <Badge variant="secondary" className="text-xs">{item.seniority}</Badge>
          )}
          <DecisionBadge decision={item.decision} />
          <ScoreBadge score={item.match_score} />
        </div>
        <button
          onClick={() => onDelete(item.id)}
          className="text-muted-foreground hover:text-destructive transition-colors text-sm shrink-0"
          title="Delete"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Resume</p>
          <p className="text-foreground leading-snug">{item.resume_snippet}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Vacancy</p>
          <p className="text-foreground leading-snug">{item.vacancy_snippet}</p>
        </div>
      </div>

      {item.skills_missing.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Missing skills</p>
          <div className="flex flex-wrap gap-1">
            {item.skills_missing.slice(0, 6).map((s) => (
              <span key={s} className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs">{s}</span>
            ))}
            {item.skills_missing.length > 6 && (
              <span className="text-xs text-muted-foreground">+{item.skills_missing.length - 6}</span>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{date}</p>
    </div>
  )
}

export function HistoryPage({ onBack }: Props) {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError } = useHistory(page)
  const deleteMutation = useDeleteAnalysis()

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Analysis History</h1>
            {data && <p className="text-sm text-muted-foreground mt-0.5">{data.total} analyses total</p>}
          </div>
          <Button variant="outline" size="sm" onClick={onBack}>
            ← Back
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="border rounded-lg p-4 h-32 bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {isError && (
          <p className="text-destructive text-sm">Failed to load history.</p>
        )}

        {data?.items.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">No analyses yet</p>
            <p className="text-sm mt-1">Run your first analysis to see it here</p>
          </div>
        )}

        <div className="space-y-3">
          {data?.items.map((item) => (
            <AnalysisCard
              key={item.id}
              item={item}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
