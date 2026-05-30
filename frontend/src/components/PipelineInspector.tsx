import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Separator } from './ui/separator'
import type { GapData, ParsedData } from '../store/analysisStore'

interface Props {
  parsedData: ParsedData | null
  gapData: GapData | null
  rawResume: string
  rawVacancy: string
}

function Section({ title, children, defaultOpen = false }: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border rounded-md overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        }
        {title}
      </button>
      {open && (
        <div className="px-3 py-3 text-xs font-mono text-muted-foreground space-y-2 bg-background">
          {children}
        </div>
      )}
    </div>
  )
}

function RawText({ label, text }: { label: string; text: string }) {
  const [expanded, setExpanded] = useState(false)
  const preview = text.slice(0, 400)
  const isTruncated = text.length > 400
  return (
    <div className="space-y-1">
      <div className="text-muted-foreground font-sans font-semibold text-xs uppercase tracking-wide">{label}</div>
      <pre className="whitespace-pre-wrap break-words leading-relaxed">
        {expanded ? text : preview}
        {isTruncated && !expanded && '…'}
      </pre>
      {isTruncated && (
        <button
          onClick={() => setExpanded(e => !e)}
          className="text-primary hover:underline font-sans text-xs"
        >
          {expanded ? 'Свернуть' : `Показать всё (${text.length} симв.)`}
        </button>
      )}
    </div>
  )
}

function JsonRow({ label, value }: { label: string; value: unknown }) {
  const display = Array.isArray(value)
    ? value.length === 0 ? '—' : value.join(', ')
    : value == null || value === '' ? '—' : String(value)
  return (
    <div className="grid grid-cols-[160px_1fr] gap-2">
      <span className="text-muted-foreground font-sans shrink-0">{label}</span>
      <span className="break-words">{display}</span>
    </div>
  )
}

export function PipelineInspector({ parsedData, gapData, rawResume, rawVacancy }: Props) {
  const [open, setOpen] = useState(false)

  if (!parsedData && !gapData) return null

  const matchPct = gapData ? Math.round(gapData.match_score * 100) : null
  const confidencePct = gapData ? Math.round(gapData.seniority_confidence * 100) : null

  return (
    <div className="flex flex-col gap-2">
      <Separator />
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5" />
          : <ChevronRight className="h-3.5 w-3.5" />
        }
        Инспектор пайплайна
      </button>

      {open && (
        <div className="flex flex-col gap-2">
          {(rawResume || rawVacancy) && (
            <Section title="Входные данные → Пайплайн">
              {rawResume && <RawText label="RESUME" text={rawResume} />}
              {rawResume && rawVacancy && <Separator />}
              {rawVacancy && <RawText label="VACANCY" text={rawVacancy} />}
            </Section>
          )}

          {parsedData && (
            <Section title="parse_node → LLM extraction" defaultOpen>
              <JsonRow label="resume_summary" value={parsedData.resume_summary} />
              <JsonRow label="vacancy_summary" value={parsedData.vacancy_summary} />
              <JsonRow label="resume_skills" value={parsedData.resume_skills} />
              <JsonRow label="vacancy_skills" value={parsedData.vacancy_skills} />
              <JsonRow label="seniority_hint" value={parsedData.vacancy_seniority_hint} />
            </Section>
          )}

          {gapData && (
            <Section title="gap_node → skill matching + ML" defaultOpen>
              <JsonRow label="match_score" value={matchPct != null ? `${matchPct}%` : null} />
              <JsonRow label="seniority (ML)" value={gapData.seniority} />
              <JsonRow label="seniority_confidence" value={confidencePct != null ? `${confidencePct}%` : null} />
              <JsonRow label="skills_found" value={gapData.skills_found} />
              <JsonRow label="skills_missing" value={gapData.skills_missing} />
              {gapData.similar_vacancies.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-muted-foreground font-sans font-semibold text-xs uppercase tracking-wide">
                    similar_vacancies (RAG · Qdrant)
                  </div>
                  {gapData.similar_vacancies.map((v, i) => (
                    <div key={i} className="pl-2 border-l border-border">
                      <span className="font-sans">{v.title ?? 'Vacancy'}</span>
                      {v.skills && v.skills.length > 0 && (
                        <span className="text-muted-foreground"> — {v.skills.slice(0, 5).join(', ')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          )}

          {gapData && parsedData && (
            <Section title="advise_node → LLM prompt (reconstructed)">
              <pre className="whitespace-pre-wrap break-words leading-relaxed text-xs">
{`RESUME SUMMARY: ${parsedData.resume_summary ?? '—'}
VACANCY SUMMARY: ${parsedData.vacancy_summary ?? '—'}
MATCH SCORE: ${matchPct != null ? matchPct + '%' : '—'}
SENIORITY: ${gapData.seniority} (confidence: ${confidencePct != null ? confidencePct + '%' : '—'})

MATCHING SKILLS: ${gapData.skills_found.join(', ') || 'none'}
MISSING SKILLS: ${gapData.skills_missing.join(', ') || 'none'}

SIMILAR VACANCIES ON MARKET:
${gapData.similar_vacancies.length > 0
  ? gapData.similar_vacancies.map(v =>
      `- ${v.title ?? 'Vacancy'}: ${(v.skills ?? []).slice(0, 5).join(', ') || 'n/a'}`
    ).join('\n')
  : 'No similar vacancies retrieved.'
}`}
              </pre>
            </Section>
          )}
        </div>
      )}
    </div>
  )
}
