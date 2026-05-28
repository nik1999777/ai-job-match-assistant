import { useState } from 'react'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { PdfFileCard } from '../components/PdfFileCard'
import { useAnalyze } from '../hooks/useAnalyze'
import { useUploadResume } from '../hooks/useUploadResume'
import { useAnalysisStore } from '../store/analysisStore'

export function AnalyzeForm() {
  const { analyze, reset } = useAnalyze()
  const status = useAnalysisStore((s) => s.status)
  const loading = status === 'loading'
  const done = status === 'done'

  // Resume — PDF only
  const [resumeText, setResumeText] = useState('')
  const [resumeFileId, setResumeFileId] = useState<string | null>(null)
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [pdfName, setPdfName] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  // Vacancy — URL only
  const [vacancyUrl, setVacancyUrl] = useState('')

  const upload = useUploadResume((text, fileId) => {
    setResumeText(text)
    setResumeFileId(fileId)
    setPdfStatus('done')
  })

  function handlePdfFile(file: File) {
    setPdfName(file.name)
    setPdfUrl(URL.createObjectURL(file))
    setPdfStatus('loading')
    upload.mutate({ data: { file } }, { onError: () => setPdfStatus('error') })
  }

  const hasResume = resumeText.trim()
  const hasVacancy = vacancyUrl.trim()

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!hasResume || !hasVacancy) return
    analyze({
      resume: resumeText.trim(),
      resume_file_id: resumeFileId,
      vacancy_url: vacancyUrl.trim(),
    })
  }

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

      {/* ── Resume (PDF only) ── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Резюме</label>

        {pdfStatus === 'idle' && (
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
            <p className="text-sm text-muted-foreground">Загрузите PDF-резюме</p>
            <p className="text-xs text-muted-foreground/60">Нажмите или перетащите файл сюда</p>
          </label>
        )}

        {(pdfStatus === 'loading' || upload.isPending) && (
          <div className="flex items-center gap-2 rounded-md border border-input px-4 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Читаем {pdfName}…
          </div>
        )}

        {pdfStatus === 'done' && (
          <PdfFileCard
            fileName={pdfName}
            fileUrl={pdfUrl}
            disabled={loading}
            onReplace={handlePdfFile}
          />
        )}

        {pdfStatus === 'error' && (
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

      {/* ── Vacancy (URL only) ── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Вакансия</label>
        <input
          type="url"
          placeholder="https://hh.ru/vacancy/..."
          value={vacancyUrl}
          onChange={(e) => setVacancyUrl(e.target.value)}
          disabled={loading}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
        {vacancyUrl.trim() && (
          <a
            href={vacancyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
          >
            <ExternalLink className="h-3 w-3" />
            Открыть вакансию
          </a>
        )}
      </div>

      <Button type="submit" disabled={loading || !hasResume || !hasVacancy}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Анализируем...' : 'Анализировать'}
      </Button>
    </form>
  )
}
