import { useRef, useState } from 'react'
import { Textarea } from '@/components/ui/textarea'

type Tab = 'text' | 'hh' | 'pdf'

interface Props {
  value: string
  onChange: (text: string) => void
  onResumeUrl: (url: string) => void
  resumeUrl: string
  disabled: boolean
}

export function ResumeInput({ value, onChange, onResumeUrl, resumeUrl, disabled }: Props) {
  const [tab, setTab] = useState<Tab>('text')
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [pdfName, setPdfName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  async function handlePdf(file: File) {
    setPdfStatus('loading')
    setPdfName(file.name)
    const form = new FormData()
    form.append('file', file)
    try {
      const res = await fetch('http://localhost:8000/api/parse-resume', { method: 'POST', body: form })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }))
        throw new Error(err.detail ?? res.statusText)
      }
      const { text } = await res.json()
      onChange(text)
      setPdfStatus('done')
    } catch {
      setPdfStatus('error')
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'text', label: 'Текст' },
    { id: 'hh',   label: 'hh.ru профиль' },
    { id: 'pdf',  label: 'PDF' },
  ]

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-1 border-b">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            disabled={disabled}
            className={[
              'px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.id
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'text' && (
        <Textarea
          placeholder="Вставьте текст резюме..."
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={12}
          disabled={disabled}
          className="resize-none font-mono text-xs"
        />
      )}

      {tab === 'hh' && (
        <div className="flex flex-col gap-2">
          <input
            type="url"
            placeholder="https://hh.ru/resume/..."
            value={resumeUrl}
            onChange={e => onResumeUrl(e.target.value)}
            disabled={disabled}
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
          />
          <p className="text-xs text-muted-foreground">
            Ссылка на публичное резюме — страница будет открыта через Playwright
          </p>
        </div>
      )}

      {tab === 'pdf' && (
        <div
          onClick={() => !disabled && fileRef.current?.click()}
          className="flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-input px-4 py-10 cursor-pointer hover:border-primary/50 transition-colors"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            className="hidden"
            disabled={disabled}
            onChange={e => { const f = e.target.files?.[0]; if (f) handlePdf(f) }}
          />
          {pdfStatus === 'idle' && (
            <p className="text-sm text-muted-foreground">Нажмите чтобы выбрать PDF</p>
          )}
          {pdfStatus === 'loading' && (
            <p className="text-sm text-muted-foreground">Читаем {pdfName}…</p>
          )}
          {pdfStatus === 'done' && (
            <p className="text-sm text-green-600">✓ {pdfName} — текст извлечён</p>
          )}
          {pdfStatus === 'error' && (
            <p className="text-sm text-red-500">Ошибка парсинга — попробуйте другой PDF</p>
          )}
        </div>
      )}
    </div>
  )
}
