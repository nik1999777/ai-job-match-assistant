import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { useAnalyze } from '../hooks/useAnalyze'
import { useUploadResume } from '../hooks/useUploadResume'
import { useAnalysisStore } from '../store/analysisStore'

type ResumeTab = 'text' | 'hh' | 'pdf'
type VacancyTab = 'url' | 'text'

function TabBar<T extends string>({ tabs, active, onSelect, disabled }: {
  tabs: { id: T; label: string }[]
  active: T
  onSelect: (id: T) => void
  disabled: boolean
}) {
  return (
    <div className="flex gap-1 border-b mb-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          disabled={disabled}
          className={[
            'px-3 py-1.5 text-xs font-medium transition-colors',
            active === t.id
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function ResumeInput({ disabled }: { disabled: boolean }) {
  const [tab, setTab] = useState<ResumeTab>('text')
  const [resumeText, setResumeText] = useState('')
  const [resumeUrl, setResumeUrl] = useState('')

  const upload = useUploadResume((text) => setResumeText(text))

  const resumeTabs = [
    { id: 'text' as ResumeTab, label: 'Текст' },
    { id: 'hh' as ResumeTab,   label: 'hh.ru профиль' },
    { id: 'pdf' as ResumeTab,  label: 'PDF' },
  ]

  return { tab, resumeText, setResumeText, resumeUrl, setResumeUrl, upload, resumeTabs }
}

export function AnalyzeForm() {
  const { analyze, reset } = useAnalyze()
  const status = useAnalysisStore((s) => s.status)
  const loading = status === 'loading'
  const done = status === 'done'

  const [resumeTab, setResumeTab] = useState<ResumeTab>('text')
  const [resumeText, setResumeText] = useState('')
  const [resumeUrl, setResumeUrl] = useState('')
  const [vacancyTab, setVacancyTab] = useState<VacancyTab>('url')
  const [vacancyUrl, setVacancyUrl] = useState('')
  const [vacancyText, setVacancyText] = useState('')
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [pdfName, setPdfName] = useState('')

  const upload = useUploadResume((text) => {
    setResumeText(text)
    setPdfStatus('done')
  })

  const hasResume = resumeText.trim() || resumeUrl.trim()
  const hasVacancy = vacancyTab === 'url' ? vacancyUrl.trim() : vacancyText.trim()

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!hasResume || !hasVacancy) return
    analyze({
      resume: resumeText.trim() || undefined,
      resume_url: resumeUrl.trim() || undefined,
      vacancy_url: vacancyTab === 'url' ? vacancyUrl.trim() : undefined,
      vacancy: vacancyTab === 'text' ? vacancyText.trim() : undefined,
    })
  }

  const resumeTabs = [
    { id: 'text' as ResumeTab, label: 'Текст' },
    { id: 'hh' as ResumeTab,   label: 'hh.ru профиль' },
    { id: 'pdf' as ResumeTab,  label: 'PDF' },
  ]

  const vacancyTabs = [
    { id: 'url' as VacancyTab, label: 'URL (hh.ru / LinkedIn)' },
    { id: 'text' as VacancyTab, label: 'Текст' },
  ]

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Анализ завершён.</p>
        <Button variant="outline" onClick={reset}>Анализировать ещё</Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Resume */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Резюме</label>
        <TabBar tabs={resumeTabs} active={resumeTab} onSelect={setResumeTab} disabled={loading} />

        {resumeTab === 'text' && (
          <Textarea
            placeholder="Вставьте текст резюме..."
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={12}
            disabled={loading}
            className="resize-none font-mono text-xs"
          />
        )}

        {resumeTab === 'hh' && (
          <div className="flex flex-col gap-2">
            <input
              type="url"
              placeholder="https://hh.ru/resume/..."
              value={resumeUrl}
              onChange={(e) => setResumeUrl(e.target.value)}
              disabled={loading}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <p className="text-xs text-muted-foreground">
              Ссылка на публичное резюме — страница будет открыта через Playwright
            </p>
          </div>
        )}

        {resumeTab === 'pdf' && (
          <label className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input px-4 py-10 cursor-pointer hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              disabled={loading || upload.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (!f) return
                setPdfName(f.name)
                setPdfStatus('loading')
                upload.mutate({ data: { file: f } }, {
                  onError: () => setPdfStatus('error'),
                })
              }}
            />
            {pdfStatus === 'idle' && <p className="text-sm text-muted-foreground">Нажмите чтобы выбрать PDF</p>}
            {(pdfStatus === 'loading' || upload.isPending) && <p className="text-sm text-muted-foreground">Читаем {pdfName}…</p>}
            {pdfStatus === 'done' && <p className="text-sm text-green-600">✓ {pdfName} — текст извлечён</p>}
            {pdfStatus === 'error' && <p className="text-sm text-red-500">Ошибка парсинга — попробуйте другой PDF</p>}
          </label>
        )}
      </div>

      {/* Vacancy */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Вакансия</label>
        <TabBar tabs={vacancyTabs} active={vacancyTab} onSelect={setVacancyTab} disabled={loading} />

        {vacancyTab === 'url' && (
          <input
            type="url"
            placeholder="https://hh.ru/vacancy/... или https://linkedin.com/jobs/..."
            value={vacancyUrl}
            onChange={(e) => setVacancyUrl(e.target.value)}
            disabled={loading}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
        )}

        {vacancyTab === 'text' && (
          <Textarea
            placeholder="Вставьте текст вакансии..."
            value={vacancyText}
            onChange={(e) => setVacancyText(e.target.value)}
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
