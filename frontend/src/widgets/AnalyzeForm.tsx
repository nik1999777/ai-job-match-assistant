import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { PdfFileCard } from '../components/PdfFileCard'
import { useAnalyze } from '../hooks/useAnalyze'
import { useUploadResume } from '../hooks/useUploadResume'
import { useAnalysisStore } from '../store/analysisStore'

type ResumeTab = 'text' | 'pdf'
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

export function AnalyzeForm() {
  const { analyze, reset } = useAnalyze()
  const status = useAnalysisStore((s) => s.status)
  const loading = status === 'loading'
  const done = status === 'done'

  const [resumeTab, setResumeTab] = useState<ResumeTab>('text')
  const [resumeText, setResumeText] = useState('')
  const [vacancyTab, setVacancyTab] = useState<VacancyTab>('url')
  const [vacancyUrl, setVacancyUrl] = useState('')
  const [vacancyText, setVacancyText] = useState('')
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [pdfName, setPdfName] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const upload = useUploadResume((text) => {
    setResumeText(text)
    setPdfStatus('done')
  })

  function handlePdfFile(file: File) {
    setPdfName(file.name)
    setPdfUrl(URL.createObjectURL(file))
    setPdfStatus('loading')
    upload.mutate({ data: { file } }, { onError: () => setPdfStatus('error') })
  }

  const hasResume = resumeText.trim()
  const hasVacancy = vacancyTab === 'url' ? vacancyUrl.trim() : vacancyText.trim()

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!hasResume || !hasVacancy) return
    analyze({
      resume: resumeText.trim() || undefined,
      vacancy_url: vacancyTab === 'url' ? vacancyUrl.trim() : undefined,
      vacancy: vacancyTab === 'text' ? vacancyText.trim() : undefined,
    })
  }

  const resumeTabs = [
    { id: 'text' as ResumeTab, label: 'Текст' },
    { id: 'pdf' as ResumeTab,  label: 'PDF' },
  ]

  const vacancyTabs = [
    { id: 'url' as VacancyTab, label: 'URL (hh.ru)' },
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
            className="resize-none text-sm"
          />
        )}

        {resumeTab === 'pdf' && pdfStatus === 'idle' && (
          <label className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input px-4 py-10 cursor-pointer hover:border-primary/50 transition-colors">
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              disabled={loading || upload.isPending}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) handlePdfFile(f)
              }}
            />
            <p className="text-sm text-muted-foreground">Нажмите или перетащите PDF-файл</p>
          </label>
        )}

        {resumeTab === 'pdf' && (pdfStatus === 'loading' || upload.isPending) && (
          <div className="flex items-center gap-2 rounded-md border border-input px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Читаем {pdfName}…
          </div>
        )}

        {resumeTab === 'pdf' && pdfStatus === 'done' && (
          <PdfFileCard
            fileName={pdfName}
            fileUrl={pdfUrl}
            text={resumeText}
            disabled={loading}
            onReplace={handlePdfFile}
          />
        )}

        {resumeTab === 'pdf' && pdfStatus === 'error' && (
          <div className="flex flex-col items-center gap-2 rounded-md border-2 border-dashed border-destructive/40 px-4 py-8">
            <p className="text-sm text-destructive">Ошибка парсинга — попробуйте другой PDF</p>
            <label className="text-xs text-muted-foreground underline cursor-pointer hover:text-foreground">
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                disabled={loading}
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handlePdfFile(f)
                }}
              />
              Выбрать другой файл
            </label>
          </div>
        )}
      </div>

      {/* Vacancy */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Вакансия</label>
        <TabBar tabs={vacancyTabs} active={vacancyTab} onSelect={setVacancyTab} disabled={loading} />

        {vacancyTab === 'url' && (
          <input
            type="url"
            placeholder="https://hh.ru/vacancy/..."
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
            className="resize-none text-sm"
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
