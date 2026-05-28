import { Download, ExternalLink } from 'lucide-react'
import { useAnalysisDetail } from '../hooks/useHistory'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'

interface Props {
  analysisId: number
  onBack: () => void
}

function ScoreRing({ score }: { score: number | null }) {
  if (score === null) return null
  const pct = Math.round(score * 100)
  const color = pct >= 75 ? 'text-green-600' : pct >= 50 ? 'text-yellow-600' : 'text-red-600'
  const ring = pct >= 75 ? 'border-green-500' : pct >= 50 ? 'border-yellow-500' : 'border-red-500'
  return (
    <div className={`w-16 h-16 rounded-full border-4 ${ring} flex items-center justify-center shrink-0`}>
      <span className={`text-lg font-bold ${color}`}>{pct}%</span>
    </div>
  )
}

function DecisionBadge({ decision }: { decision: string | null }) {
  if (!decision) return null
  const cls: Record<string, string> = {
    hire: 'bg-green-100 text-green-800 border-green-200',
    no_hire: 'bg-red-100 text-red-800 border-red-200',
    borderline: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  }
  return (
    <span className={`px-2.5 py-1 rounded-md text-sm font-medium border ${cls[decision] ?? 'bg-muted'}`}>
      {decision.replace('_', ' ')}
    </span>
  )
}

function DownloadResumeButton({ text }: { text: string }) {
  function handleDownload() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'resume.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      title="Скачать текст резюме"
    >
      <Download className="h-3.5 w-3.5" />
      Скачать резюме
    </button>
  )
}

export function AnalysisDetailPage({ analysisId, onBack }: Props) {
  const { data, isLoading, isError } = useAnalysisDetail(analysisId)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">

        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            История
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />)}
          </div>
        )}

        {isError && <p className="text-destructive text-sm">Не удалось загрузить анализ.</p>}

        {data && (
          <>
            {/* ── Header card: links first, then score ── */}
            <div className="flex items-start gap-6 p-6 border rounded-xl bg-card">
              <ScoreRing score={data.match_score} />

              <div className="space-y-3 flex-1 min-w-0">
                {/* Vacancy link + resume copy — at the top */}
                <div className="flex flex-wrap items-center gap-4">
                  {data.vacancy_url ? (
                    <a
                      href={data.vacancy_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Открыть вакансию
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">Вакансия (текст)</span>
                  )}
                  <DownloadResumeButton text={data.resume_text} />
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{data.mode}</Badge>
                  {data.seniority && data.seniority !== 'unknown' && (
                    <Badge variant="secondary">{data.seniority}</Badge>
                  )}
                  <DecisionBadge decision={data.decision} />
                  {data.seniority_confidence !== null && data.seniority_confidence !== undefined && (
                    <span className="text-xs text-muted-foreground">
                      confidence {Math.round(data.seniority_confidence * 100)}%
                    </span>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  {new Date(data.created_at).toLocaleString()}
                </p>
              </div>
            </div>

            {/* ── Skills ── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium">Matched skills</p>
                {data.skills_found.length === 0
                  ? <p className="text-xs text-muted-foreground">—</p>
                  : (
                    <div className="flex flex-wrap gap-1.5">
                      {data.skills_found.map(s => (
                        <span key={s} className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded text-xs">{s}</span>
                      ))}
                    </div>
                  )}
              </div>
              <div className="border rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium">Missing skills</p>
                {data.skills_missing.length === 0
                  ? <p className="text-xs text-muted-foreground">—</p>
                  : (
                    <div className="flex flex-wrap gap-1.5">
                      {data.skills_missing.map(s => (
                        <span key={s} className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded text-xs">{s}</span>
                      ))}
                    </div>
                  )}
              </div>
            </div>

            {/* ── LLM advice ── */}
            {data.llm_response && (
              <div className="border rounded-xl p-6 space-y-3">
                <p className="text-sm font-medium">Рекомендация</p>
                <div className="prose prose-sm max-w-none text-foreground">
                  {data.llm_response.split('\n').map((line, i) => (
                    <p key={i} className="text-sm leading-relaxed text-muted-foreground">{line}</p>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
