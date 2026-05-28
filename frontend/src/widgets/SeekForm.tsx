import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { PdfFileCard } from '../components/PdfFileCard'
import { useSeekVacancies } from '../hooks/useSeekVacancies'
import { useSeekStore } from '../store/seekStore'
import { useUploadResume } from '../hooks/useUploadResume'

const AREAS = [
  { value: 1,   label: 'Москва' },
  { value: 2,   label: 'Санкт-Петербург' },
  { value: 113, label: 'Вся Россия' },
]

const EXPERIENCE_OPTIONS = [
  { value: '',              label: 'Любой' },
  { value: 'noExperience',  label: 'Нет опыта' },
  { value: 'between1And3',  label: '1–3 года' },
  { value: 'between3And6',  label: '3–6 лет' },
  { value: 'moreThan6',     label: '6+ лет' },
]

const COUNT_OPTIONS = [5, 10, 15, 20]

export function SeekForm() {
  const { seek, reset } = useSeekVacancies()
  const status = useSeekStore((s) => s.status)
  const loading = status === 'loading'
  const done = status === 'done'

  // Resume — PDF only
  const [resumeText, setResumeText] = useState('')
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [pdfName, setPdfName] = useState('')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)

  const [jobTitle, setJobTitle] = useState('')
  const [area, setArea] = useState(1)
  const [experience, setExperience] = useState('')
  const [salaryFrom, setSalaryFrom] = useState('')
  const [remote, setRemote] = useState(false)
  const [count, setCount] = useState(10)

  const upload = useUploadResume((text) => {
    setResumeText(text)
    setPdfStatus('done')
    // file_id not used in seek (no history download for seek sessions yet)
  })

  function handlePdfFile(file: File) {
    setPdfName(file.name)
    setPdfUrl(URL.createObjectURL(file))
    setPdfStatus('loading')
    upload.mutate({ data: { file } }, { onError: () => setPdfStatus('error') })
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    if (!resumeText.trim()) return
    seek({
      resume: resumeText.trim(),
      job_title: jobTitle.trim() || undefined,
      area,
      experience: experience || null,
      salary_from: salaryFrom ? Number(salaryFrom) : null,
      remote,
      count,
    })
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Поиск завершён.</p>
        <Button variant="outline" onClick={reset}>Новый поиск</Button>
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

      {/* ── Job title ── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">
          Желаемая должность
          <span className="text-xs text-muted-foreground ml-1">(если пусто — определим из резюме)</span>
        </label>
        <input
          type="text"
          placeholder="Python Developer, ML Engineer…"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          disabled={loading}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>

      {/* ── Filters grid ── */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Город</label>
          <select
            value={area}
            onChange={(e) => setArea(Number(e.target.value))}
            disabled={loading}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            {AREAS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Опыт</label>
          <select
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
            disabled={loading}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            {EXPERIENCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Зарплата от (₽)</label>
          <input
            type="number"
            placeholder="100000"
            value={salaryFrom}
            onChange={(e) => setSalaryFrom(e.target.value)}
            disabled={loading}
            min={0}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">Кол-во вакансий</label>
          <select
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={loading}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          >
            {COUNT_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} вакансий</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Remote toggle ── */}
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={remote}
          onChange={(e) => setRemote(e.target.checked)}
          disabled={loading}
          className="h-4 w-4 rounded border-input"
        />
        <span className="text-sm">Только удалённая работа</span>
      </label>

      <Button type="submit" disabled={loading || !resumeText.trim()}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Ищем…' : 'Найти вакансии'}
      </Button>
    </form>
  )
}
