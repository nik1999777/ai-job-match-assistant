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

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
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
            <div className="space-y-2">
              <label className="text-sm font-medium">Я</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole('seeker')}
                  className={[
                    'flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all',
                    role === 'seeker'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-foreground/30',
                  ].join(' ')}
                >
                  <span className="text-base">🔍</span>
                  <span className="text-sm font-medium">Соискатель</span>
                  <span className="text-xs text-muted-foreground">Ищу работу</span>
                </button>
                <button
                  type="button"
                  onClick={() => setRole('hr')}
                  className={[
                    'flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all',
                    role === 'hr'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:border-foreground/30',
                  ].join(' ')}
                >
                  <span className="text-base">📋</span>
                  <span className="text-sm font-medium">HR</span>
                  <span className="text-xs text-muted-foreground">Оцениваю кандидатов</span>
                </button>
              </div>
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
