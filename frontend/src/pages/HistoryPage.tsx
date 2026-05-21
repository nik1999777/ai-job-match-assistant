import { useState } from 'react'
import { useHistory, useDeleteAnalysis, type AnalysisSummary } from '../hooks/useHistory'
import { AnalysisDetailPage } from './AnalysisDetailPage'
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
  const cls: Record<string, string> = {
    hire: 'bg-green-100 text-green-800',
    no_hire: 'bg-red-100 text-red-800',
    borderline: 'bg-yellow-100 text-yellow-800',
  }
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${cls[decision] ?? 'bg-muted'}`}>
      {decision.replace('_', ' ')}
    </span>
  )
}

interface CardProps {
  item: AnalysisSummary
  onOpen: (id: number) => void
  onDelete: (id: number) => void
}

function AnalysisCard({ item, onOpen, onDelete }: CardProps) {
  return (
    <div
      className="border rounded-xl p-4 space-y-3 bg-card hover:border-foreground/20 hover:shadow-sm transition-all cursor-pointer"
      onClick={() => onOpen(item.id)}
    >
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
          onClick={(e) => { e.stopPropagation(); onDelete(item.id) }}
          className="text-muted-foreground hover:text-destructive transition-colors text-sm shrink-0 p-1"
          title="Delete"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-muted-foreground mb-1">Резюме</p>
          <p className="text-foreground leading-snug">{item.resume_snippet}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground mb-1">Вакансия</p>
          <p className="text-foreground leading-snug">{item.vacancy_snippet}</p>
        </div>
      </div>

      {item.skills_missing.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.skills_missing.slice(0, 6).map((s) => (
            <span key={s} className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs">{s}</span>
          ))}
          {item.skills_missing.length > 6 && (
            <span className="text-xs text-muted-foreground">+{item.skills_missing.length - 6}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
        <span className="text-xs text-muted-foreground">Открыть →</span>
      </div>
    </div>
  )
}

export function HistoryPage({ onBack }: Props) {
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { data, isLoading, isError } = useHistory(page)
  const deleteMutation = useDeleteAnalysis()

  if (selectedId !== null) {
    return <AnalysisDetailPage analysisId={selectedId} onBack={() => setSelectedId(null)} />
  }

  const totalPages = data ? Math.ceil(data.total / data.limit) : 1

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">История анализов</h1>
            {data && <p className="text-sm text-muted-foreground mt-0.5">{data.total} анализов</p>}
          </div>
          <Button variant="outline" size="sm" onClick={onBack}>← Назад</Button>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="border rounded-xl p-4 h-32 bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {isError && <p className="text-destructive text-sm">Не удалось загрузить историю.</p>}

        {data?.items.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-lg">Анализов ещё нет</p>
            <p className="text-sm mt-1">Запустите первый анализ — он появится здесь</p>
          </div>
        )}

        <div className="space-y-3">
          {data?.items.map(item => (
            <AnalysisCard
              key={item.id}
              item={item}
              onOpen={setSelectedId}
              onDelete={id => deleteMutation.mutate(id)}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              Назад
            </Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
              Вперёд
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
