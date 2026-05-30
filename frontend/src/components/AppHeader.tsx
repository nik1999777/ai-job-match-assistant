import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../store/authStore'

type AppMode = 'seeker' | 'search' | 'hr' | 'history'

interface Props {
  mode: AppMode
  onModeChange: (mode: AppMode) => void
}

const SEEKER_TABS: { id: Exclude<AppMode, 'history'>; label: string }[] = [
  { id: 'seeker', label: 'Анализ резюме' },
  { id: 'search', label: 'Поиск работы' },
]

const HR_TABS: { id: Exclude<AppMode, 'history'>; label: string }[] = [
  { id: 'seeker', label: 'Оценка кандидата' },
  { id: 'hr',     label: 'Скрининг резюме' },
]

export function AppHeader({ mode, onModeChange }: Props) {
  const { email, role, logout } = useAuthStore()
  const tabs = role === 'hr' ? HR_TABS : SEEKER_TABS
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const initial = email?.[0]?.toUpperCase() ?? '?'

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onOutsideClick)
    return () => document.removeEventListener('mousedown', onOutsideClick)
  }, [])

  return (
    <header className="sticky top-0 z-40 h-14 border-b bg-background/95 backdrop-blur flex items-center px-6 gap-6">
      <span className="font-semibold text-sm shrink-0">AI Job Match</span>

      <div className="h-4 w-px bg-border shrink-0" />

      <nav className="flex items-center gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onModeChange(tab.id)}
            className={[
              'px-3 py-1.5 text-sm rounded-md transition-colors',
              mode === tab.id
                ? 'bg-primary text-primary-foreground font-medium'
                : 'text-muted-foreground hover:text-foreground hover:bg-accent',
            ].join(' ')}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {email && (
        <div className="ml-auto relative" ref={menuRef}>
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent transition-colors"
          >
            <span className="w-7 h-7 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center shrink-0">
              {initial}
            </span>
            <span className="text-sm text-muted-foreground max-w-40 truncate hidden sm:block">
              {email}
            </span>
            <svg className="w-3.5 h-3.5 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div className="absolute right-0 top-full mt-1 w-52 bg-popover border rounded-lg shadow-lg py-1 z-50">
              <div className="px-3 py-2 border-b">
                <p className="text-xs text-muted-foreground truncate">{email}</p>
              </div>
              <button
                onClick={() => { setOpen(false); onModeChange('history') }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                История анализов
              </button>
              <div className="border-t my-1" />
              <button
                onClick={() => { setOpen(false); logout() }}
                className="w-full text-left px-3 py-2 text-sm text-destructive hover:bg-accent transition-colors flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Выйти
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  )
}
