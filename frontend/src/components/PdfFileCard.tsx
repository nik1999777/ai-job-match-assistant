import { useRef, useState } from 'react'
import { ChevronDown, ChevronUp, FileText } from 'lucide-react'

interface PdfFileCardProps {
  fileName: string
  fileUrl: string | null
  text: string
  disabled?: boolean
  onReplace: (file: File) => void
}

const PREVIEW_CHARS = 400

export function PdfFileCard({ fileName, fileUrl, text, disabled, onReplace }: PdfFileCardProps) {
  const [expanded, setExpanded] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const charCount = text.length
  const preview = text.slice(0, PREVIEW_CHARS)
  const hasMore = text.length > PREVIEW_CHARS

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 flex flex-col gap-2">
      {/* Header: icon + name + count + status */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          {fileUrl ? (
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:underline text-foreground truncate block"
            >
              {fileName}
            </a>
          ) : (
            <span className="text-sm font-medium truncate block">{fileName}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {charCount.toLocaleString('ru-RU')} симв.
        </span>
        <span className="text-xs font-medium text-green-600 shrink-0">✓</span>
      </div>

      {/* Preview accordion */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors self-start"
      >
        {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        Предпросмотр текста
      </button>

      {expanded && (
        <div className="rounded border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground max-h-44 overflow-y-auto whitespace-pre-wrap">
          {preview}
          {hasMore && <span className="text-muted-foreground"> …ещё {(text.length - PREVIEW_CHARS).toLocaleString('ru-RU')} симв.</span>}
        </div>
      )}

      {/* Replace file */}
      <div>
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onReplace(f)
            // reset so same file can be re-selected
            e.target.value = ''
          }}
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          className="text-xs text-muted-foreground hover:text-foreground underline transition-colors disabled:opacity-50"
        >
          Загрузить другой файл
        </button>
      </div>
    </div>
  )
}
