import { useState } from 'react'
import { Loader2, Upload, X } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'
import { parseResumeApiParseResumePost } from '../api/generated'
import { useBatchAnalyze } from '../hooks/useBatchAnalyze'
import { CandidateTable } from './CandidateTable'

interface Candidate {
  id: string
  name: string
  text: string
  status: 'parsing' | 'ready' | 'error'
}

export function BatchForm() {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [vacancyText, setVacancyText] = useState('')
  const { analyze, reset, status, results, error } = useBatchAnalyze()
  const loading = status === 'loading'

  async function handleFiles(files: FileList | null) {
    if (!files) return

    const incoming: Candidate[] = Array.from(files).map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      name: f.name.replace(/\.pdf$/i, ''),
      text: '',
      status: 'parsing',
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const ready = candidates.filter((c) => c.status === 'ready')
    if (!ready.length || !vacancyText.trim()) return
    analyze({
      vacancy: vacancyText.trim(),
      resumes: ready.map((c) => ({ candidate_id: c.id, resume: c.text })),
    })
  }

  function handleReset() {
    setCandidates([])
    setVacancyText('')
    reset()
  }

  const readyCount = candidates.filter((c) => c.status === 'ready').length
  const canSubmit = readyCount > 0 && vacancyText.trim().length > 0 && !loading

  // Build name map for results table
  const nameMap = Object.fromEntries(candidates.map((c) => [c.id, c.name]))

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Vacancy */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium">Текст вакансии</label>
          <Textarea
            placeholder="Вставьте полный текст вакансии..."
            value={vacancyText}
            onChange={(e) => setVacancyText(e.target.value)}
            rows={6}
            disabled={loading}
            className="resize-none text-xs"
          />
        </div>

        {/* Multi-resume upload */}
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
            <p className="text-xs text-muted-foreground">Можно выбрать сразу несколько файлов · макс. 20</p>
          </label>

          {candidates.length > 0 && (
            <ul className="flex flex-col gap-1">
              {candidates.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    {c.status === 'parsing' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    {c.status === 'ready' && <span className="text-green-500 text-xs font-bold">✓</span>}
                    {c.status === 'error' && <span className="text-red-500 text-xs font-bold">✗</span>}
                    <span className={c.status === 'error' ? 'text-red-500' : ''}>{c.name}</span>
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
                ? `Анализировать ${readyCount} кандидат${readyCount === 1 ? 'а' : readyCount < 5 ? 'ов' : 'ов'}`
                : 'Загрузите резюме'}
          </Button>
          {(status === 'done' || status === 'error') && (
            <Button type="button" variant="outline" onClick={handleReset}>
              Сбросить
            </Button>
          )}
        </div>
      </form>

      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {results && results.results.length > 0 && (
        <CandidateTable results={results.results} nameMap={nameMap} />
      )}
    </div>
  )
}
