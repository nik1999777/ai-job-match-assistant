import { useState } from 'react'
import { ChevronDown, ChevronUp, FileText, Pencil } from 'lucide-react'

interface TextContentCardProps {
  label: string
  text: string
  disabled?: boolean
  /** If provided, shows an "Редактировать" button. Omit for read-only display. */
  onEdit?: () => void
}

const PREVIEW_CHARS = 400

export function TextContentCard({ label, text, disabled, onEdit }: TextContentCardProps) {
  const [expanded, setExpanded] = useState(false)

  const charCount = text.length
  const preview = text.slice(0, PREVIEW_CHARS)
  const hasMore = text.length > PREVIEW_CHARS

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="flex-1 text-sm font-medium text-foreground">{label}</span>
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
        Предпросмотр
      </button>

      {expanded && (
        <div className="rounded border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground max-h-44 overflow-y-auto whitespace-pre-wrap">
          {preview}
          {hasMore && (
            <span className="text-muted-foreground"> …ещё {(text.length - PREVIEW_CHARS).toLocaleString('ru-RU')} симв.</span>
          )}
        </div>
      )}

      {/* Edit button — only in form mode */}
      {onEdit && (
        <button
          type="button"
          disabled={disabled}
          onClick={onEdit}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline transition-colors disabled:opacity-50 self-start"
        >
          <Pencil className="h-3 w-3" />
          Редактировать
        </button>
      )}
    </div>
  )
}
