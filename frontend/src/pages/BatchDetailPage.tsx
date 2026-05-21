import { useBatchDetail, type CandidateResult } from '../hooks/useHistory'
import { Button } from '../components/ui/button'

interface Props {
  sessionId: number
  onBack: () => void
}

function DecisionBadge({ decision }: { decision: string }) {
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

function CandidateCard({ result, rank }: { result: CandidateResult; rank: number }) {
  const pct = Math.round(result.match_score * 100)
  const scoreColor = pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-card">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono w-5">#{rank}</span>
          <span className="text-sm font-medium">{result.candidate_id}</span>
          <DecisionBadge decision={result.decision} />
          {result.seniority && result.seniority !== 'unknown' && (
            <span className="text-xs text-muted-foreground">{result.seniority}</span>
          )}
        </div>
        <span className={`font-semibold text-sm ${scoreColor}`}>{pct}%</span>
      </div>

      {result.skills_found.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Навыки найдены</p>
          <div className="flex flex-wrap gap-1">
            {result.skills_found.map(s => (
              <span key={s} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs">{s}</span>
            ))}
          </div>
        </div>
      )}

      {result.skills_missing.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Навыки отсутствуют</p>
          <div className="flex flex-wrap gap-1">
            {result.skills_missing.map(s => (
              <span key={s} className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs">{s}</span>
            ))}
          </div>
        </div>
      )}

      {result.explanation && (
        <p className="text-sm text-muted-foreground leading-relaxed">{result.explanation}</p>
      )}
    </div>
  )
}

export function BatchDetailPage({ sessionId, onBack }: Props) {
  const { data, isLoading, isError } = useBatchDetail(sessionId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Скрининг резюме</h2>
          {data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {data.candidate_count} кандидатов · {new Date(data.created_at).toLocaleString()}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>← Назад</Button>
      </div>

      {data && (
        <div className="border rounded-xl p-3 bg-muted/40">
          <p className="text-xs text-muted-foreground mb-1">Вакансия</p>
          <p className="text-sm leading-relaxed line-clamp-3">{data.vacancy_text}</p>
        </div>
      )}

      {isLoading && [1, 2, 3].map(i => (
        <div key={i} className="border rounded-xl p-4 h-28 bg-muted animate-pulse" />
      ))}

      {isError && <p className="text-destructive text-sm">Не удалось загрузить результаты.</p>}

      <div className="space-y-3">
        {data?.results.map((result, i) => (
          <CandidateCard key={result.candidate_id} result={result} rank={i + 1} />
        ))}
      </div>
    </div>
  )
}
