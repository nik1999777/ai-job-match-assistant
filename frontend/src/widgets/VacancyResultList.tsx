import { useState } from 'react'
import { ExternalLink, ChevronDown, ChevronUp } from 'lucide-react'
import { useSeekStore, type VacancyResult, type SeekDecision } from '../store/seekStore'

const DECISION_LABEL: Record<SeekDecision, string> = {
  strong_match:      'Сильный матч',
  worth_considering: 'Стоит рассмотреть',
  weak_match:        'Слабый матч',
}

const DECISION_CLS: Record<SeekDecision, string> = {
  strong_match:      'bg-green-100 text-green-800',
  worth_considering: 'bg-yellow-100 text-yellow-800',
  weak_match:        'bg-gray-100 text-gray-600',
}

function VacancyCard({ result, rank }: { result: VacancyResult; rank: number }) {
  const [expanded, setExpanded] = useState(false)
  const pct = Math.round(result.match_score * 100)

  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <span className="shrink-0 text-xs font-bold text-muted-foreground mt-0.5">#{rank}</span>
          <div>
            <p className="font-medium text-sm leading-snug">{result.title}</p>
            <p className="text-xs text-muted-foreground">
              {result.company}
              {result.salary_str && <span className="ml-2 text-foreground">· {result.salary_str}</span>}
            </p>
          </div>
        </div>
        <a
          href={result.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {/* Score bar + decision */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={[
              'h-full rounded-full transition-all',
              pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-400' : 'bg-gray-300',
            ].join(' ')}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-semibold tabular-nums w-9 text-right">{pct}%</span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${DECISION_CLS[result.decision]}`}>
          {DECISION_LABEL[result.decision]}
        </span>
      </div>

      {/* Skills */}
      {(result.skills_found.length > 0 || result.skills_missing.length > 0) && (
        <div className="flex flex-wrap gap-1">
          {result.skills_found.map((s) => (
            <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200">
              ✓ {s}
            </span>
          ))}
          {result.skills_missing.map((s) => (
            <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200">
              ✗ {s}
            </span>
          ))}
        </div>
      )}

      {/* Expandable advice */}
      {result.explanation && (
        <div>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            {expanded ? 'Скрыть анализ' : 'Показать анализ'}
          </button>
          {expanded && (
            <div className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed border-t pt-2">
              {result.explanation}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export function VacancyResultList() {
  const { status, statusMessage, resumeSkills, searchQuery, totalFound, results, error } =
    useSeekStore()

  if (status === 'idle') {
    return (
      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
        Заполните форму и нажмите «Найти вакансии»
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status line */}
      {status === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-full bg-primary animate-pulse" />
          {statusMessage || 'Загружаем…'}
        </div>
      )}

      {/* Resume skills preview */}
      {resumeSkills.length > 0 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-xs text-muted-foreground mr-1">Скиллы из резюме:</span>
          {resumeSkills.map((s) => (
            <span key={s} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Search info */}
      {searchQuery && (
        <p className="text-xs text-muted-foreground">
          Запрос: «{searchQuery}» · найдено {totalFound} вакансий
          {results.length > 0 && ` · проанализировано ${results.length}`}
        </p>
      )}

      {/* Cards */}
      {results.map((r, i) => (
        <VacancyCard key={r.vacancy_id} result={r} rank={i + 1} />
      ))}

      {status === 'done' && results.length === 0 && (
        <p className="text-sm text-muted-foreground">Вакансий не найдено — попробуйте изменить фильтры.</p>
      )}
    </div>
  )
}
