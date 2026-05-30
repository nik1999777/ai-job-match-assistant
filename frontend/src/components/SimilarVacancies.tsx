import { ExternalLink } from 'lucide-react'
import type { SimilarVacancy } from '../store/analysisStore'

interface Props {
  vacancies: SimilarVacancy[]
  missingSkills: string[]
}

interface SkillFreq {
  skill: string
  count: number
  total: number
  isMissing: boolean
}

function computeBenchmark(vacancies: SimilarVacancy[], missingSkills: string[]): SkillFreq[] {
  const missing = new Set(missingSkills.map((s) => s.toLowerCase()))
  const freq: Record<string, number> = {}

  for (const v of vacancies) {
    for (const skill of v.skills ?? []) {
      freq[skill] = (freq[skill] ?? 0) + 1
    }
  }

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill, count]) => ({
      skill,
      count,
      total: vacancies.length,
      isMissing: missing.has(skill.toLowerCase()),
    }))
}

function scoreColor(score: number) {
  if (score >= 0.7) return 'text-green-600'
  if (score >= 0.5) return 'text-yellow-600'
  return 'text-muted-foreground'
}

export function SimilarVacancies({ vacancies, missingSkills }: Props) {
  if (vacancies.length === 0) return null

  const benchmark = computeBenchmark(vacancies, missingSkills)

  return (
    <div className="space-y-3">
      {/* Similar vacancies list */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
          Похожие вакансии на рынке
        </p>
        <div className="space-y-3">
          {vacancies.map((v, i) => (
            <div key={i} className="flex items-start gap-3">
              <span className="text-xs text-muted-foreground font-mono w-4 shrink-0 mt-0.5">
                #{i + 1}
              </span>
              <div className="flex-1 min-w-0">
                {v.url ? (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium leading-snug hover:underline inline-flex items-center gap-1 group"
                  >
                    <span className="truncate">{v.title ?? 'Вакансия'}</span>
                    <ExternalLink className="h-3 w-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </a>
                ) : (
                  <p className="text-sm font-medium leading-snug">{v.title ?? 'Вакансия'}</p>
                )}
                {(v.company || v.salary_str) && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {v.company && (
                      <span className="text-xs text-muted-foreground truncate">{v.company}</span>
                    )}
                    {v.company && v.salary_str && (
                      <span className="text-xs text-muted-foreground">·</span>
                    )}
                    {v.salary_str && (
                      <span className="text-xs text-green-600 font-medium">{v.salary_str}</span>
                    )}
                  </div>
                )}
                {(v.skills ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(v.skills ?? []).slice(0, 6).map((s) => (
                      <span
                        key={s}
                        className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded text-xs"
                      >
                        {s}
                      </span>
                    ))}
                    {(v.skills ?? []).length > 6 && (
                      <span className="text-xs text-muted-foreground self-center">
                        +{(v.skills ?? []).length - 6}
                      </span>
                    )}
                  </div>
                )}
              </div>
              {v.score != null && (
                <span className={`text-xs font-medium shrink-0 tabular-nums ${scoreColor(v.score)}`}>
                  {Math.round(v.score * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Skill benchmark */}
      {benchmark.length > 0 && (
        <div className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
            Навыки в похожих вакансиях
          </p>
          <div className="space-y-2">
            {benchmark.map(({ skill, count, total, isMissing }) => (
              <div key={skill} className="flex items-center gap-2.5">
                <span
                  className={`text-xs w-36 shrink-0 font-medium ${
                    isMissing ? 'text-red-600' : 'text-foreground'
                  }`}
                  title={skill}
                >
                  {skill.length > 18 ? skill.slice(0, 17) + '…' : skill}
                  {isMissing && <span className="ml-1 text-red-400 font-normal">✗</span>}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      isMissing ? 'bg-red-400' : 'bg-primary/60'
                    }`}
                    style={{ width: `${(count / total) * 100}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0 w-8 text-right">
                  {count}/{total}
                </span>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            <span className="text-red-500">✗</span> — навыки, которых нет в вашем резюме
          </p>
        </div>
      )}
    </div>
  )
}
