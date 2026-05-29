import { FileText, Pencil } from 'lucide-react'

interface TextContentCardProps {
  label: string
  text: string
  disabled?: boolean
  /** If provided, shows an "Редактировать" button. Omit for read-only display. */
  onEdit?: () => void
}

export function TextContentCard({ label, text, disabled, onEdit }: TextContentCardProps) {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-2">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm font-medium text-foreground truncate">{label}</span>
      <span className="text-xs text-muted-foreground shrink-0">
        {text.length.toLocaleString('ru-RU')} симв.
      </span>
      <span className="text-xs font-medium text-green-600 shrink-0">✓</span>
      {onEdit && (
        <button
          type="button"
          disabled={disabled}
          onClick={onEdit}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
          title="Изменить"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  )
}
