import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Role = 'seeker' | 'hr'

interface AuthState {
  token: string | null
  userId: number | null
  email: string | null
  role: Role | null
}

interface AuthActions {
  login: (token: string, userId: number, email: string, role: Role) => void
  logout: () => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      email: null,
      role: null,
      login: (token, userId, email, role) => set({ token, userId, email, role }),
      logout: () => set({ token: null, userId: null, email: null, role: null }),
    }),
    { name: 'auth' },
  ),
)

// Утилиты — доступ к стору вне React компонентов (для fetch в streaming.ts)
export function getToken(): string | null {
  return useAuthStore.getState().token
}

export function getRole(): 'seeker' | 'hr' {
  return useAuthStore.getState().role ?? 'seeker'
}
