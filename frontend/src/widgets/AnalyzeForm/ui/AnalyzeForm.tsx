import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  onSubmit: (resume: string, vacancyUrl: string) => void
  onReset: () => void
  loading: boolean
  done: boolean
}

export function AnalyzeForm({ onSubmit, onReset, loading, done }: Props) {
  const [resume, setResume] = useState('')
  const [vacancyUrl, setVacancyUrl] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (resume.trim() && vacancyUrl.trim()) {
      onSubmit(resume.trim(), vacancyUrl.trim())
    }
  }

  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Analysis complete.</p>
        <Button variant="outline" onClick={onReset}>
          Analyze another
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Resume</label>
        <Textarea
          placeholder="Paste your resume text here..."
          value={resume}
          onChange={e => setResume(e.target.value)}
          rows={14}
          disabled={loading}
          className="resize-none font-mono text-xs"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium">Vacancy URL</label>
        <input
          type="url"
          placeholder="https://hh.ru/vacancy/..."
          value={vacancyUrl}
          onChange={e => setVacancyUrl(e.target.value)}
          disabled={loading}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
        />
      </div>

      <Button type="submit" disabled={loading || !resume.trim() || !vacancyUrl.trim()}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Analyzing...' : 'Analyze match'}
      </Button>
    </form>
  )
}
