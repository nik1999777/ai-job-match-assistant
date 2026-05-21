import { useState } from 'react'
import { useLogin, useRegister } from '../hooks/useAuth'
import { Button } from '../components/ui/button'
import { Textarea } from '../components/ui/textarea'

interface Props {
  onSuccess: () => void
}

export function AuthPage({ onSuccess }: Props) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const login = useLogin()
  const register = useRegister()

  const mutation = tab === 'login' ? login : register
  const error = mutation.error?.message

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    await mutation.mutateAsync({ email, password })
    onSuccess()
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-6 p-8 border rounded-xl shadow-sm bg-card">
        <div>
          <h1 className="text-2xl font-bold">AI Job Match Assistant</h1>
          <p className="text-sm text-muted-foreground mt-1">Sign in to track your analysis history</p>
        </div>

        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(['login', 'register'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-1.5 text-sm rounded-md font-medium transition-colors ${
                tab === t ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'login' ? 'Sign In' : 'Register'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
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
            <label className="text-sm font-medium">Password</label>
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

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending
              ? (tab === 'login' ? 'Signing in…' : 'Creating account…')
              : (tab === 'login' ? 'Sign In' : 'Create Account')}
          </Button>
        </form>
      </div>
    </div>
  )
}
