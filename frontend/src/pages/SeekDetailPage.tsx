import { useSeekDetail, type VacancyResult } from '../hooks/useHistory'
import { Button } from '../components/ui/button'

interface Props {
  sessionId: number
  onBack: () => void
}

const DECISION_LABEL: Record<string, string> = {
  strong_match: 'Отлично подходит',
  worth_considering: 'Стоит рассмотреть',
  weak_match: 'Слабое совпадение',
}

const DECISION_CLS: Record<string, string> = {
  strong_match: 'bg-green-100 text-green-800',
  worth_considering: 'bg-yellow-100 text-yellow-800',
  weak_match: 'bg-red-100 text-red-800',
}

function VacancyCard({ result, rank }: { result: VacancyResult; rank: number }) {
  const pct = Math.round(result.match_score * 100)
  const scoreColor = pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'

  return (
    <div className="border rounded-xl p-4 space-y-3 bg-card">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-mono">#{rank}</span>
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium hover:underline"
          >
            {result.title}
          </a>
          <span className="text-xs text-muted-foreground">{result.company}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {result.salary_str && (
            <span className="text-xs text-muted-foreground">{result.salary_str}</span>
          )}
          <span className={`font-semibold text-sm ${scoreColor}`}>{pct}%</span>
        </div>
      </div>

      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${DECISION_CLS[result.decision] ?? 'bg-muted'}`}>
        {DECISION_LABEL[result.decision] ?? result.decision}
      </span>

      {result.skills_found.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.skills_found.map(s => (
            <span key={s} className="px-1.5 py-0.5 bg-green-50 text-green-700 rounded text-xs">{s}</span>
          ))}
        </div>
      )}

      {result.skills_missing.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {result.skills_missing.map(s => (
            <span key={s} className="px-1.5 py-0.5 bg-red-50 text-red-700 rounded text-xs">{s}</span>
          ))}
        </div>
      )}

      {result.explanation && (
        <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">{result.explanation}</p>
      )}
    </div>
  )
}

export function SeekDetailPage({ sessionId, onBack }: Props) {
  const { data, isLoading, isError } = useSeekDetail(sessionId)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">{data?.job_title ?? 'Поиск работы'}</h2>
          {data && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {data.result_count} вакансий · {new Date(data.created_at).toLocaleString()}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={onBack}>← Назад</Button>
      </div>

      {isLoading && [1, 2, 3].map(i => (
        <div key={i} className="border rounded-xl p-4 h-28 bg-muted animate-pulse" />
      ))}

      {isError && <p className="text-destructive text-sm">Не удалось загрузить результаты.</p>}

      <div className="space-y-3">
        {data?.results.map((r, i) => (
          <VacancyCard key={r.vacancy_id} result={r} rank={i + 1} />
        ))}
      </div>
    </div>
  )
}
