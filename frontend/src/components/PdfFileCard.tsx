import { useRef } from 'react'
import { FileText } from 'lucide-react'

interface PdfFileCardProps {
  fileName: string
  fileUrl: string | null
  disabled?: boolean
  onReplace: (file: File) => void
}

export function PdfFileCard({ fileName, fileUrl, disabled, onReplace }: PdfFileCardProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 flex items-center gap-2">
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

      {fileUrl ? (
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 text-sm font-medium truncate hover:underline text-foreground"
        >
          {fileName}
        </a>
      ) : (
        <span className="flex-1 text-sm font-medium truncate">{fileName}</span>
      )}

      <span className="text-xs font-medium text-green-600 shrink-0">✓</span>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onReplace(f)
          e.target.value = ''
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="text-xs text-muted-foreground hover:text-foreground underline transition-colors disabled:opacity-50 shrink-0"
      >
        Изменить
      </button>
    </div>
  )
}
