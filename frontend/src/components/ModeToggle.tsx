type AppMode = 'seeker' | 'search' | 'hr'

interface Props {
  mode: AppMode
  onChange: (m: AppMode) => void
}

const TABS: { id: AppMode; label: string }[] = [
  { id: 'seeker', label: 'Анализ 1:1' },
  { id: 'search', label: 'Поиск работы' },
  { id: 'hr',     label: 'HR' },
]

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex rounded-md border overflow-hidden text-sm">
      {TABS.map((tab, i) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={[
            'px-3 py-1.5 transition-colors',
            i > 0 ? 'border-l' : '',
            mode === tab.id
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground',
          ].join(' ')}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
