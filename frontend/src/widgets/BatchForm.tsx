import { useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { TextContentCard } from '../components/TextContentCard'
// Button used below for submit/reset
import { parseResumeApiParseResumePost } from '../api/generated'
import type { BatchRequest } from '../api/generated'

interface Candidate {
  id: string
  name: string
  text: string
  status: 'parsing' | 'ready' | 'error'
  url: string
}

interface Props {
  loading: boolean
  done: boolean
  onAnalyze: (request: BatchRequest, nameMap: Record<string, string>) => void
  onReset: () => void
}

export function BatchForm({ loading, done, onAnalyze, onReset }: Props) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
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
    setFetchError('')
    onReset()
  }

  const readyCount = candidates.filter((c) => c.status === 'ready').length
  const canSubmit = readyCount > 0 && vacancyText.trim().length > 0 && !loading

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">

      {/* ── Vacancy (URL → fetch → card) ── */}
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Вакансия</label>

        {!vacancyText && (
          <div className="flex flex-col gap-1.5">
            <div className="relative">
              <input
                type="url"
                placeholder="https://hh.ru/vacancy/..."
                value={vacancyUrl}
                onChange={(e) => { setVacancyUrl(e.target.value); setFetchError('') }}
                onBlur={handleFetchVacancy}
                disabled={loading || fetchingVacancy}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 pr-8"
              />
              {fetchingVacancy && (
                <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>
            {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}
          </div>
        )}

        {vacancyText && (
          <TextContentCard
            label="Вакансия загружена"
            text={vacancyText}
            onEdit={() => { setVacancyText(''); setFetchError('') }}
          />
        )}
      </div>

      {/* ── Candidate PDFs ── */}
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
          <p className="text-xs text-muted-foreground/60">Можно выбрать несколько · макс. 20</p>
        </label>

        {candidates.length > 0 && (
          <ul className="flex flex-col gap-1">
            {candidates.map((c) => (
              <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  {c.status === 'parsing' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  {c.status === 'ready'   && <span className="text-green-600 text-xs font-bold">✓</span>}
                  {c.status === 'error'   && <span className="text-destructive text-xs font-bold">✗</span>}
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`hover:underline ${c.status === 'error' ? 'text-destructive' : ''}`}
                  >
                    {c.name}
                  </a>
                </span>
                <button
                  type="button"
                  onClick={() => removeCandidate(c.id)}
                  disabled={loading}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
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
