import { useMutation } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'

interface AuthPayload {
  email: string
  password: string
}

interface TokenResponse {
  access_token: string
  user_id: number
  email: string
}

async function authRequest(endpoint: string, payload: AuthPayload): Promise<TokenResponse> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(err.detail ?? resp.statusText)
  }
  return resp.json()
}

export function useRegister() {
  const login = useAuthStore((s) => s.login)
  return useMutation({
    mutationFn: (payload: AuthPayload) => authRequest('/auth/register', payload),
    onSuccess: (data) => login(data.access_token, data.user_id, data.email),
  })
}

export function useLogin() {
  const login = useAuthStore((s) => s.login)
  return useMutation({
    mutationFn: (payload: AuthPayload) => authRequest('/auth/login', payload),
    onSuccess: (data) => login(data.access_token, data.user_id, data.email),
  })
}
