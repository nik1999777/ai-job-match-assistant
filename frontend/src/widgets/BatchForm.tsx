import { useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { parseResumeApiParseResumePost } from '../api/generated'
import type { BatchRequest } from '../api/generated'

interface Candidate {
  id: string
  name: string
  text: string
  status: 'parsing' | 'ready' | 'error'
  url: string
}

type VacancyTab = 'url' | 'text'

interface Props {
  loading: boolean
  done: boolean
  onAnalyze: (request: BatchRequest, nameMap: Record<string, string>) => void
  onReset: () => void
}

export function BatchForm({ loading, done, onAnalyze, onReset }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [vacancyTab, setVacancyTab] = useState<VacancyTab>('url')
  const [vacancyUrl, setVacancyUrl] = useState('')
  const [vacancyText, setVacancyText] = useState('')
  const [fetchingVacancy, setFetchingVacancy] = useState(false)
  const [fetchError, setFetchError] = useState('')

  async function handleFetchVacancy() {
    if (!vacancyUrl.trim()) return
    setFetchingVacancy(true)
    setFetchError('')
    try {
      const res = await fetch('/api/fetch-vacancy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: vacancyUrl.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.detail ?? 'Failed to fetch vacancy')
      }
      const data = await res.json()
      setVacancyText(data.text)
      setVacancyTab('text')
    } catch (e) {
      setFetchError(String((e as Error).message ?? e))
    } finally {
      setFetchingVacancy(false)
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files) return
    const incoming: Candidate[] = Array.from(files).map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      name: f.name.replace(/\.pdf$/i, ''),
      text: '',
      status: 'parsing',
      url: URL.createObjectURL(f),
    }))
    setCandidates((prev) => [...prev, ...incoming])

    await Promise.all(
      Array.from(files).map(async (file, i) => {
        const id = incoming[i].id
        try {
          const res = await parseResumeApiParseResumePost({ file })
          const text = (res.data as { text?: string }).text ?? ''
          setCandidates((prev) =>
            prev.map((c) => c.id === id ? { ...c, text, status: 'ready' } : c)
          )
        } catch {
          setCandidates((prev) =>
            prev.map((c) => c.id === id ? { ...c, status: 'error' } : c)
          )
        }
      })
    )
  }

  function removeCandidate(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id))
  }

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault()
    const ready = candidates.filter((c) => c.status === 'ready')
    if (!ready.length || !vacancyText.trim()) return
    const nameMap = Object.fromEntries(ready.map((c) => [c.id, c.name]))
    onAnalyze(
      { vacancy: vacancyText.trim(), resumes: ready.map((c) => ({ candidate_id: c.id, resume: c.text })) },
      nameMap,
    )
  }

  function handleReset() {
    setCandidates([])
    setVacancyUrl('')
    setVacancyText('')
    setVacancyTab('url')
    setFetchError('')
    onReset()
  }

  const readyCount = candidates.filter((c) => c.status === 'ready').length
  const canSubmit = readyCount > 0 && vacancyText.trim().length > 0 && !loading

  const tabCls = (t: VacancyTab) => [
    'px-3 py-1.5 text-xs font-medium transition-colors',
    vacancyTab === t
      ? 'border-b-2 border-primary text-primary'
      : 'text-muted-foreground hover:text-foreground',
  ].join(' ')

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Vacancy */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Вакансия</label>
        <div className="flex gap-1 border-b mb-1">
          <button type="button" className={tabCls('url')} onClick={() => setVacancyTab('url')} disabled={loading}>
            URL (hh.ru)
          </button>
          <button type="button" className={tabCls('text')} onClick={() => setVacancyTab('text')} disabled={loading}>
            Текст
          </button>
        </div>

        {vacancyTab === 'url' && (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="url"
                placeholder="https://hh.ru/vacancy/..."
                value={vacancyUrl}
                onChange={(e) => { setVacancyUrl(e.target.value); setFetchError('') }}
                disabled={loading || fetchingVacancy}
                className="flex h-9 flex-1 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleFetchVacancy}
                disabled={!vacancyUrl.trim() || fetchingVacancy || loading}
              >
                {fetchingVacancy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
                {fetchingVacancy ? 'Загружаем...' : 'Загрузить'}
              </Button>
            </div>
            {fetchError && <p className="text-xs text-red-500">{fetchError}</p>}
          </div>
        )}

        {vacancyTab === 'text' && (
          <Textarea
            placeholder="Вставьте полный текст вакансии..."
            value={vacancyText}
            onChange={(e) => setVacancyText(e.target.value)}
            rows={6}
            disabled={loading}
            className="resize-none text-xs"
          />
        )}

        {vacancyTab === 'url' && vacancyText && (
          <p className="text-xs text-green-600">✓ Текст загружен — переключитесь на «Текст»</p>
        )}
      </div>

      {/* Resume upload */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">Резюме кандидатов (PDF)</label>
        <label className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input px-4 py-8 cursor-pointer hover:border-primary/50 transition-colors">
          <input
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            disabled={loading}
            onChange={(e) => handleFiles(e.target.files)}
          />
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Нажмите или перетащите PDF</p>
          <p className="text-xs text-muted-foreground">Можно выбрать несколько · макс. 20</p>
        </label>

        {candidates.length > 0 && (
          <ul className="flex flex-col gap-1">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  {c.status === 'parsing' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  {c.status === 'ready'   && <span className="text-green-500 text-xs font-bold">✓</span>}
                  {c.status === 'error'   && <span className="text-red-500 text-xs font-bold">✗</span>}
                  <a href={c.url} target="_blank" rel="noopener noreferrer"
                    className={`underline hover:no-underline ${c.status === 'error' ? 'text-red-500' : ''}`}>
                    {c.name}
                  </a>
                </span>
                <button type="button" onClick={() => removeCandidate(c.id)} disabled={loading}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50">
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={!canSubmit} className="flex-1">
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {loading
            ? 'Анализируем...'
            : readyCount > 0
              ? `Анализировать ${readyCount} кандидат${readyCount === 1 ? 'а' : 'ов'}`
              : 'Загрузите резюме'}
        </Button>
        {done && (
          <Button type="button" variant="outline" onClick={handleReset}>Сбросить</Button>
        )}
      </div>
    </form>
  )
}
