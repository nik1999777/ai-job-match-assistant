import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
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

type ResumeTab = 'text' | 'pdf'

export function SeekForm() {
  const { seek, reset } = useSeekVacancies()
  const status = useSeekStore((s) => s.status)
  const loading = status === 'loading'
  const done = status === 'done'

  const [resumeTab, setResumeTab] = useState<ResumeTab>('text')
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
  })

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

  const tabCls = (t: ResumeTab) => [
    'px-3 py-1.5 text-xs font-medium transition-colors',
    resumeTab === t
      ? 'border-b-2 border-primary text-primary'
      : 'text-muted-foreground hover:text-foreground',
  ].join(' ')

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* Resume */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Резюме</label>
        <div className="flex gap-1 border-b mb-1">
          <button type="button" className={tabCls('text')} onClick={() => setResumeTab('text')} disabled={loading}>Текст</button>
          <button type="button" className={tabCls('pdf')}  onClick={() => setResumeTab('pdf')}  disabled={loading}>PDF</button>
        </div>

        {resumeTab === 'text' && (
          <Textarea
            placeholder="Вставьте текст резюме…"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            rows={10}
            disabled={loading}
            className="resize-none font-mono text-xs"
          />
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
                setPdfUrl(URL.createObjectURL(f))
                setPdfStatus('loading')
                upload.mutate({ data: { file: f } }, { onError: () => setPdfStatus('error') })
              }}
            />
            {pdfStatus === 'idle'    && <p className="text-sm text-muted-foreground">Нажмите чтобы выбрать PDF</p>}
            {pdfStatus === 'loading' && <p className="text-sm text-muted-foreground">Читаем {pdfName}…</p>}
            {pdfStatus === 'done'    && (
              <p className="text-sm text-green-600">
                ✓{' '}
                <a href={pdfUrl!} target="_blank" rel="noopener noreferrer" className="underline hover:no-underline" onClick={(e) => e.stopPropagation()}>
                  {pdfName}
                </a>
                {' '}— текст извлечён
              </p>
            )}
            {pdfStatus === 'error'   && <p className="text-sm text-red-500">Ошибка парсинга</p>}
          </label>
        )}
      </div>

      {/* Job title */}
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

      {/* Filters grid */}
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

      {/* Remote toggle */}
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
        {loading ? 'Ищем…' : `Найти вакансии`}
      </Button>
    </form>
  )
}
