import type { AdviceData, HRAdvice, SeekerAdvice } from '../store/analysisStore'

function isSeekerAdvice(data: AdviceData): data is SeekerAdvice {
  return 'overall' in data
}

const DECISION_RU: Record<string, string> = {
  'Hire': 'Нанять',
  'Borderline': 'На рассмотрении',
  'No Hire': 'Отказ',
}

function DecisionChip({ decision }: { decision: HRAdvice['decision'] }) {
  const styles: Record<string, string> = {
    'Hire': 'bg-green-50 text-green-800 border-green-200',
    'Borderline': 'bg-yellow-50 text-yellow-800 border-yellow-200',
    'No Hire': 'bg-red-50 text-red-800 border-red-200',
  }
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-md text-sm font-semibold border ${styles[decision] ?? 'bg-muted'}`}>
      {DECISION_RU[decision] ?? decision}
    </span>
  )
}

function SeekerView({ advice }: { advice: SeekerAdvice }) {
  return (
    <div className="space-y-3">
      {/* Overall */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Общая оценка</p>
        <p className="text-sm leading-relaxed">{advice.overall}</p>
      </div>

      {/* Top skills to develop */}
      {advice.top_skills.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Приоритетные навыки</p>
          <div className="space-y-2.5">
            {advice.top_skills.map((tip, i) => (
              <div key={i} className="flex gap-2.5 items-start">
                <span className="mt-0.5 px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs font-medium shrink-0">
                  {tip.skill}
                </span>
                <span className="text-sm text-muted-foreground leading-relaxed">{tip.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resume tips */}
      {advice.resume_tips.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Правки резюме</p>
          <ul className="space-y-1.5">
            {advice.resume_tips.map((tip, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-muted-foreground/40 shrink-0 mt-0.5">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Strategy */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Стратегия подачи</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{advice.strategy}</p>
      </div>
    </div>
  )
}

function HRView({ advice }: { advice: HRAdvice }) {
  return (
    <div className="space-y-3">
      {/* Candidate fit */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Оценка кандидата</p>
        <p className="text-sm leading-relaxed">{advice.candidate_fit}</p>
      </div>

      {/* Strengths + Gaps side by side */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-green-700 uppercase tracking-wide mb-3">Сильные стороны</p>
          {advice.strengths.length === 0
            ? <p className="text-xs text-muted-foreground">—</p>
            : (
              <ul className="space-y-1.5">
                {advice.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="text-green-500 shrink-0">✓</span>
                    {s}
                  </li>
                ))}
              </ul>
            )}
        </div>
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-red-700 uppercase tracking-wide mb-3">Пробелы</p>
          {advice.gaps.length === 0
            ? <p className="text-xs text-muted-foreground">—</p>
            : (
              <ul className="space-y-1.5">
                {advice.gaps.map((g, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="text-red-500 shrink-0">✗</span>
                    {g}
                  </li>
                ))}
              </ul>
            )}
        </div>
      </div>

      {/* Decision */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Решение</p>
        <div className="flex items-center gap-3">
          <DecisionChip decision={advice.decision} />
          <p className="text-sm text-muted-foreground">{advice.decision_reason}</p>
        </div>
      </div>
    </div>
  )
}

export function AdviceCard({ data }: { data: AdviceData }) {
  if (isSeekerAdvice(data)) return <SeekerView advice={data} />
  return <HRView advice={data} />
}

export function AdviceSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="rounded-lg border p-4 space-y-2">
        <div className="h-3 w-24 bg-muted rounded" />
        <div className="h-4 bg-muted rounded w-full" />
        <div className="h-4 bg-muted rounded w-4/5" />
      </div>
      <div className="rounded-lg border p-4 space-y-2">
        <div className="h-3 w-32 bg-muted rounded" />
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-4 bg-muted rounded w-2/3" />
      </div>
      <div className="rounded-lg border p-4 space-y-2">
        <div className="h-3 w-28 bg-muted rounded" />
        <div className="h-4 bg-muted rounded w-full" />
      </div>
    </div>
  )
}
