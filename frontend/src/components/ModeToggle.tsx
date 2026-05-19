type AppMode = 'seeker' | 'hr'

interface Props {
  mode: AppMode
  onChange: (m: AppMode) => void
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex rounded-md border overflow-hidden text-sm">
      <button
        onClick={() => onChange('seeker')}
        className={[
          'px-3 py-1.5 transition-colors',
          mode === 'seeker' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        ].join(' ')}
      >
        Соискатель
      </button>
      <button
        onClick={() => onChange('hr')}
        className={[
          'px-3 py-1.5 transition-colors border-l',
          mode === 'hr' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
        ].join(' ')}
      >
        HR
      </button>
    </div>
  )
}
