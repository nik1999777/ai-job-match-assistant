import { useState } from 'react'
import { useLogin, useRegister } from '../hooks/useAuth'
import { Button } from '../components/ui/button'

interface Props {
  onSuccess: () => void
}

export function AuthPage({ onSuccess }: Props) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'seeker' | 'hr'>('seeker')

  const login = useLogin()
  const register = useRegister()
  const mutation = tab === 'login' ? login : register
  const error = mutation.error?.message

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault()
    const payload = tab === 'register' ? { email, password, role } : { email, password }
    await mutation.mutateAsync(payload as Parameters<typeof mutation.mutateAsync>[0])
    onSuccess()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-xl shadow-sm bg-card">

        <div>
          <h1 className="text-2xl font-bold">AI Job Match</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tab === 'login' ? 'С возвращением' : 'Создайте аккаунт'}
          </p>
        </div>

        {/* Login / Register tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${
                tab === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'login' ? 'Войти' : 'Регистрация'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">

          {/* Role picker — только при регистрации */}
          {tab === 'register' && (
            <div className="grid grid-cols-2 gap-2">
              {([
                {
                  value: 'seeker', label: 'Соискатель', sub: 'Ищу работу',
                  icon: (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
                    </svg>
                  ),
                },
                {
                  value: 'hr', label: 'HR', sub: 'Оцениваю кандидатов',
                  icon: (
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  ),
                },
              ] as const).map(({ value, label, sub, icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRole(value)}
                  className={[
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-left transition-all',
                    role === value
                      ? 'border-foreground bg-accent text-foreground'
                      : 'border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground',
                  ].join(' ')}
                >
                  {icon}
                  <div>
                    <p className="text-sm font-medium leading-none">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-sm font-medium">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">Пароль</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••"
              className="w-full px-3 py-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending
              ? '...'
              : tab === 'login' ? 'Войти' : 'Создать аккаунт'}
          </Button>
        </form>
      </div>
    </div>
  )
}
