import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  token: string | null
  userId: number | null
  email: string | null
}

interface AuthActions {
  login: (token: string, userId: number, email: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set) => ({
      token: null,
      userId: null,
      email: null,
      login: (token, userId, email) => set({ token, userId, email }),
      logout: () => set({ token: null, userId: null, email: null }),
    }),
    { name: 'auth' },
  ),
)

// Утилита — берём токен вне React компонентов (для fetch в streaming.ts)
export function getToken(): string | null {
  return useAuthStore.getState().token
}
