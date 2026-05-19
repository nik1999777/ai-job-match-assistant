import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ResumeInput } from '@/features/analyze/ui/ResumeInput'

interface AnalyzeParams {
  resume?: string
  resumeUrl?: string
  vacancyUrl?: string
  vacancyText?: string
}

interface Props {
  onSubmit: (params: AnalyzeParams) => void
  onReset: () => void
  loading: boolean
  done: boolean
}

type VacancyTab = 'url' | 'text'

export function AnalyzeForm({ onSubmit, onReset, loading, done }: Props) {
  const [resumeText, setResumeText] = useState('')
  const [resumeUrl, setResumeUrl] = useState('')
  const [vacancyTab, setVacancyTab] = useState<VacancyTab>('url')
  const [vacancyUrl, setVacancyUrl] = useState('')
  const [vacancyText, setVacancyText] = useState('')

  const hasResume = resumeText.trim() || resumeUrl.trim()
  const hasVacancy = vacancyTab === 'url' ? vacancyUrl.trim() : vacancyText.trim()

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!hasResume || !hasVacancy) return
    onSubmit({
      resume: resumeText.trim() || undefined,
      resumeUrl: resumeUrl.trim() || undefined,
      vacancyUrl: vacancyTab === 'url' ? vacancyUrl.trim() : undefined,
      vacancyText: vacancyTab === 'text' ? vacancyText.trim() : undefined,
    })
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Анализ завершён.</p>
        <Button variant="outline" onClick={onReset}>Анализировать ещё</Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Resume */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Резюме</label>
        <ResumeInput
          value={resumeText}
          onChange={setResumeText}
          onResumeUrl={setResumeUrl}
          resumeUrl={resumeUrl}
          disabled={loading}
        />
      </div>

      {/* Vacancy */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Вакансия</label>
        <div className="flex gap-1 border-b mb-1">
          {(['url', 'text'] as VacancyTab[]).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setVacancyTab(t)}
              disabled={loading}
              className={[
                'px-3 py-1.5 text-xs font-medium transition-colors',
                vacancyTab === t
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-muted-foreground hover:text-foreground',
              ].join(' ')}
            >
              {t === 'url' ? 'URL (hh.ru / LinkedIn)' : 'Текст'}
            </button>
          ))}
        </div>

        {vacancyTab === 'url' && (
          <input
            type="url"
            placeholder="https://hh.ru/vacancy/... или https://linkedin.com/jobs/..."
            value={vacancyUrl}
            onChange={e => setVacancyUrl(e.target.value)}
            disabled={loading}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
        )}

        {vacancyTab === 'text' && (
          <Textarea
            placeholder="Вставьте текст вакансии..."
            value={vacancyText}
            onChange={e => setVacancyText(e.target.value)}
            rows={8}
            disabled={loading}
            className="resize-none text-xs"
          />
        )}
      </div>

      <Button type="submit" disabled={loading || !hasResume || !hasVacancy}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Анализируем...' : 'Анализировать'}
      </Button>
    </form>
  )
}
